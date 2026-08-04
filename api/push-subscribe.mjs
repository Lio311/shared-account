import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_7gt0IRDvYAJW@ep-hidden-smoke-apxqgfzb-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const subscription = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Upsert subscription based on endpoint
    await client.query(`
      INSERT INTO push_subscriptions (endpoint, keys)
      VALUES ($1, $2)
      ON CONFLICT (endpoint) DO UPDATE 
      SET keys = EXCLUDED.keys, created_at = NOW();
    `, [subscription.endpoint, subscription.keys]);
    
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error saving subscription:', err);
    return res.status(500).json({ error: 'Failed to save subscription' });
  } finally {
    await client.end();
  }
}
