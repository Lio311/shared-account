import { Client } from 'pg';
import YahooFinance from 'yahoo-finance2';
import webpush from 'web-push';
import { requireAuth, requireCron } from './_lib/auth.mjs';
import { closeClient } from './_lib/validation.mjs';
import { createResearchService, recommend } from '../lib/stock-research.mjs';

export const config = { maxDuration: 60 };
const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const scan = createResearchService({
  search: (symbol, { signal }) => yahoo.search(symbol, { quotesCount: 0, newsCount: 20 }, { fetchOptions: { signal } }),
  summary: (symbol, { signal }) => yahoo.quoteSummary(symbol, { modules: ['financialData', 'price', 'defaultKeyStatistics', 'summaryDetail'] }, { fetchOptions: { signal } }),
  quarterly: (symbol, { signal }) => yahoo.fundamentalsTimeSeries(symbol, {
    period1: new Date(Date.now() - 800 * 86400000), period2: new Date(), type: 'quarterly', module: 'financials',
  }, { fetchOptions: { signal } }),
  discover: (_key, { signal }) => yahoo.screener('most_actives', { count: 50 }, { validateResult: false, fetchOptions: { signal } }),
});

async function notify(client, runKey, deadline) {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return { sent: 0, unavailable: true };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey, privateKey);
  const subscriptions = await client.query('SELECT id, endpoint, keys FROM push_subscriptions');
  let sent = 0;
  let failed = 0;
  const failureCodes = {};
  let position = 0, skipped = 0;
  await Promise.all(Array.from({ length: Math.min(4, subscriptions.rows.length) }, async () => {
    while (position < subscriptions.rows.length) {
      const subscription = subscriptions.rows[position++];
      if (Date.now() >= deadline - 500) { skipped++; continue; }
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, JSON.stringify({
          title: 'סיכום מחקר המניות מוכן', body: 'הסריקה הסתיימה. פתחו את האתר לצפייה במקורות, בדוחות הרבעוניים ובמועמדות החדשות.', tag: `stock-research-${runKey}`, url: '/?view=research',
        }), { TTL: 8 * 3600, timeout: Math.min(5000, deadline - Date.now() - 500) });
        sent++;
      } catch (error) { failed++; const code = String(error.statusCode || 'network'); failureCodes[code] = (failureCodes[code] || 0) + 1; }
    }
  }));
  return { sent, failed, skipped, failureCodes, unavailable: false };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  if (req.method === 'POST' ? !requireCron(req, res) : !requireAuth(req, res)) return;
  const deadline = Date.now() + 54000;
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const rawQuery = client.query.bind(client);
  client.query = (text, values) => {
    if (Date.now() >= deadline - 1000) return Promise.reject(new Error('RESEARCH_DEADLINE'));
    return rawQuery({ text, values, query_timeout: Math.min(5000, deadline - Date.now() - 1000) });
  };
  let locked = false;
  try {
    await client.connect();
    if (req.method === 'GET') {
      const result = await client.query('SELECT report, notification_status FROM stock_research_reports ORDER BY created_at DESC LIMIT 1');
      if (!result.rows.length) return res.status(404).json({ error: 'NO_REPORT' });
      const report = result.rows[0].report;
      const results = report.results.map(item => ({ ...item, recommendation: recommend({ symbol: item.symbol, shares: item.recommendation?.action === 'cover_review' ? -1 : 1 }, item.fundamentals, item.articles, item.instrumentName) }));
      const held = await client.query("SELECT symbol FROM portfolio_stocks WHERE status = 'active'");
      const heldSymbols = new Set(held.rows.map(item => String(item.symbol).toUpperCase()));
      const opportunities = (report.opportunities || []).filter(item => !heldSymbols.has(String(item.symbol).toUpperCase())).map(item => ({ ...item, recommendation: recommend({ symbol: item.symbol, shares: 0 }, item.fundamentals, item.articles, item.instrumentName) })).filter(item => item.recommendation.action === 'buy_review');
      return res.status(200).json({ ...report, results, opportunities, notificationStatus: result.rows[0].notification_status });
    }
    await client.query(`CREATE TABLE IF NOT EXISTS stock_research_reports (
      run_key TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), report JSONB NOT NULL, notification_status JSONB
    )`);
    const lock = await client.query('SELECT pg_try_advisory_lock(92834173) AS acquired');
    locked = lock.rows[0].acquired;
    if (!locked) return res.status(409).json({ error: 'SCAN_ALREADY_RUNNING' });
    const runKey = `v3-${Math.floor(Date.now() / (8 * 3600000))}`;
    const previous = await client.query('SELECT run_key FROM stock_research_reports WHERE run_key = $1', [runKey]);
    if (previous.rows.length) return res.status(200).json({ success: true, skipped: true });
    const holdings = await client.query("SELECT symbol, shares, status FROM portfolio_stocks WHERE status = 'active'");
    const report = await scan(holdings.rows, { budgetMs: Math.max(1, deadline - Date.now() - 12000) });
    await client.query('INSERT INTO stock_research_reports (run_key, report) VALUES ($1, $2)', [runKey, JSON.stringify(report)]);
    let notification;
    try { notification = await notify(client, runKey, deadline - 5000); }
    catch { notification = { sent: 0, failed: true }; }
    await client.query('UPDATE stock_research_reports SET notification_status = $1 WHERE run_key = $2', [JSON.stringify(notification), runKey]);
    if (Date.now() < deadline - 6000) await client.query("DELETE FROM stock_research_reports WHERE created_at < NOW() - INTERVAL '30 days'");
    return res.status(200).json({ success: true, coverage: report.results.length, incomplete: report.results.filter(item => item.status === 'error' || item.status === 'unsupported').length, notification });
  } catch (error) {
    if (req.method === 'GET' && error.code === '42P01') return res.status(404).json({ error: 'NO_REPORT' });
    console.error('Stock research failed', error.code || error.name);
    return res.status(503).json({ error: 'RESEARCH_UNAVAILABLE' });
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(92834173)').catch(() => {});
    await closeClient(client);
  }
}
