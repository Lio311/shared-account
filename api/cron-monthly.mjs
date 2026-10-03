import { Client } from 'pg';
import webpush from 'web-push';
import { requireCron } from './_lib/auth.mjs';
import { closeClient } from './_lib/validation.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  if (!requireCron(req, res)) return;
  // Monthly interest/fees are real accounting changes. They must match explicitly configured broker terms.
  const interestRate = Number(process.env.MONTHLY_CASH_INTEREST_RATE);
  const fee = Number(process.env.MONTHLY_MANAGEMENT_FEE);
  if (process.env.MONTHLY_ACCOUNTING_ENABLED !== 'true' || !process.env.MONTHLY_CASH_INTEREST_RATE || !process.env.MONTHLY_MANAGEMENT_FEE || !Number.isFinite(interestRate) || interestRate < 0 || !Number.isFinite(fee) || fee < 0) {
    return res.status(503).json({ error: 'Monthly accounting requires approved interest and fee configuration' });
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let inTransaction = false;
  try {
    await client.connect();
    const investments = (await client.query("SELECT id, name FROM investments WHERE type = 'חשבון מסחר' ORDER BY id")).rows;
    const summaries = [];
    for (const inv of investments) {
      await client.query('BEGIN'); inTransaction = true;
      await client.query('SELECT id FROM investments WHERE id = $1 FOR UPDATE', [inv.id]);
      const existing = await client.query("SELECT id FROM portfolio_transactions WHERE investment_id = $1 AND type IN ('interest', 'fee') AND created_at >= date_trunc('month', CURRENT_TIMESTAMP) LIMIT 1", [inv.id]);
      if (existing.rows.length) { await client.query('COMMIT'); inTransaction = false; continue; }
      const cash = await client.query("SELECT id, shares FROM portfolio_stocks WHERE investment_id = $1 AND symbol = 'CASH_ILS' AND status = 'active' FOR UPDATE", [inv.id]);
      if (!cash.rows.length) { await client.query('COMMIT'); inTransaction = false; continue; }
      const interest = Math.max(0, Number(cash.rows[0].shares)) * interestRate;
      await client.query('UPDATE portfolio_stocks SET shares = shares + $1 - $2 WHERE id = $3', [interest, fee, cash.rows[0].id]);
      await client.query("INSERT INTO portfolio_transactions (investment_id, type, amount_ils, description) VALUES ($1, 'interest', $2, $3), ($1, 'fee', $4, $5)", [inv.id, interest, `ריבית חודשית (${(interestRate * 100).toFixed(3)}%)`, -fee, 'דמי ניהול חודשיים']);
      await client.query('COMMIT'); inTransaction = false;
      summaries.push({ investment_id: inv.id, interest, fee, name: inv.name });
    }
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && summaries.length) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
      const subscriptions = (await client.query('SELECT id, endpoint, keys FROM push_subscriptions')).rows;
      for (const summary of summaries) for (const sub of subscriptions) {
        try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title: `סיכום חודשי — ${summary.name}`, body: `ריבית: ${summary.interest.toFixed(2)} ₪; דמי ניהול: ${summary.fee.toFixed(2)} ₪` })); }
        catch (error) { if (error.statusCode === 404 || error.statusCode === 410) await client.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]); }
      }
    }
    return res.status(200).json({ success: true, processed: summaries.length });
  } catch {
    return res.status(500).json({ error: 'Monthly accounting failed' });
  } finally {
    if (inTransaction) { try { await client.query('ROLLBACK'); } catch { /* Connection may already be closed. */ } }
    await closeClient(client);
  }
}
