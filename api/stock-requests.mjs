import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import YahooFinance from 'yahoo-finance2';
import { requireAuth } from './_lib/auth.mjs';
import { bodyObject, closeClient } from './_lib/validation.mjs';
import { ensureRequestsTable, validResearchSymbol, validRequestId, MAX_PENDING_REQUESTS } from '../lib/stock-requests.mjs';
const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
export const config = { maxDuration: 30 };
function matches(payload) {
  return (payload?.quotes || []).filter(row => validResearchSymbol(row.symbol) && ['EQUITY', 'ETF'].includes(row.quoteType)).slice(0, 6).map(row => ({ symbol: row.symbol, name: String(row.longname || row.shortname || row.symbol).slice(0, 160), exchange: row.exchDisp || row.exchange || '', type: row.quoteType }));
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) { res.setHeader('Allow', 'GET, POST, DELETE'); return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); }
  let body;
  if (req.method === 'POST') {
    try { body = bodyObject(req.body); } catch { return res.status(400).json({ error: 'INVALID_BODY' }); }
    if (!validResearchSymbol(body.symbol)) return res.status(400).json({ error: 'INVALID_SYMBOL' });
    if (body.subscriptionEndpoint !== undefined && (typeof body.subscriptionEndpoint !== 'string' || body.subscriptionEndpoint.length > 2048)) return res.status(400).json({ error: 'INVALID_SUBSCRIPTION' });
  }
  if (req.method === 'GET' && req.query?.q !== undefined) {
    const query = req.query.q;
    if (typeof query !== 'string' || !query.trim() || query.length > 80) return res.status(400).json({ error: 'INVALID_QUERY' });
    try {
      const payload = await yahoo.search(query.trim(), { quotesCount: 6, newsCount: 0 }, { fetchOptions: { signal: AbortSignal.timeout(8000) } });
      return res.status(200).json({ matches: matches(payload) });
    } catch { return res.status(503).json({ error: 'SEARCH_UNAVAILABLE' }); }
  }
  if (req.query?.id !== undefined && !validRequestId(req.query.id)) return res.status(400).json({ error: 'INVALID_REQUEST_ID' });
  if (req.method === 'DELETE' && !validRequestId(req.query?.id)) return res.status(400).json({ error: 'INVALID_REQUEST_ID' });
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  let transaction = false;
  try {
    await client.connect();
    await ensureRequestsTable(client);
    const person = req.auth.person;
    if (req.method === 'DELETE') {
      const deleted = await client.query('DELETE FROM stock_research_requests WHERE id = $1 AND person = $2 RETURNING id', [req.query.id, person]);
      if (!deleted.rows.length) return res.status(404).json({ error: 'REQUEST_NOT_FOUND' });
      return res.status(200).json({ deleted: true });
    }
    if (req.method === 'GET') {
      const fields = 'id, symbol, instrument_name AS "instrumentName", status, attempts, created_at AS "createdAt", completed_at AS "completedAt", result, notification_status AS "notificationStatus"';
      const result = req.query?.id ? await client.query(`SELECT ${fields} FROM stock_research_requests WHERE id = $1 AND person = $2`, [req.query.id, person]) : await client.query(`SELECT ${fields} FROM stock_research_requests WHERE person = $1 ORDER BY created_at DESC LIMIT 30`, [person]);
      if (req.query?.id && !result.rows.length) return res.status(404).json({ error: 'REQUEST_NOT_FOUND' });
      return res.status(200).json({ requests: result.rows });
    }
    // Resolve a real provider symbol; client-supplied names are never trusted.
    const payload = await yahoo.search(body.symbol, { quotesCount: 6, newsCount: 0 }, { fetchOptions: { signal: AbortSignal.timeout(8000) } });
    const instrument = matches(payload).find(row => row.symbol === body.symbol);
    if (!instrument) return res.status(400).json({ error: 'SYMBOL_NOT_FOUND' });
    await client.query('BEGIN'); transaction = true;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`stock-requests:${person}`]);
    const existing = await client.query("SELECT id, symbol, status FROM stock_research_requests WHERE person = $1 AND symbol = $2 AND status = 'pending'", [person, body.symbol]);
    const count = await client.query("SELECT COUNT(*)::int AS count FROM stock_research_requests WHERE person = $1 AND status = 'pending'", [person]);
    if (!existing.rows.length && count.rows[0].count >= MAX_PENDING_REQUESTS) { await client.query('ROLLBACK'); transaction = false; return res.status(409).json({ error: 'QUEUE_FULL' }); }
    const row = existing.rows[0] || (await client.query('INSERT INTO stock_research_requests (id, person, symbol, instrument_name) VALUES ($1, $2, $3, $4) RETURNING id, symbol, status', [randomUUID(), person, body.symbol, instrument.name])).rows[0];
    if (body.subscriptionEndpoint) {
      await client.query('ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS person TEXT');
      await client.query('UPDATE push_subscriptions SET person = $1 WHERE endpoint = $2 AND (person IS NULL OR person = $1)', [person, body.subscriptionEndpoint]);
    }
    await client.query('COMMIT'); transaction = false;
    return res.status(existing.rows.length ? 200 : 201).json({ request: row, duplicate: Boolean(existing.rows.length) });
  } catch (error) {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    console.error('Stock request failed', error.code || error.name);
    return res.status(503).json({ error: 'REQUEST_UNAVAILABLE' });
  } finally { await closeClient(client); }
}
