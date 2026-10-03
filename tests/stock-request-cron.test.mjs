import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as requests from '../lib/stock-requests.mjs';
import * as validation from '../api/_lib/validation.mjs';

const firstId = '12345678-1234-4123-8123-123456789abc';
const secondId = '22345678-1234-4123-8123-123456789abc';
const readyData = symbol => ({ symbol, status: 'available', fundamentals: { analystCount: 8 }, latestReport: { periodEnd: '2026-06-30' }, articles: [] });
async function fixture({ cronAuthorized = true, locked = true, previousRun = false, pending = [{ id: firstId, symbol: 'AAPL', person: 'Owner A', status: 'pending' }], ready = [], requestedResults = [readyData('AAPL')], failPush = false, failCompletion = false } = {}) {
  const records = [...pending, ...ready].map(row => ({ ...row })), calls = [], pushes = [], scans = [];
  let connected = 0, savedReport, snapshot;
  const subscriptions = [{ id: 1, person: 'Owner A', endpoint: 'https://push.test/owner-a', keys: {} }, { id: 2, person: 'Owner B', endpoint: 'https://push.test/owner-b', keys: {} }, { id: 3, person: null, endpoint: 'https://push.test/legacy', keys: {} }];
  class Client {
    async connect() { connected++; }
    async end() {}
    async query(input, values = []) {
      const sql = typeof input === 'string' ? input : input.text;
      values = typeof input === 'string' ? values : (input.values || []);
      calls.push({ sql, values: Array.from(values) });
      if (sql === 'BEGIN') snapshot = { records: JSON.parse(JSON.stringify(records)), savedReport };
      if (sql === 'ROLLBACK' && snapshot) { records.splice(0, records.length, ...snapshot.records); savedReport = snapshot.savedReport; }
      if (failCompletion && sql.startsWith('UPDATE stock_research_requests r SET status')) throw new Error('Database failure');
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: locked }] };
      if (sql.startsWith('SELECT run_key')) return { rows: previousRun ? [{ run_key: 'current' }] : [] };
      if (sql.startsWith('SELECT id, symbol FROM stock_research_requests')) return { rows: records.filter(row => row.status === 'pending').map(row => ({ id: row.id, symbol: row.symbol })) };
      if (sql.startsWith('UPDATE stock_research_requests SET last_attempt_at')) { for (const row of records) if (values[0].includes(row.id)) row.attempts = (row.attempts || 0) + 1; }
      if (sql.startsWith('UPDATE stock_research_requests r SET status')) { for (const item of JSON.parse(values[0])) { const row = records.find(row => row.id === item.id); row.status = 'ready'; row.result = item.result; } }
      if (sql.startsWith('SELECT id, person FROM stock_research_requests')) return { rows: records.filter(row => row.status === 'ready' && !(row.notificationStatus?.sent > 0)) };
      if (sql.startsWith('SELECT endpoint, keys FROM push_subscriptions WHERE person')) return { rows: subscriptions.filter(row => row.person === values[0]).map(row => ({ endpoint: row.endpoint, keys: row.keys })) };
      if (sql.startsWith('SELECT id, endpoint, keys FROM push_subscriptions')) return { rows: subscriptions };
      if (sql.startsWith('UPDATE stock_research_requests SET notification_status')) { const row = records.find(row => row.id === values[1]); row.notificationStatus = JSON.parse(values[0]); }
      if (sql.startsWith('INSERT INTO stock_research_reports')) savedReport = JSON.parse(values[1]);
      return { rows: [] };
    }
  }
  class YahooFinance {}
  const mockResearch = { createResearchService() { return async (holdings, options) => {
    scans.push({ holdings, options });
    return { scannedAt: '2026-10-03T10:00:00Z', results: [], opportunities: [], requestedResults };
  }; }, recommend: () => ({ action: 'review' }) };
  const webpush = { setVapidDetails() {}, async sendNotification(device, payload, options) { pushes.push({ endpoint: device.endpoint, payload: JSON.parse(payload), options }); if (failPush) throw new Error('Push provider unavailable'); } };
  const auth = { requireAuth: () => true, requireCron(req, res) { if (!cronAuthorized) res.status(401).json({ error: 'Unauthorized' }); return cronAuthorized; } };
  const context = vm.createContext({ process: { env: { VAPID_PUBLIC_KEY: 'mock-public', VAPID_PRIVATE_KEY: 'mock-private' } }, Date, AbortSignal, console: { error() {} } });
  const mod = new vm.SourceTextModule(await readFile(new URL('../api/stock-research.mjs', import.meta.url), 'utf8'), { context });
  await mod.link(name => {
    const exports = name === 'pg' ? { Client } : name === 'yahoo-finance2' ? { default: YahooFinance } : name === 'web-push' ? { default: webpush } : name.endsWith('/auth.mjs') ? auth : name.endsWith('/validation.mjs') ? validation : name.endsWith('/stock-requests.mjs') ? requests : name.endsWith('/stock-research.mjs') ? mockResearch : null;
    if (!exports) throw new Error(`Unmocked dependency: ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function() { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await mod.evaluate();
  const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await mod.namespace.default({ method: 'POST', headers: {} }, res);
  return { res, records, pushes, scans, calls, connected, savedReport };
}

test('queued research cron requires authorization and lock before scan or targeted pushes', async () => {
  const unauthorized = await fixture({ cronAuthorized: false });
  assert.equal(unauthorized.res.statusCode, 401);
  assert.equal(unauthorized.connected, 0);
  assert.equal(unauthorized.scans.length, 0);
  assert.equal(unauthorized.pushes.length, 0);
  const busy = await fixture({ locked: false });
  assert.equal(busy.res.statusCode, 409);
  assert.equal(busy.scans.length, 0);
  assert.equal(busy.pushes.length, 0);
});

test('complete queued data is persisted and pushed only to the owner with exact UUID URL', async () => {
  const f = await fixture();
  assert.equal(f.res.statusCode, 200);
  assert.equal(f.records[0].status, 'ready');
  assert.equal(f.records[0].result.symbol, 'AAPL');
  assert.equal(f.records[0].result.scannedAt, '2026-10-03T10:00:00Z');
  const targeted = f.pushes.filter(row => row.payload.tag?.startsWith('stock-request-'));
  assert.equal(targeted.length, 1);
  assert.equal(targeted[0].endpoint, 'https://push.test/owner-a');
  assert.equal(targeted[0].payload.url, `/?view=research&request=${firstId}`);
  assert.ok(targeted[0].options.timeout > 0 && targeted[0].options.timeout <= 3000);
  const deviceLookup = f.calls.find(row => row.sql.startsWith('SELECT endpoint, keys FROM push_subscriptions WHERE person'));
  assert.deepEqual(deviceLookup.values, ['Owner A']);
  assert.equal(f.records[0].notificationStatus.sent, 1);
  assert.equal(f.savedReport.requestedResults, undefined);
});

test('failed or incomplete provider coverage stays pending with attempted count and no ready notification', async () => {
  const pending = [{ id: firstId, symbol: 'AAPL', person: 'Owner A', status: 'pending' }, { id: secondId, symbol: 'MSFT', person: 'Owner B', status: 'pending' }];
  const f = await fixture({ pending, requestedResults: [{ ...readyData('AAPL'), status: 'error' }, { ...readyData('MSFT'), latestReport: null }] });
  assert.ok(f.records.every(row => row.status === 'pending' && row.attempts === 1));
  assert.equal(f.pushes.filter(row => row.payload.tag?.startsWith('stock-request-')).length, 0);
  assert.ok(!f.calls.some(row => row.sql.startsWith('UPDATE stock_research_requests r SET status')));
});

test('previously notified request is not targeted again and failed push does not erase completed research', async () => {
  const already = await fixture({ pending: [], ready: [{ id: firstId, symbol: 'AAPL', person: 'Owner A', status: 'ready', notificationStatus: { sent: 1 } }], requestedResults: [] });
  assert.equal(already.pushes.filter(row => row.payload.tag?.startsWith('stock-request-')).length, 0);
  const failed = await fixture({ failPush: true });
  assert.equal(failed.records[0].status, 'ready');
  assert.equal(failed.records[0].result.symbol, 'AAPL');
  assert.equal(failed.records[0].notificationStatus.sent, 0);
  assert.equal(failed.records[0].notificationStatus.failed, 1);
});

test('duplicate scheduled run does not scan or send duplicate notifications', async () => {
  const f = await fixture({ previousRun: true });
  assert.equal(f.res.statusCode, 200);
  assert.equal(f.res.body.skipped, true);
  assert.equal(f.scans.length, 0);
  assert.equal(f.pushes.length, 0);
});

test('report and request completion roll back together when persistence fails before notifications', async () => {
  const f = await fixture({ failCompletion: true });
  assert.equal(f.res.statusCode, 503);
  assert.equal(f.savedReport, undefined);
  assert.equal(f.records[0].status, 'pending');
  assert.equal(f.records[0].attempts, undefined);
  assert.equal(f.pushes.length, 0);
  assert.ok(f.calls.some(row => row.sql === 'ROLLBACK'));
});
