import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as validation from '../api/_lib/validation.mjs';

// Every database, authentication and network dependency is synthetic. No production env is read.
async function fixture(api, { query = () => ({ rows: [] }), quote = async () => null, fetch = async () => { throw new Error('mock network unavailable'); }, env = {}, DateClass = Date, auth = true } = {}) {
  const calls = [];
  let connected = 0, closed = 0;
  class Client {
    async connect() { connected++; }
    async end() { closed++; }
    async query(sql, values = []) {
      calls.push({ sql, values });
      return await query(sql, values, calls);
    }
  }
  class YahooFinance { async quote(symbol) { return await quote(symbol); } }
  const authModule = {
    requireAuth(req, res) { if (!auth) { res.status(401).json({ error: 'Authentication required' }); return false; } req.auth = { person: 'ליאור הבן' }; return true; },
    requireCron(req, res) { if (!env.CRON_SECRET || req.headers?.authorization !== `Bearer ${env.CRON_SECRET}`) { res.status(401).json({ error: 'Unauthorized' }); return false; } return true; },
    issueSession(_req, res) { res.setHeader('Set-Cookie', 'mock-session=mock'); }
  };
  const context = vm.createContext({ process: { env }, Buffer, Date: DateClass, AbortSignal, URL, Intl, fetch, console: { error() {}, log() {} }, Request });
  const modules = { pg: { Client }, 'yahoo-finance2': { default: YahooFinance }, './portfolio.mjs': { default: async () => { throw new Error('Portfolio must not run in guard test'); } }, 'web-push': { default: { setVapidDetails() {}, async sendNotification() {} } } };
  const source = await readFile(new URL(`../api/${api}.mjs`, import.meta.url), 'utf8');
  const mod = new vm.SourceTextModule(source, { context, identifier: api });
  await mod.link(specifier => {
    const exports = specifier.endsWith('/validation.mjs') ? validation : specifier.endsWith('/auth.mjs') ? authModule : modules[specifier];
    if (!exports) throw new Error(`Unexpected import ${specifier}: test refuses live dependencies`);
    const names = Object.keys(exports);
    return new vm.SyntheticModule(names, function() { for (const name of names) this.setExport(name, exports[name]); }, { context });
  });
  await mod.evaluate();
  return {
    calls,
    get connected() { return connected; }, get closed() { return closed; },
    async request(method, body, query = {}) {
      const req = { method, body, query, headers: { host: 'example.test', 'x-performed-by': '%bad-header' } };
      const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } };
      await mod.namespace.default(req, res);
      return res;
    }
  };
}
const stock = { id: 3, investment_id: 1, symbol: 'AAPL', status: 'active', shares: '10', currency: 'ILS', purchase_date: '2026-01-01', purchase_price_fc: '100', purchase_exchange_rate: '1', purchase_price_ils: '1000' };
const sale = { id: 3, sale_date: '2026-02-01', sale_price_fc: '120' };
const writes = calls => calls.filter(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql));

test('every financial endpoint rejects unauthorized requests before opening DB connections', async () => {
  for (const api of ['transactions', 'investments', 'salaries', 'projects', 'audit_logs', 'portfolio', 'portfolio-history', 'push-subscribe', 'test-push', 'vapid-public-key']) {
    const f = await fixture(api, { auth: false });
    assert.equal((await f.request('GET')).statusCode, 401, api);
    assert.equal(f.connected, 0, api);
    assert.equal(f.calls.length, 0, api);
  }
});

test('portfolio rejects negative, zero, oversell and repeat sales with no financial writes', async () => {
  for (const quantity of [-2, 0, 11, '2garbage', true]) {
    const f = await fixture('portfolio', { query: sql => ({ rows: sql.startsWith('SELECT *') ? [stock] : [] }) });
    const res = await f.request('PUT', { ...sale, sale_shares: quantity });
    assert.equal(res.statusCode, 400, String(quantity));
    assert.equal(writes(f.calls).length, 0);
    assert.ok(f.calls.some(({ sql }) => sql === 'ROLLBACK'));
  }
  const f = await fixture('portfolio', { query: sql => ({ rows: sql.startsWith('SELECT *') ? [{ ...stock, status: 'sold' }] : [] }) });
  assert.equal((await f.request('PUT', sale)).statusCode, 400);
  assert.equal(writes(f.calls).length, 0);
});

