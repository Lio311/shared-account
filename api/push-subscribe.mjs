import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const subscription = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  if (!subscription || !subscription.endpoint) {
    console.error('Invalid subscription received. req.body type:', typeof req.body, 'req.body:', req.body);
    return res.status(400).json({ 
      error: 'Invalid subscription object',
      receivedBody: req.body,
      typeOfBody: typeof req.body
    });
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
