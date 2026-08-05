import { Client } from 'pg';
import webpush from 'web-push';

const connectionString = process.env.DATABASE_URL;

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BIM0xAWO_Q74HlZtHNUhyQIv94Lf3OX3XjMXO8c7sRuJVdgmwc874tsNgjsYuWByrICnC_0PS0GJN-rP0w1uiCg',
  process.env.VAPID_PRIVATE_KEY || '4vyeT_COryu8ilf5YXpS2zsNjCXgzYWm3rrNXeL09mw'
);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
        await webpush.sendNotification(sub, JSON.stringify({
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
    return res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
