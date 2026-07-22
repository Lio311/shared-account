import { Client } from 'pg';

export default async function handler(req, res) {
  let filename = req.query.filename;
  if (!filename) {
    const parts = req.url.split('?')[0].split('/');
    filename = parts[parts.length - 1];
  }

  if (!filename || filename === '[filename].mjs' || filename === 'payslips') {
    return res.status(404).send('Not Found');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_7gt0IRDvYAJW@ep-hidden-smoke-apxqgfzb-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require',
  });

  try {
    await client.connect();
    const dbRes = await client.query('SELECT content_type, data FROM payslips WHERE filename = $1', [filename]);
    if (dbRes.rows.length === 0) {
      return res.status(404).send('Payslip file not found');
    }

    const { content_type, data } = dbRes.rows[0];
    const fileBuffer = Buffer.from(data, 'base64');

    res.setHeader('Content-Type', content_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    return res.status(200).send(fileBuffer);
  } catch (err) {
    console.error('Payslips serving error:', err);
    return res.status(500).send(err.message);
  } finally {
    await client.end();
  }
}
