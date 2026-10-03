import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchService, normalizeArticles, recommend, safeArticleUrl } from '../lib/stock-research.mjs';

const now = new Date('2026-10-03T10:00:00Z');
const article = (overrides = {}) => ({ title: 'Company announces results', link: 'https://example.com/story?utm_source=feed', publisher: 'Example', providerPublishTime: '2026-10-03T09:00:00Z', relatedTickers: ['AAPL'], ...overrides });
test('research rejects unsafe links and filters duplicates, old news, future news and unrelated tickers', () => {
  assert.equal(safeArticleUrl('javascript:alert(1)'), null);
  assert.equal(safeArticleUrl('https://user:password@example.com/news'), null);
  assert.equal(safeArticleUrl('https://127.0.0.1/news'), null);
  const result = normalizeArticles([article(), article(), article({ link: 'https://example.com/old', providerPublishTime: '2026-09-01' }), article({ link: 'https://example.com/future', providerPublishTime: '2027-01-01' }), article({ link: 'https://example.com/unrelated', relatedTickers: ['MSFT'] })], 'AAPL', now);
  assert.equal(result.length, 1);
  assert.equal(result[0].url, 'https://example.com/story');
});
test('approved leveraged instruments do not trigger automatic sell; missing data does not become hold', () => {
  const leveraged = recommend({ symbol: 'NVDL', shares: 20 }, null, []);
  assert.equal(leveraged.action, 'review');
  assert.ok(leveraged.reason.includes('מותר'));
  assert.equal(recommend({ symbol: 'AAPL', shares: 3 }, null, []).confidence, 'insufficient');
  assert.equal(recommend({ symbol: 'AAPL', shares: -3 }, null, []).action, 'cover_review');
});
test('buy review needs analyst coverage, profitable growth and multiple news domains', () => {
  const financials = { analystCount: 10, analystConsensus: 'buy', operatingMargin: .2, revenueGrowth: .1 };
  const sources = [{ sourceDomain: 'one.test', title: 'a', url: 'https://one.test/a' }, { sourceDomain: 'two.test', title: 'b', url: 'https://two.test/b' }];
  const holding = { symbol: 'AAPL', shares: 3 };
  assert.equal(recommend(holding, financials, sources).action, 'buy_review');
  assert.equal(recommend(holding, financials, sources.slice(0, 1)).action, 'review');
  assert.equal(recommend(holding, { ...financials, operatingMargin: -.1 }, sources).action, 'review');
});
test('scan accounts for every holding and preserves unsupported and failed coverage', async () => {
  const service = createResearchService({ now: () => now,
    search: async symbol => { if (symbol === 'MSFT') throw new Error('outage'); return { news: [article()] }; },
    summary: async () => { throw new Error('outage'); },
  });
  const report = await service([{ symbol: 'AAPL', shares: 3, status: 'active' }, { symbol: 'MSFT', shares: 1, status: 'active' }, { symbol: '1183441', shares: 1, status: 'active' }, { symbol: 'CASH_ILS', shares: 100, status: 'active' }, { symbol: 'SOLD', shares: 5, status: 'sold' }]);
  assert.equal(report.results.length, 3);
  assert.equal(report.results[0].status, 'available');
  assert.equal(report.results[1].status, 'error');
  assert.equal(report.results[2].status, 'unsupported');
  assert.equal(report.results[1].recommendation.confidence, 'insufficient');
});
test('malformed fundamentals do not abort scan and a short lot is not hidden by a positive lot', async () => {
  const service = createResearchService({ now: () => now, search: async () => ({ news: [] }), summary: async () => null });
  const report = await service([{ symbol: 'AAPL', shares: 5, status: 'active' }, { symbol: 'AAPL', shares: -1, status: 'active' }]);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].recommendation.action, 'cover_review');
  assert.equal(report.results[0].fundamentals, null);
});
