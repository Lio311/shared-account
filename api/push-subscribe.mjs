import { requireAuth } from './_lib/auth.mjs';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let subscription;
  try { subscription = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
  if (!subscription || typeof subscription.endpoint !== 'string' || !subscription.endpoint.startsWith('https://') || typeof subscription.keys?.auth !== 'string' || typeof subscription.keys?.p256dh !== 'string') return res.status(400).json({ error: 'Invalid subscription object' });

  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    await client.query('ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS person TEXT');
    // Bind each device to its authenticated identity.
    await client.query(`
      INSERT INTO push_subscriptions (endpoint, keys, person)
      VALUES ($1, $2, $3)
      ON CONFLICT (endpoint) DO UPDATE 
      SET keys = EXCLUDED.keys, person = EXCLUDED.person, created_at = NOW();
    `, [subscription.endpoint, subscription.keys, req.auth.person]);
    
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error saving subscription:', err);
    return res.status(500).json({ error: 'Failed to save subscription' });
  } finally {
    await client.end();
  }
}
