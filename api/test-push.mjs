import { requireAuth } from './_lib/auth.mjs';
import { Client } from 'pg';
import webpush from 'web-push';

const connectionString = process.env.DATABASE_URL;



export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(503).json({ error: 'Push notifications are not configured' });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const client = new Client({ connectionString });

  try {
    await client.connect();

    const title = 'התראת בדיקה 🔔';
    const body = 'אם אתה רואה את זה, מערכת ההתראות עובדת מצוין!';

    // Fetch all push subscriptions
    const subRes = await client.query('SELECT * FROM push_subscriptions');
    const subscriptions = subRes.rows;

    let successCount = 0;
    let failCount = 0;
    let errors = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({
          title,
          body
        }));
        successCount++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription has expired or is no longer valid
          await client.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        } else {
          console.error('Push notification failed for a subscriber:', err);
          errors.push(err.message || err.toString());
        }
        failCount++;
      }
    }

    return res.status(200).json({ 
      success: true, 
      notified: successCount, 
      failed: failCount,
      errors: errors
    });

  } catch (error) {
    console.error('Test Push Error:', error);
    return res.status(500).json({ error: 'Test notification failed' });
  } finally {
    await client.end();
  }
}
