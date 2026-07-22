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
      const result = await client.query(
        'SELECT t.*, p.name AS project_name FROM transactions t LEFT JOIN projects p ON t.project_id = p.id ORDER BY t.date DESC'
      );
      return res.status(200).json(result.rows);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { amount, description, category, type, date, project_id } = body;
      const txDate = date ? new Date(date).toISOString() : new Date().toISOString();
      const result = await client.query(
        'INSERT INTO transactions (date, amount, description, category, type, project_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [txDate, amount, description, category, type, project_id || null]
      );

      // Audit Log
      let projText = '';
      if (project_id) {
        const projRes = await client.query('SELECT name FROM projects WHERE id = $1', [project_id]);
        if (projRes.rows.length > 0) {
          projText = ` וקושרה לפרויקט "${projRes.rows[0].name}"`;
        }
      }

      const actionText = type === 'income' ? 'הכנסה' : 'הוצאה';
      const auditDesc = `נוספה ${actionText} חדשה: "${description}" על סך ₪${Number(amount).toLocaleString()} בקטגוריית "${category}"${projText}`;
      await client.query(
        'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
        [performedBy, 'הוספה', 'עסקה', auditDesc]
      );

      const returnTx = result.rows[0];
      if (project_id) {
        const projRes = await client.query('SELECT name FROM projects WHERE id = $1', [project_id]);
        if (projRes.rows.length > 0) {
          returnTx.project_name = projRes.rows[0].name;
        }
      }

      return res.status(201).json(returnTx);
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { id, amount, description, category, type, date, project_id } = body;
      if (!id) {
        return res.status(400).send('Missing transaction ID');
      }

      const oldResult = await client.query('SELECT * FROM transactions WHERE id = $1', [id]);
      const oldTx = oldResult.rows[0];

      const txDate = date ? new Date(date).toISOString() : new Date().toISOString();
      const result = await client.query(
        'UPDATE transactions SET date = $1, amount = $2, description = $3, category = $4, type = $5, project_id = $6 WHERE id = $7 RETURNING *',
        [txDate, amount, description, category, type, project_id || null, id]
      );

      // Audit Log
      if (oldTx) {
        let changes = [];
        if (oldTx.description !== description) changes.push(`תיאור (מ"${oldTx.description}" ל"${description}")`);
        if (Number(oldTx.amount) !== Number(amount)) changes.push(`סכום (מ-₪${Number(oldTx.amount).toLocaleString()} ל-₪${Number(amount).toLocaleString()})`);
        if (oldTx.category !== category) changes.push(`קטגוריה (מ"${oldTx.category}" ל"${category}")`);
        if (oldTx.type !== type) changes.push(`סוג (מ"${oldTx.type === 'income' ? 'הכנסה' : 'הוצאה'}" ל"${type === 'income' ? 'הכנסה' : 'הוצאה'}")`);
        
        const oldPid = oldTx.project_id ? parseInt(oldTx.project_id) : null;
        const newPid = project_id ? parseInt(project_id) : null;
        if (oldPid !== newPid) {
          const oldProjName = oldPid ? (await client.query('SELECT name FROM projects WHERE id = $1', [oldPid])).rows[0]?.name : 'ללא פרויקט';
          const newProjName = newPid ? (await client.query('SELECT name FROM projects WHERE id = $1', [newPid])).rows[0]?.name : 'ללא פרויקט';
          changes.push(`פרויקט (מ"${oldProjName}" ל"${newProjName}")`);
        }

        const auditDesc = changes.length > 0
          ? `עודכנה עסקה "${description}": ${changes.join(', ')}`
          : `עודכנה עסקה "${description}" ללא שינוי בפרטים`;

        await client.query(
          'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
          [performedBy, 'עריכה', 'עסקה', auditDesc]
        );
      }

      const returnTx = result.rows[0];
      if (project_id) {
        const projRes = await client.query('SELECT name FROM projects WHERE id = $1', [project_id]);
        if (projRes.rows.length > 0) {
          returnTx.project_name = projRes.rows[0].name;
        }
      }

      return res.status(200).json(returnTx);
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) {
        return res.status(400).send('Missing transaction ID');
      }

      const oldResult = await client.query('SELECT * FROM transactions WHERE id = $1', [id]);
      const oldTx = oldResult.rows[0];

      await client.query('DELETE FROM transactions WHERE id = $1', [id]);

      if (oldTx) {
        const actionText = oldTx.type === 'income' ? 'הכנסה' : 'הוצאה';
        const auditDesc = `נמחקה ${actionText}: "${oldTx.description}" על סך ₪${Number(oldTx.amount).toLocaleString()} מקטגוריית "${oldTx.category}"`;
        await client.query(
          'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
          [performedBy, 'מחיקה', 'עסקה', auditDesc]
        );
      }

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
