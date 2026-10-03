import { requireAuth } from './_lib/auth.mjs';
import { Client } from 'pg';
import { bodyObject, positiveId, requiredText, performedBy as getPerformedBy, closeClient } from './_lib/validation.mjs';

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
      const result = await client.query('SELECT * FROM projects ORDER BY name ASC');
      return res.status(200).json(result.rows);
    }

    if (req.method === 'POST') {
      const body = bodyObject(req.body);
      const name = requiredText(body.name, 'name');
      if (!name || name.trim() === '') {
        return res.status(400).send('Project name is required');
      }

      const result = await client.query(
        'INSERT INTO projects (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
        [name.trim()]
      );

      const auditDesc = `נוצר פרויקט חדש: "${name.trim()}"`;
      await client.query(
        'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
        [performedBy, 'הוספה', 'פרויקט', auditDesc]
      );

      await client.query('COMMIT'); inTransaction = false;
      return res.status(201).json(result.rows[0]);
    }

    if (req.method === 'DELETE') {
      const id = positiveId(req.query?.id);
      if (!id) {
        return res.status(400).send('Project ID is required');
      }

      const selectRes = await client.query('SELECT name FROM projects WHERE id = $1', [id]);
      if (selectRes.rows.length === 0) {
        return res.status(404).send('Project not found');
      }
      const name = selectRes.rows[0].name;

      await client.query('DELETE FROM projects WHERE id = $1', [id]);

      const auditDesc = `מחק את הפרויקט: "${name}"`;
      await client.query(
        'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4)',
        [performedBy, 'מחיקה', 'פרויקט', auditDesc]
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
