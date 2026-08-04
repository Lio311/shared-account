import { Client } from 'pg';
import webpush from 'web-push';

const connectionString = process.env.DATABASE_URL;

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    'mailto:test@example.com',
    vapidPublicKey,
    vapidPrivateKey
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = new Client({ connectionString });
  
  try {
    await client.connect();

    // Get all investments
    const invRes = await client.query('SELECT id, name FROM investments');
    
    for (const inv of invRes.rows) {
      const investmentId = inv.id;
      
      // 1. Find cash balance
      const cashRes = await client.query(
        "SELECT id, shares FROM portfolio_stocks WHERE investment_id = $1 AND symbol = 'CASH_ILS'",
        [investmentId]
      );
      
      if (cashRes.rows.length > 0) {
        const cashStock = cashRes.rows[0];
        const currentCash = parseFloat(cashStock.shares);
        
        // Calculate interest (0.5%) and fee (15 NIS)
        const interest = currentCash * 0.005;
        const fee = 15;
        
        // Update cash balance
        const newCash = currentCash + interest - fee;
        
        await client.query(
          "UPDATE portfolio_stocks SET shares = $1 WHERE id = $2",
          [newCash, cashStock.id]
        );
        
        // Record transactions
        await client.query(
          "INSERT INTO portfolio_transactions (investment_id, type, amount_ils, description) VALUES ($1, $2, $3, $4)",
          [investmentId, 'interest', interest, `צבירת ריבית (0.5%) על יתרת מזומן ${currentCash.toFixed(2)} ש"ח`]
        );
        
        await client.query(
          "INSERT INTO portfolio_transactions (investment_id, type, amount_ils, description) VALUES ($1, $2, $3, $4)",
          [investmentId, 'fee', -fee, 'דמי ניהול חודשיים']
        );
        
        // Calculate an interesting insight (e.g., best performing stock this month).
        // Since we don't have historical prices saved, we'll just show the interest earned vs fee.
        
        const insight = `החודש צברת ריבית של ${interest.toFixed(2)} ש"ח ושילמת דמי ניהול של 15 ש"ח (סך הכל ${ (interest - fee) >= 0 ? '+' : ''}${(interest - fee).toFixed(2)} ש"ח).`;
        
        // 2. Fetch push subscriptions
        const subRes = await client.query('SELECT subscription FROM push_subscriptions');
        const subscriptions = subRes.rows.map(r => r.subscription);
        
        if (subscriptions.length > 0) {
          const payload = JSON.stringify({
            title: `סיכום חודשי - ${inv.name}`,
            body: insight,
            icon: '/icon-192x192.png'
          });

          for (const sub of subscriptions) {
            try {
              if (sub.endpoint) {
                 await webpush.sendNotification(sub, payload);
              }
            } catch (err) {
              console.error('Error sending push notification:', err);
              if (err.statusCode === 410 || err.statusCode === 404) {
                await client.query('DELETE FROM push_subscriptions WHERE subscription::text = $1::text', [JSON.stringify(sub)]);
              }
            }
          }
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error running monthly cron:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    await client.end();
  }
}
