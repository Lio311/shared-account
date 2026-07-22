import { Client } from 'pg';

export default async function handler(req, res) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_7gt0IRDvYAJW@ep-hidden-smoke-apxqgfzb-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require',
  });

  try {
    await client.connect();

    if (req.method === 'GET') {
      const result = await client.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500');
      return res.status(200).json(result.rows);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { performed_by, action_type, record_type, description } = body;
      
      if (!performed_by || !action_type || !record_type || !description) {
        return res.status(400).send('Missing required fields');
      }

      const result = await client.query(
        'INSERT INTO audit_logs (performed_by, action_type, record_type, description) VALUES ($1, $2, $3, $4) RETURNING *',
        [performed_by, action_type, record_type, description]
      );
      
      return res.status(201).json(result.rows[0]);
    }

    return res.status(405).send('Method Not Allowed');
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
