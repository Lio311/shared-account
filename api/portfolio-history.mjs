import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_7gt0IRDvYAJW@ep-hidden-smoke-apxqgfzb-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const investmentId = req.query.investment_id;
  if (!investmentId) {
    return res.status(400).json({ error: 'Missing investment_id' });
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();

    // Create table if it doesn't exist just to be safe
    await client.query(`
      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id SERIAL PRIMARY KEY,
        investment_id INTEGER REFERENCES investments(id) ON DELETE CASCADE,
        total_value_ils NUMERIC NOT NULL,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        UNIQUE(investment_id, date)
      )
    `);

    const result = await client.query(
      `SELECT date, total_value_ils FROM portfolio_snapshots WHERE investment_id = $1 ORDER BY date ASC`,
      [investmentId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('History API Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