test('partial sale preserves proportional cost basis and credits matching currency atomically', async () => {
  const f = await fixture('portfolio', { query: sql => ({ rows: sql.startsWith('SELECT *') ? [stock] : sql.includes('RETURNING') ? [{ id: 4 }] : [] }) });
  const res = await f.request('PUT', { ...sale, sale_shares: 4 });
  assert.equal(res.statusCode, 200);
  const balance = f.calls.find(({ sql }) => sql.startsWith('UPDATE portfolio_stocks SET shares = $1'));
  assert.deepEqual(Array.from(balance.values), [6, 600, 3]);
  const soldLot = f.calls.find(({ sql }) => sql.trim().startsWith('INSERT INTO portfolio_stocks'));
  assert.equal(soldLot.values[3], 4);
  assert.equal(soldLot.values[8], 400);
  assert.equal(soldLot.values[12], 480);
  const cash = f.calls.find(({ sql }) => sql.startsWith('UPDATE portfolio_stocks SET shares = shares +'));
  assert.deepEqual(Array.from(cash.values), [480, 1, 'CASH_ILS']);
  assert.equal(f.calls.at(-1).sql, 'COMMIT');
});

test('failure midway through sale rolls back all changes and hides internal DB error', async () => {
  const f = await fixture('portfolio', { query: sql => {
    if (sql.startsWith('SELECT *')) return { rows: [stock] };
    if (sql.trim().startsWith('INSERT')) throw new Error('mock private database detail');
    return { rows: [] };
  } });
  const res = await f.request('PUT', { ...sale, sale_shares: 4 });
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'Portfolio operation failed');
  assert.ok(f.calls.some(({ sql }) => sql === 'ROLLBACK'));
  assert.ok(!f.calls.some(({ sql }) => sql === 'COMMIT'));
  assert.equal(f.closed, 1);
});

test('GET valuation never writes fallback prices to investments; reports missing live data', async () => {
  const f = await fixture('portfolio', { query: sql => ({ rows: sql.includes('FROM portfolio_stocks') ? [stock] : [{ total_deposited: 1000 }] }) });
  const res = await f.request('GET', undefined, { investment_id: 1 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.portfolioValue, 1000);
  assert.equal(res.body.stocks[0].valuation_status, 'stored_estimate');
  assert.equal(res.body.valuation_warnings[0], 'AAPL');
  assert.equal(writes(f.calls).length, 0);
});

test('Israeli quotation converts explicitly marked agorot once and has no fabricated fallback', async () => {
  for (const currency of ['ILA', 'ILS']) {
    const f = await fixture('portfolio', { quote: async () => ({ regularMarketPrice: 1234, currency }), query: sql => ({ rows: sql.includes('FROM portfolio_stocks') ? [{ ...stock, symbol: '1183441' }] : [{ total_deposited: 1000 }] }) });
    const res = await f.request('GET', undefined, { investment_id: 1 });
    assert.equal(res.body.stocks[0].current_price_fc, currency === 'ILA' ? 12.34 : 1234);
    assert.equal(writes(f.calls).length, 0);
  }
});

test('purchase cannot deduct dollars for a euro holding and missing FX never becomes 1', async () => {
  const f = await fixture('portfolio', { query: sql => ({ rows: sql.includes('FROM investments') ? [{ id: 1 }] : [] }) });
  const res = await f.request('POST', { investment_id: 1, symbol: 'SAP', shares: 2, currency: 'EUR', purchase_date: '2026-01-01', purchase_price_fc: 100 });
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /Exchange rate unavailable/);
  assert.equal(writes(f.calls).length, 0);
  assert.equal(f.calls.at(-1).sql, 'ROLLBACK');
});

test('new deposit creates absent ILS cash instead of silently changing only deposited total', async () => {
  const f = await fixture('portfolio', { query: sql => ({ rows: sql.includes('FROM investments') ? [{ id: 1, total_deposited: 300 }] : [] }) });
  const res = await f.request('PATCH', { investment_id: 1, add_amount: '300' });
  assert.equal(res.statusCode, 200);
  const create = f.calls.find(({ sql }) => sql.includes('INSERT INTO portfolio_stocks'));
  assert.deepEqual(Array.from(create.values), [1, 300]);
  assert.equal(f.calls.at(-1).sql, 'COMMIT');
});

test('invalid request bodies/dates/types/numbers return 400 rather than corrupting amounts', async () => {
  const f = await fixture('transactions');
  assert.equal((await f.request('POST', '{')).statusCode, 400);
  assert.equal(f.connected, 0);
  for (const amount of [-1, '10abc', Infinity, true, ' ']) {
    assert.equal((await f.request('POST', { amount, type: 'expense', description: 'Test', category: 'Test' })).statusCode, 400);
  }
  assert.equal((await f.request('POST', { amount: 10, type: 'invalid', description: 'Test', category: 'Test' })).statusCode, 400);
  assert.equal((await f.request('POST', { amount: 10, type: 'income', description: 'Test', category: 'Test', date: '2026-02-30' })).statusCode, 400);
  assert.equal(writes(f.calls).length, 0);
});

