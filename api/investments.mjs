import { Client } from 'pg';

export default async function handler(req, res) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_7gt0IRDvYAJW@ep-hidden-smoke-apxqgfzb-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require',
  });

  const rawPerformedBy = req.headers['x-performed-by'] || 'מערכת';
  const performedBy = decodeURIComponent(rawPerformedBy);

  try {
    await client.connect();

    if (req.method === 'GET') {
      const result = await client.query('SELECT * FROM investments ORDER BY owner_name ASC, name ASC');
      let primeRate = 0;
      let fetchedPrime = false;
      
      const investments = result.rows;
      
      for (let inv of investments) {
        if (inv.interest_type === 'prime') {
          if (!fetchedPrime) {
            try {
              const boiRes = await fetch('https://boi.org.il/PublicApi/GetInterest');
              const data = await boiRes.json();
              primeRate = data.currentInterest + 1.5;
              fetchedPrime = true;
            } catch (e) { console.error('Error fetching prime rate:', e); }
          }
          inv.current_interest_rate = primeRate + parseFloat(inv.interest_value || 0);
        } else if (inv.interest_type === 'fixed') {
          inv.current_interest_rate = parseFloat(inv.interest_value || 0);
        }
        
        // Calculate accrued live value for deposits
        if (inv.type === 'פיקדון' && inv.current_interest_rate !== undefined) {
          const r = inv.current_interest_rate / 100;
          const lastUpdate = new Date(inv.last_value_update);
          const now = new Date();
          
          const yearsElapsed = Math.max(0, (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
          
          let monthsElapsed = (now.getFullYear() - lastUpdate.getFullYear()) * 12 + (now.getMonth() - lastUpdate.getMonth());
          if (now.getDate() < lastUpdate.getDate()) {
            monthsElapsed--;
          }
          monthsElapsed = Math.max(0, monthsElapsed);
          
          const p = parseFloat(inv.current_value || 0);
          const accruedBase = p * Math.pow(1 + r/365.25, yearsElapsed * 365.25);
          
          const monthlyAdd = parseFloat(inv.monthly_addition || 0);
          let totalAdditions = 0;
          if (monthlyAdd > 0 && monthsElapsed > 0) {
            for (let i = 1; i <= monthsElapsed; i++) {
              const monthsInInvest = monthsElapsed - i + 1;
              totalAdditions += monthlyAdd * Math.pow(1 + r/12, monthsInInvest);
            }
          }
          
          inv.current_value = (accruedBase + totalAdditions).toFixed(2);
        }
      }

      return res.status(200).json(investments);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { owner_name, name, type, current_value, initial_value, monthly_addition, interest_type, interest_value } = body;

      if (!owner_name || !name || !type) {
        return res.status(400).send('Missing required fields (owner_name, name, type)');
      }

      const result = await client.query(
        `INSERT INTO investments (owner_name, name, type, current_value, initial_value, monthly_addition, interest_type, interest_value, last_value_update)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
        [owner_name, name.trim(), type.trim(), parseFloat(current_value) || 0, parseFloat(initial_value) || 0, parseFloat(monthly_addition) || 0, interest_type || null, interest_value ? parseFloat(interest_value) : null]
      );

      const auditDesc = `הוסיף השקעה חדשה: "${name.trim()}" (${type.trim()}) ל-${owner_name} בשווי ₪${parseFloat(current_value) || 0}`;
      await client.query(
        'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
        [performedBy, 'הוספה', 'השקעה', auditDesc]
      );

      return res.status(201).json(result.rows[0]);
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { id, owner_name, name, type, current_value, initial_value, monthly_addition, interest_type, interest_value, only_value_update } = body;

      if (!id) {
        return res.status(400).send('Investment ID is required');
      }

      let result;
      if (only_value_update) {
        result = await client.query(
          `UPDATE investments 
           SET current_value = $1, last_value_update = NOW() 
           WHERE id = $2 RETURNING *`,
          [parseFloat(current_value) || 0, id]
        );

        const auditDesc = `עדכן שווי נוכחי להשקעה "${result.rows[0]?.name}" ל-₪${parseFloat(current_value) || 0}`;
        await client.query(
          'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
          [performedBy, 'עריכה', 'השקעה', auditDesc]
        );
      } else {
        const oldRes = await client.query('SELECT current_value FROM investments WHERE id = $1', [id]);
        const oldVal = oldRes.rows[0] ? parseFloat(oldRes.rows[0].current_value) : 0;
        const newVal = parseFloat(current_value) || 0;
        const valueChanged = oldVal !== newVal;

        result = await client.query(
          `UPDATE investments 
           SET owner_name = $1, name = $2, type = $3, current_value = $4, initial_value = $5, monthly_addition = $6,
               interest_type = $7, interest_value = $8,
               last_value_update = CASE WHEN $9 = true THEN NOW() ELSE last_value_update END
           WHERE id = $10 RETURNING *`,
          [owner_name, name.trim(), type.trim(), newVal, parseFloat(initial_value) || 0, parseFloat(monthly_addition) || 0, interest_type || null, interest_value ? parseFloat(interest_value) : null, valueChanged, id]
        );

        const auditDesc = `עדכן השקעה "${name.trim()}" (${type.trim()}) של ${owner_name}. שווי: ₪${newVal}, תוספת: ₪${parseFloat(monthly_addition) || 0}`;
        await client.query(
          'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
          [performedBy, 'עריכה', 'השקעה', auditDesc]
        );
      }

      return res.status(200).json(result.rows[0]);
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;

      if (!id) {
        return res.status(400).send('Investment ID is required');
      }

      const selectRes = await client.query('SELECT name, owner_name FROM investments WHERE id = $1', [id]);
      if (selectRes.rows.length === 0) {
        return res.status(404).send('Investment not found');
      }
      const { name, owner_name } = selectRes.rows[0];

      await client.query('DELETE FROM investments WHERE id = $1', [id]);

      const auditDesc = `מחק את ההשקעה: "${name}" של ${owner_name}`;
      await client.query(
        'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
        [performedBy, 'מחיקה', 'השקעה', auditDesc]
      );

      return res.status(200).json({ success: true });
    }

    return res.status(405).send('Method Not Allowed');
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
