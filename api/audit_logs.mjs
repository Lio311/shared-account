import { requireAuth } from './_lib/auth.mjs';
import { Client } from 'pg';
import { bodyObject, requiredText, closeClient } from './_lib/validation.mjs';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  let inTransaction = false;
  try {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) return res.status(405).send('Method Not Allowed');
    if (['POST', 'PUT'].includes(req.method)) req.body = bodyObject(req.body);
    await client.connect();
    if (req.method !== 'GET') { await client.query('BEGIN'); inTransaction = true; }

    if (req.method === 'GET') {
      const result = await client.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500');
      return res.status(200).json(result.rows);
    }

    if (req.method === 'POST') {
      const body = bodyObject(req.body);
      const performed_by = req.auth.person;
      const action_type = requiredText(body.action_type, 'action_type');
      const record_type = requiredText(body.record_type, 'record_type');
      const description = requiredText(body.description, 'description', 2000);
      
      if (!performed_by || !action_type || !record_type || !description) {
        return res.status(400).send('Missing required fields');
      }

      const result = await client.query(
        'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4) RETURNING *',
        [performed_by, action_type, record_type, description]
      );
      
      await client.query('COMMIT'); inTransaction = false;
      return res.status(201).json(result.rows[0]);
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
