import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as requests from '../lib/stock-requests.mjs';
import * as validation from '../api/_lib/validation.mjs';

const requestId = '12345678-1234-4123-8123-123456789abc';
const person = 'Owner A';
const instrument = { symbol: 'AAPL', longname: 'Apple Inc.', quoteType: 'EQUITY' };
async function fixture({ authenticated = true, search = async () => ({ quotes: [instrument] }), query = async () => ({ rows: [] }) } = {}) {
  const calls = [], searches = [];
  let connects = 0, closes = 0;
  class Client {
    async connect() { connects++; }
    async end() { closes++; }
    async query(sql, values = []) { calls.push({ sql, values: Array.from(values) }); return query(sql, values); }
  }
  class YahooFinance {
    async search(value) { searches.push(value); return search(value); }
  }
  const auth = { requireAuth(req, res) { if (!authenticated) { res.status(401).json({ error: 'UNAUTHORIZED' }); return false; } req.auth = { person }; return true; } };
  const context = vm.createContext({ process: { env: {} }, AbortSignal, console: { error() {} } });
  const mod = new vm.SourceTextModule(await readFile(new URL('../api/stock-requests.mjs', import.meta.url), 'utf8'), { context });
  await mod.link(name => {
    const exports = name === 'pg' ? { Client } : name === 'yahoo-finance2' ? { default: YahooFinance } : name === 'node:crypto' ? { randomUUID: () => requestId } : name.endsWith('/auth.mjs') ? auth : name.endsWith('/validation.mjs') ? validation : name.endsWith('/stock-requests.mjs') ? requests : null;
    if (!exports) throw new Error(`Unmocked dependency: ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function() { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await mod.evaluate();
  return {
    calls, searches,
    get connects() { return connects; }, get closes() { return closes; },
    async request(method = 'GET', body, params = {}) {
      const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
      await mod.namespace.default({ method, body, query: params, headers: {} }, res);
      return res;
    },
  };
}
function queueQuery({ existing = [], count = 0, insertError = false } = {}) {
  return async (sql, values) => {
    if (sql.includes('COUNT(*)')) return { rows: [{ count }] };
    if (sql.startsWith('SELECT id, symbol, status')) return { rows: existing };
    if (sql.startsWith('INSERT INTO stock_research_requests')) {
      if (insertError) throw new Error('mock database detail');
      return { rows: [{ id: values[0], symbol: values[2], status: 'pending' }] };
    }
    return { rows: [] };
  };
}
const inserts = f => f.calls.filter(({ sql }) => sql.startsWith('INSERT INTO stock_research_requests'));

test('request helpers require confirmed uppercase stock symbols and exact UUID deep links', () => {
  for (const value of ['aapl', 'AAPL?', 'https://evil.test', ['AAPL'], '', null]) assert.equal(requests.validResearchSymbol(value), false);
  assert.equal(requests.validResearchSymbol('BRK-B'), true);
  assert.equal(requests.requestUrl(requestId), `/?view=research&request=${requestId}`);
  for (const value of ['../admin', `${requestId}&redirect=https://evil.test`, ['id'], '']) {
    assert.equal(requests.validRequestId(value), false);
    assert.equal(requests.requestUrl(value), '/?view=research');
  }
});

test('research becomes ready only with successful provider coverage and both fundamentals and latest quarter', () => {
  const complete = { status: 'available', fundamentals: { analystCount: 10 }, latestReport: { periodEnd: '2026-06-30' } };
  assert.equal(requests.researchReady(complete), true);
  assert.equal(requests.researchReady({ ...complete, status: 'no_recent_news' }), true);
  for (const result of [null, { ...complete, status: 'error' }, { ...complete, status: 'unsupported' }, { ...complete, fundamentals: null }, { ...complete, latestReport: null }]) assert.equal(requests.researchReady(result), false);
});

test('unauthenticated queue search/read/write never connects to database or provider', async () => {
  const f = await fixture({ authenticated: false });
  for (const [method, body, query] of [['GET', undefined, { q: 'Apple' }], ['GET', undefined, { id: requestId }], ['POST', { symbol: 'AAPL' }, {}]]) {
    assert.equal((await f.request(method, body, query)).statusCode, 401);
  }
  assert.equal(f.connects, 0);
  assert.equal(f.searches.length, 0);
  assert.equal(f.calls.length, 0);
});

test('invalid methods, company queries, IDs and symbols are rejected before provider or database calls', async () => {
  const f = await fixture();
  assert.equal((await f.request('DELETE')).statusCode, 405);
  for (const q of ['', ' ', ['Apple'], 'a'.repeat(81)]) assert.equal((await f.request('GET', undefined, { q })).statusCode, 400);
  for (const id of ['invalid', [requestId], `${requestId}&other=1`]) assert.equal((await f.request('GET', undefined, { id })).statusCode, 400);
  for (const symbol of ['aapl', 'AAPL/../../', ['AAPL'], '', null]) assert.equal((await f.request('POST', { symbol })).statusCode, 400);
  assert.equal((await f.request('POST', '{')).statusCode, 400);
  assert.equal(f.connects, 0);
  assert.equal(f.searches.length, 0);
});

test('company search returns only validated equity/ETF matches with provider names, never queues directly', async () => {
  const f = await fixture({ search: async () => ({ quotes: [instrument, { symbol: 'SPY', longname: 'SPDR ETF', quoteType: 'ETF' }, { symbol: 'BAD', quoteType: 'CRYPTOCURRENCY' }, { symbol: 'invalid/symbol', quoteType: 'EQUITY' }] }) });
  const result = await f.request('GET', undefined, { q: '  Apple  ' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.matches.length, 2);
  assert.equal(result.body.matches[0].name, 'Apple Inc.');
  assert.deepEqual(f.searches, ['Apple']);
  assert.equal(f.connects, 0);
});

test('provider lookup failure cannot create a queued request', async () => {
  const invalid = await fixture({ search: async () => ({ quotes: [{ ...instrument, symbol: 'MSFT' }] }) });
  assert.equal((await invalid.request('POST', { symbol: 'AAPL' })).statusCode, 400);
  assert.equal(inserts(invalid).length, 0);
  const failed = await fixture({ search: async () => { throw new Error('network unavailable'); } });
  assert.equal((await failed.request('POST', { symbol: 'AAPL' })).statusCode, 503);
  assert.equal(inserts(failed).length, 0);
});

test('request insertion attributes session person and provider name and locks before checking capacity', async () => {
  const f = await fixture({ query: queueQuery() });
  const res = await f.request('POST', { symbol: 'AAPL', person: 'Victim', instrument_name: 'Untrusted Name', subscriptionEndpoint: 'https://push.example/device' });
  assert.equal(res.statusCode, 201);
  const insert = inserts(f)[0];
  assert.deepEqual(insert.values, [requestId, person, 'AAPL', 'Apple Inc.']);
  const lockIndex = f.calls.findIndex(({ sql }) => sql.includes('pg_advisory_xact_lock'));
  const countIndex = f.calls.findIndex(({ sql }) => sql.includes('COUNT(*)'));
  assert.ok(lockIndex > -1 && lockIndex < countIndex);
  assert.deepEqual(f.calls[lockIndex].values, [`stock-requests:${person}`]);
  const binding = f.calls.find(({ sql }) => sql.startsWith('UPDATE push_subscriptions'));
  assert.match(binding.sql, /person IS NULL OR person = \$1/);
  assert.deepEqual(binding.values, [person, 'https://push.example/device']);
  assert.equal(f.calls.at(-1).sql, 'COMMIT');
  assert.equal(f.closes, 1);
});

test('ten pending requests reject new symbol but duplicates reuse same row without exceeding capacity', async () => {
  const full = await fixture({ query: queueQuery({ count: 10 }) });
  const rejected = await full.request('POST', { symbol: 'AAPL' });
  assert.equal(rejected.statusCode, 409);
  assert.equal(rejected.body.error, 'QUEUE_FULL');
  assert.equal(inserts(full).length, 0);
  assert.equal(full.calls.at(-1).sql, 'ROLLBACK');
  const duplicate = await fixture({ query: queueQuery({ count: 10, existing: [{ id: requestId, symbol: 'AAPL', status: 'pending' }] }) });
  const reused = await duplicate.request('POST', { symbol: 'AAPL' });
  assert.equal(reused.statusCode, 200);
  assert.equal(reused.body.duplicate, true);
  assert.equal(reused.body.request.id, requestId);
  assert.equal(inserts(duplicate).length, 0);
  assert.equal(duplicate.calls.at(-1).sql, 'COMMIT');
});

test('database insert failure rolls back queue transaction and hides database internals', async () => {
  const f = await fixture({ query: queueQuery({ insertError: true }) });
  const res = await f.request('POST', { symbol: 'AAPL' });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'REQUEST_UNAVAILABLE');
  assert.equal(f.calls.at(-1).sql, 'ROLLBACK');
  assert.ok(!f.calls.some(({ sql }) => sql === 'COMMIT'));
  assert.equal(f.closes, 1);
});

test('read/list is person scoped and another owner request ID yields indistinguishable 404', async () => {
  const f = await fixture();
  const one = await f.request('GET', undefined, { id: requestId, person: 'Victim' });
  assert.equal(one.statusCode, 404);
  const read = f.calls.find(({ sql }) => sql.includes('WHERE id = $1 AND person = $2'));
  assert.deepEqual(read.values, [requestId, person]);
  await f.request('GET');
  const list = f.calls.find(({ sql }) => sql.includes('WHERE person = $1 ORDER BY'));
  assert.deepEqual(list.values, [person]);
  assert.match(list.sql, /LIMIT 30/);
});

test('requested symbols receive scan budget first without being inserted into actual holdings coverage', async () => {
  const { createResearchService } = await import('../lib/stock-research.mjs');
  const searches = [];
  const date = new Date('2026-10-03T10:00:00Z');
  const service = createResearchService({ now: () => date,
    search: async symbol => { searches.push(symbol); return { news: [] }; },
    summary: async () => ({ financialData: { financialCurrency: 'USD', recommendationKey: 'buy', numberOfAnalystOpinions: 10, revenueGrowth: .1, operatingMargins: .2 } }),
    quarterly: async () => [{ date: '2026-06-30', periodType: '3M', totalRevenue: 100, netIncome: 20 }],
  });
  const report = await service([{ symbol: 'AAPL', status: 'active', shares: 1 }], { requestedSymbols: ['MSFT', 'MSFT', 'invalid', 'AAPL'] });
  assert.equal(searches[0], 'MSFT');
  assert.equal(searches.filter(symbol => symbol === 'AAPL').length, 1);
  assert.deepEqual(report.results.map(item => item.symbol), ['AAPL']);
  assert.deepEqual(report.requestedResults.map(item => item.symbol), ['MSFT', 'AAPL']);
  assert.ok(report.requestedResults.every(requests.researchReady));
});
