import { Client } from 'pg';
import webpush from 'web-push';
import portfolioHandler from './portfolio.mjs';
import { issueSession, requireCron } from './_lib/auth.mjs';
import { closeClient } from './_lib/validation.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireCron(req, res)) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return res.status(503).json({ error: 'Push notifications are not configured' });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey, privateKey);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const investments = await client.query("SELECT id, name FROM investments WHERE type = 'חשבון מסחר' ORDER BY id");
    const subscriptions = (await client.query('SELECT id, endpoint, keys FROM push_subscriptions')).rows;
    const portfolios = [];
    let notified = 0, failed = 0;
    for (const investment of investments.rows) {
      // Reuse the read-only valuation path, with an internally issued signed session.
      let cookie;
      issueSession(req, { setHeader: (_name, value) => { cookie = value.split(';')[0]; } }, 'ליאור הבן');
      const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, setHeader() {}, json(body) { this.body = body; }, send(body) { this.body = body; } };
      await portfolioHandler({ method: 'GET', query: { investment_id: investment.id }, headers: { cookie } }, response);
      if (response.statusCode !== 200 || response.body.valuation_warnings.length) {
        portfolios.push({ investment_id: investment.id, status: 'skipped', reason: 'Incomplete live valuation' });
        continue;
      }
      const valuation = response.body;
      await client.query(`CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id SERIAL PRIMARY KEY, investment_id INTEGER REFERENCES investments(id) ON DELETE CASCADE,
        total_value_ils NUMERIC NOT NULL, date DATE NOT NULL DEFAULT CURRENT_DATE,
        UNIQUE(investment_id, date)
      )`);
      await client.query(`INSERT INTO portfolio_snapshots (investment_id, total_value_ils, date)
        VALUES ($1, $2, CURRENT_DATE) ON CONFLICT (investment_id, date)
        DO UPDATE SET total_value_ils = EXCLUDED.total_value_ils`, [investment.id, valuation.portfolioValue]);
      const formatMoney = value => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(value);
      const payload = JSON.stringify({ title: `סיכום תיק יומי — ${investment.name}`, body: `שווי התיק: ${formatMoney(valuation.portfolioValue)}\nשינוי לעומת הפקדות: ${formatMoney(valuation.overallPlIls)}` });
      for (const sub of subscriptions) {
        try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload); notified++; }
        catch (error) {
          failed++;
          if (error.statusCode === 404 || error.statusCode === 410) await client.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        }
      }
      portfolios.push({ investment_id: investment.id, status: 'saved', portfolioValue: valuation.portfolioValue });
    }
    return res.status(200).json({ success: true, notified, failed, portfolios });
  } catch {
    return res.status(500).json({ error: 'Daily summary failed' });
  } finally { await closeClient(client); }
}
