import { requireAuth } from './_lib/auth.mjs';
import { Client } from 'pg';
import { HttpError, bodyObject, finiteNumber, positiveId, requiredText, performedBy as getPerformedBy, closeClient } from './_lib/validation.mjs';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  const performedBy = getPerformedBy(req);

  let inTransaction = false;
  try {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) return res.status(405).send('Method Not Allowed');
    if (['POST', 'PUT'].includes(req.method)) req.body = bodyObject(req.body);
    await client.connect();
    if (req.method !== 'GET') { await client.query('BEGIN'); inTransaction = true; }

    if (req.method === 'GET') {
      const result = await client.query('SELECT * FROM investments ORDER BY owner_name ASC, name ASC');
      let primeRate = null;
      let fetchedPrime = false;
      
      const investments = result.rows;
      
      for (let inv of investments) {
        if (inv.interest_type === 'prime') {
          if (!fetchedPrime) {
            try {
              const boiRes = await fetch('https://boi.org.il/PublicApi/GetInterest', { signal: AbortSignal.timeout(8000) });
              const data = await boiRes.json();
              if (!boiRes.ok || !Number.isFinite(Number(data.currentInterest))) throw new Error('Prime rate unavailable');
              primeRate = Number(data.currentInterest) + 1.5;
            } catch (e) { console.error('Error fetching prime rate:', e); }
            fetchedPrime = true;
          }
          if (primeRate === null) { inv.valuation_status = 'rate_unavailable'; continue; }
          inv.current_interest_rate = primeRate + parseFloat(inv.interest_value || 0);
        } else if (inv.interest_type === 'fixed') {
          inv.current_interest_rate = parseFloat(inv.interest_value || 0);
        }
        
        // Calculate accrued live value for deposits
        if (inv.type === 'פיקדון' && inv.current_interest_rate !== undefined) {
          const r = inv.current_interest_rate / 100;
          const lastUpdate = new Date(inv.last_value_update);
          const now = new Date();
          if (!inv.last_value_update || !Number.isFinite(lastUpdate.getTime())) { inv.valuation_status = 'invalid_update_date'; continue; }
          
          const yearsElapsed = Math.max(0, (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
          
          let monthsElapsed = (now.getFullYear() - lastUpdate.getFullYear()) * 12 + (now.getMonth() - lastUpdate.getMonth());
          const anniversary = new Date(lastUpdate);
          anniversary.setDate(1);
          anniversary.setMonth(lastUpdate.getMonth() + monthsElapsed);
          const lastDayThisMonth = new Date(anniversary.getFullYear(), anniversary.getMonth() + 1, 0).getDate();
          anniversary.setDate(Math.min(lastUpdate.getDate(), lastDayThisMonth));
          if (now < anniversary) monthsElapsed--;
          monthsElapsed = Math.max(0, monthsElapsed);
          
          const p = parseFloat(inv.current_value || 0);
          const accruedBase = p * Math.pow(1 + r/365.25, yearsElapsed * 365.25);
          
          const monthlyAdd = parseFloat(inv.monthly_addition || 0);
          let totalAdditions = 0;
          if (monthlyAdd > 0 && monthsElapsed > 0) {
            for (let i = 1; i <= monthsElapsed; i++) {
              const additionDate = new Date(lastUpdate);
              const targetMonth = lastUpdate.getMonth() + i;
              additionDate.setDate(1);
              additionDate.setMonth(targetMonth);
              const lastDay = new Date(additionDate.getFullYear(), additionDate.getMonth() + 1, 0).getDate();
              additionDate.setDate(Math.min(lastUpdate.getDate(), lastDay));
              const yearsSinceAddition = Math.max(0, (now.getTime() - additionDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
              totalAdditions += monthlyAdd * Math.pow(1 + r/365.25, yearsSinceAddition * 365.25);
            }
          }
          
          inv.current_value = (accruedBase + totalAdditions).toFixed(2);
        }
      }

      return res.status(200).json(investments);
    }

    if (req.method === 'POST') {
      const body = bodyObject(req.body);
      const { owner_name, name, type, current_value, initial_value, monthly_addition, interest_type, interest_value } = validateInvestment(body);

      if (!owner_name || !name || !type) {
        return res.status(400).send('Missing required fields (owner_name, name, type)');
      }

      const result = await client.query(
        `INSERT INTO investments (owner_name, name, type, current_value, initial_value, monthly_addition, interest_type, interest_value, last_value_update)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
        [owner_name, name.trim(), type.trim(), parseFloat(current_value) || 0, parseFloat(initial_value) || 0, parseFloat(monthly_addition) || 0, interest_type || null, interest_value === null ? null : interest_value]
      );

      const auditDesc = `הוסיף השקעה חדשה: "${name.trim()}" (${type.trim()}) ל-${owner_name} בשווי ₪${parseFloat(current_value) || 0}`;
      await client.query(
        'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
        [performedBy, 'הוספה', 'השקעה', auditDesc]
      );

      await client.query('COMMIT'); inTransaction = false;
      return res.status(201).json(result.rows[0]);
    }

    if (req.method === 'PUT') {
      const body = bodyObject(req.body);
      const id = positiveId(body.id);
      const only_value_update = body.only_value_update === true;
      const { owner_name, name, type, current_value, initial_value, monthly_addition, interest_type, interest_value } = only_value_update
        ? { current_value: finiteNumber(body.current_value, 'current_value') }
        : validateInvestment(body);

      if (!id) {
        return res.status(400).send('Investment ID is required');
      }

      const exists = await client.query('SELECT id FROM investments WHERE id = $1 FOR UPDATE', [id]);
      if (!exists.rows.length) throw new HttpError(404, 'Investment not found');
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
          [owner_name, name.trim(), type.trim(), newVal, parseFloat(initial_value) || 0, parseFloat(monthly_addition) || 0, interest_type || null, interest_value === null ? null : interest_value, valueChanged, id]
        );

        const auditDesc = `עדכן השקעה "${name.trim()}" (${type.trim()}) של ${owner_name}. שווי: ₪${newVal}, תוספת: ₪${parseFloat(monthly_addition) || 0}`;
        await client.query(
          'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
          [performedBy, 'עריכה', 'השקעה', auditDesc]
        );
      }

      await client.query('COMMIT'); inTransaction = false;
      return res.status(200).json(result.rows[0]);
    }

    if (req.method === 'DELETE') {
      const id = positiveId(req.query?.id);

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

      await client.query('COMMIT'); inTransaction = false;
      return res.status(200).json({ success: true });
    }

    return res.status(405).send('Method Not Allowed');
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Operation failed' });
  } finally {
    if (inTransaction) { try { await client.query('ROLLBACK'); } catch { /* Connection may already be closed. */ } }
    await closeClient(client);
  }
}

function validateInvestment(body) {
  const owner_name = requiredText(body.owner_name, 'owner_name');
  const name = requiredText(body.name, 'name');
  const type = requiredText(body.type, 'type');
  const current_value = finiteNumber(body.current_value, 'current_value', { fallback: 0 });
  const initial_value = finiteNumber(body.initial_value, 'initial_value', { fallback: 0 });
  const monthly_addition = finiteNumber(body.monthly_addition, 'monthly_addition', { fallback: 0 });
  const interest_type = body.interest_type || null;
  if (interest_type !== null && !['fixed', 'prime'].includes(interest_type)) throw new HttpError(400, 'Invalid interest_type');
  const interest_value = body.interest_value == null || body.interest_value === '' ? null : finiteNumber(body.interest_value, 'interest_value', { min: -100 });
  return { owner_name, name, type, current_value, initial_value, monthly_addition, interest_type, interest_value };
}