test('missing transaction update returns 404 and rolls back without audit write', async () => {
  const f = await fixture('transactions');
  const res = await f.request('PUT', { id: 1, amount: 10, type: 'income', description: 'Test', category: 'Test' });
  assert.equal(res.statusCode, 404);
  assert.equal(writes(f.calls).length, 0);
  assert.equal(f.calls.at(-1).sql, 'ROLLBACK');
});

test('deleting one salary targets only matching date/amount row and is atomic', async () => {
  const f = await fixture('salaries', { query: sql => ({ rows: sql.startsWith('SELECT *') ? [{ person_name: 'Person', amount: 8000, month: '2026-04-01', payslip_url: null }] : [] }) });
  const res = await f.request('DELETE', undefined, { id: 9 });
  assert.equal(res.statusCode, 200);
  const deletion = f.calls.find(({ sql }) => sql.startsWith('DELETE FROM transactions'));
  assert.match(deletion.sql, /amount = \$2 AND date::date = \$3::date/);
  assert.match(deletion.sql, /LIMIT 1/);
  assert.deepEqual(Array.from(deletion.values), ['משכורת - Person', 8000, '2026-04-01']);
  assert.equal(f.calls.at(-1).sql, 'COMMIT');
});

test('numeric-string prime interest is added numerically and provider failure preserves stored value', async () => {
  const inv = { type: 'פיקדון', interest_type: 'prime', interest_value: '0', current_value: '1000', monthly_addition: 0, last_value_update: new Date().toISOString() };
  const f = await fixture('investments', { fetch: async () => ({ ok: true, async json() { return { currentInterest: '4.5' }; } }), query: () => ({ rows: [{ ...inv }] }) });
  const res = await f.request('GET');
  assert.equal(res.body[0].current_interest_rate, 6);
  const fail = await fixture('investments', { query: () => ({ rows: [{ ...inv }] }) });
  const failed = await fail.request('GET');
  assert.equal(failed.body[0].current_value, '1000');
  assert.equal(failed.body[0].valuation_status, 'rate_unavailable');
});

test('scheduled jobs fail closed when secret is missing, before DB or network work', async () => {
  for (const api of ['cron-daily-push', 'cron-monthly']) {
    const f = await fixture(api);
    assert.equal((await f.request('GET')).statusCode, 401);
    assert.equal(f.connected, 0);
  }
});

test('historical FX reads named columns and selects latest prior business-day observation', () => {
  const csv = 'DATAFLOW,SERIES_CODE,TIME_PERIOD,OBS_VALUE,COMMENT\nBOI,RER_USD_ILS,2026-01-01,3.6,"quoted, label"\nBOI,RER_EUR_ILS,2026-01-02,4.0,x\nBOI,RER_USD_ILS,2026-01-02,3.5,x\nBOI,RER_USD_ILS,2026-01-05,3.4,x';
  assert.equal(validation.historicalExchangeRate(csv, 'USD', '2026-01-03'), 3.5);
  assert.throws(() => validation.historicalExchangeRate(csv, 'GBP', '2026-01-03'), /unavailable/);
  assert.throws(() => validation.historicalExchangeRate('bad,headers\n1,2', 'USD', '2026-01-03'), /format unavailable/);
});

test('end-of-month recurring deposit clamps January 31 to February 28', async () => {
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-02-28T12:00:00Z'])); } }
  const f = await fixture('investments', { DateClass: FixedDate, query: () => ({ rows: [{ type: 'פיקדון', interest_type: 'fixed', interest_value: 0, current_value: '1000', monthly_addition: '100', last_value_update: '2026-01-31T12:00:00Z' }] }) });
  const res = await f.request('GET');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].current_value, '1100.00');
});

test('fractional sale never discards a small unsold remainder', async () => {
  const tinyStock = { ...stock, shares: '0.0002', purchase_price_ils: '0.02' };
  const f = await fixture('portfolio', { query: sql => ({ rows: sql.startsWith('SELECT *') ? [tinyStock] : sql.includes('RETURNING') ? [{ id: 4 }] : [] }) });
  const res = await f.request('PUT', { ...sale, sale_shares: 0.00015 });
  assert.equal(res.statusCode, 200);
  const balance = f.calls.find(({ sql }) => sql.startsWith('UPDATE portfolio_stocks SET shares = $1'));
  assert.ok(Math.abs(balance.values[0] - 0.00005) < 1e-12);
  assert.ok(!f.calls.some(({ sql }) => sql.includes("SET status = 'sold'")));
});
