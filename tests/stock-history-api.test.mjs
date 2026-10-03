import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
async function request({ auth = false, method = 'GET', symbol = 'AAPL' } = {}) {
  let networkCalls = 0;
  class YahooFinance {
    chart() { networkCalls++; throw new Error('Network must not be reached'); }
    fundamentalsTimeSeries() { networkCalls++; throw new Error('Network must not be reached'); }
    quoteSummary() { networkCalls++; throw new Error('Network must not be reached'); }
  }
  const context = vm.createContext({ Date, AbortSignal });
  const mod = new vm.SourceTextModule(await readFile(new URL('../api/stock-history.mjs', import.meta.url), 'utf8'), { context });
  await mod.link(name => {
    const exports = name === 'yahoo-finance2' ? { default: YahooFinance } : name.endsWith('/auth.mjs') ? { requireAuth: (_req, res) => { if (!auth) res.status(401).json({ error: 'UNAUTHORIZED' }); return auth; } } : { normalizeHistory: () => { throw new Error('Must not normalize during guard check'); } };
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const key of Object.keys(exports)) this.setExport(key, exports[key]); }, { context });
  });
  await mod.evaluate();
  const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await mod.namespace.default({ method, query: { symbol } }, res);
  return { res, networkCalls };
}
test('history API requires authentication before provider access', async () => {
  const result = await request();
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.networkCalls, 0);
  assert.equal(result.res.headers['Cache-Control'], 'no-store');
});
test('history API rejects unsupported methods and malformed symbols before provider access', async () => {
  const method = await request({ auth: true, method: 'POST' });
  assert.equal(method.res.statusCode, 405);
  assert.equal(method.res.headers.Allow, 'GET');
  for (const symbol of [undefined, ['AAPL'], 'https://other.test', 'AAPL?x=1', '1183441', '']) {
    const result = await request({ auth: true, symbol: symbol === undefined ? null : symbol });
    assert.equal(result.res.statusCode, 400);
    assert.equal(result.networkCalls, 0);
  }
});
