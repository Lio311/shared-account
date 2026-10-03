import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchService, normalizeArticles, normalizeLatestReport, discoveryCandidates, normalizeValuation, recommend, safeArticleUrl } from '../lib/stock-research.mjs';

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
test('buy review needs analyst coverage, profitable growth and multiple news publishers', () => {
  const financials = { valuation: { status: 'passes_screen' }, analystCount: 10, analystConsensus: 'buy', operatingMargin: .2, revenueGrowth: .1 };
  const sources = [{ sourceDomain: 'one.test', title: 'a', url: 'https://one.test/a' }, { sourceDomain: 'two.test', title: 'b', url: 'https://two.test/b' }];
  const holding = { symbol: 'AAPL', shares: 3 };
  assert.equal(recommend(holding, financials, sources).action, 'buy_review');
  assert.equal(recommend(holding, financials, sources.slice(0, 1)).action, 'review');
  assert.equal(recommend(holding, { ...financials, operatingMargin: -.1 }, sources).action, 'review');
});
test('Yahoo-hosted stories retain distinct publishers without counting syndication as independent verification', () => {
  const articles = normalizeArticles([
    article({ publisher: 'Reuters', link: 'https://finance.yahoo.com/news/a' }),
    article({ publisher: 'Bloomberg', link: 'https://finance.yahoo.com/news/b' }),
  ], 'AAPL', now);
  const financials = { valuation: { status: 'passes_screen' }, analystCount: 10, analystConsensus: 'buy', operatingMargin: .2, revenueGrowth: .1 };
  const decision = recommend({ symbol: 'AAPL', shares: 3 }, financials, articles);
  assert.equal(decision.action, 'buy_review');
  assert.equal(recommend({ symbol: 'AAPL', shares: 3 }, financials, articles.map(item => ({ ...item, source: 'Reuters' }))).action, 'review');
  assert.ok(decision.limitations.some(item => item.includes('אימות עצמאי')));
  assert.equal(recommend({ symbol: 'AAPL', shares: 3 }, { ...financials, analystConsensus: 'sell', revenueGrowth: -.1, operatingMargin: -.2 }, articles).action, 'sell_review');
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


test('latest quarterly report has correct period, currency, EPS, margin and prior-year quarter growth', () => {
  const series = [
    { date: new Date('2025-06-30'), periodType: '3M', totalRevenue: 100, netIncome: 10 },
    { date: new Date('2026-03-31'), periodType: '3M', totalRevenue: 115 },
    { date: new Date('2026-06-30'), periodType: '3M', totalRevenue: 125, netIncome: 12, operatingIncome: 25, dilutedEPS: 0 },
    { date: new Date('2026-09-30'), periodType: '12M', totalRevenue: 500 },
    { date: new Date('2027-06-30'), periodType: '3M', totalRevenue: 999 },
  ];
  const result = normalizeLatestReport(series, 'EUR', 'SAP', now);
  assert.equal(result.periodEnd, '2026-06-30T00:00:00.000Z');
  assert.equal(result.periodType, 'quarterly');
  assert.equal(result.currency, 'EUR');
  assert.equal(result.revenue, 125);
  assert.equal(result.dilutedEPS, 0);
  assert.equal(result.operatingMargin, .2);
  assert.equal(result.revenueGrowth, .25);
  assert.equal(result.previousPeriodEnd, '2025-06-30T00:00:00.000Z');
  assert.equal(result.publicationDate, null);
  assert.match(result.sourceUrl, /SAP\/financials/);
  assert.equal(normalizeLatestReport(series, undefined, 'SAP', now).currency, null);
  assert.equal(normalizeLatestReport([{ date: now, periodType: '12M', totalRevenue: 100 }], 'USD', 'AAPL', now), null);
});

test('missing quarterly comparison is null rather than comparing sequential quarters or TTM', () => {
  const result = normalizeLatestReport([{ date: '2026-03-31', periodType: '3M', totalRevenue: 50 }, { date: '2026-06-30', periodType: '3M', totalRevenue: 100 }], 'USD', 'AAPL', now);
  assert.equal(result.revenueGrowth, null);
  assert.equal(result.netIncome, null);
  assert.equal(result.operatingMargin, null);
});
const marketQuote = (symbol, changes = {}) => ({ symbol, quoteType: 'EQUITY', currency: 'USD', marketCap: 3e9, regularMarketChangePercent: 3, regularMarketTime: Math.floor(new Date('2026-10-02T20:00:00Z').getTime() / 1000), regularMarketVolume: 2000, averageDailyVolume3Month: 1000, ...changes });
test('discovery filters all held symbols, losers, ETF, stale quotes, missing time and small caps; caps 8', () => {
  const quotes = [marketQuote('AAPL'), marketQuote('LOSER', { regularMarketChangePercent: -3 }), marketQuote('ETF', { quoteType: 'ETF' }), marketQuote('SMALL', { marketCap: 1e9 }), marketQuote('EUR', { currency: 'EUR' }), marketQuote('STALE', { regularMarketTime: 1 }), marketQuote('NOTIME', { regularMarketTime: undefined }), ...Array.from({ length: 10 }, (_, index) => marketQuote(`NEW${index}`, { regularMarketVolume: 10000 + index }))];
  const result = discoveryCandidates({ quotes }, new Set(['AAPL']), now);
  assert.equal(result.length, 8);
  assert.ok(result.every(item => item.symbol.startsWith('NEW')));
  assert.equal(result[0].symbol, 'NEW9');
  assert.equal(result[0].marketActivity.relativeVolume, 10.009);
  assert.equal(result[0].marketActivity.quoteTime, '2026-10-02T20:00:00.000Z');
});

test('opportunities are unheld buy_review candidates, at most 4; holding coverage and quarterly metrics survive', async () => {
  const service = createResearchService({ now: () => now,
    search: async symbol => ({ news: [article({ relatedTickers: [symbol], publisher: 'Reuters', link: `https://one.test/${symbol}` }), article({ relatedTickers: [symbol], publisher: 'Bloomberg', link: `https://two.test/${symbol}` })] }),
    summary: async () => ({ defaultKeyStatistics: { trailingEps: 2 }, summaryDetail: { trailingPE: 25 }, financialData: { recommendationKey: 'buy', numberOfAnalystOpinions: 10, operatingMargins: .2, revenueGrowth: .1, financialCurrency: 'USD' } }),
    quarterly: async () => [{ date: '2026-06-30', periodType: '3M', totalRevenue: 100, netIncome: 20 }],
    discover: async () => ({ quotes: [marketQuote('AAPL'), marketQuote('ZERO'), ...Array.from({ length: 10 }, (_, index) => marketQuote(`NEW${index}`))] }),
  });
  const report = await service([{ symbol: 'AAPL', shares: 1, status: 'active' }, { symbol: 'ZERO', shares: 0, status: 'active' }, { symbol: '1183441', shares: 1, status: 'active' }]);
  assert.equal(report.results.length, 2);
  assert.equal(report.results[0].latestReport.revenue, 100);
  assert.equal(report.opportunities.length, 4);
  assert.ok(report.opportunities.every(item => !['AAPL', 'ZERO'].includes(item.symbol) && item.recommendation.action === 'buy_review' && item.marketActivity.changePercent > 0));
  assert.equal(report.discovery.candidateCount, 8);
  assert.equal(report.discovery.researchedCount, 8);
  assert.equal(report.discovery.status, 'complete');
  assert.equal(report.reportVersion, 3);
});

test('optional discovery and quarterly provider failures never abort holdings research', async () => {
  const service = createResearchService({ now: () => now, search: async () => ({ news: [article()] }), summary: async () => null, quarterly: async () => { throw new Error('outage'); }, discover: async () => { throw new Error('outage'); } });
  const report = await service([{ symbol: 'AAPL', shares: 1, status: 'active' }]);
  assert.equal(report.results[0].status, 'available');
  assert.equal(report.results[0].latestReport, null);
  assert.equal(report.discovery.status, 'unavailable');
  assert.deepEqual(report.opportunities, []);
});

test('hanging source respects total deadline and produces explicit incomplete coverage', async () => {
  const never = () => new Promise(() => {});
  const service = createResearchService({ search: never, summary: never, quarterly: never, discover: never, now: () => now });
  const started = Date.now();
  const report = await service([{ symbol: 'AAPL', shares: 1, status: 'active' }], { budgetMs: 20 });
  assert.ok(Date.now() - started < 300);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].status, 'error');
  assert.equal(report.discovery.status, 'unavailable');
});


test('latest quarter overrides contradictory summary growth and margin for displayed recommendation gates', async () => {
  const service = createResearchService({ now: () => now,
    search: async () => ({ news: [article(), article({ publisher: 'Second', link: 'https://two.test/story' })] }),
    summary: async () => ({ defaultKeyStatistics: { trailingEps: 2 }, summaryDetail: { trailingPE: 25 }, financialData: { recommendationKey: 'buy', numberOfAnalystOpinions: 10, operatingMargins: .2, revenueGrowth: .1, financialCurrency: 'USD' } }),
    quarterly: async () => [{ date: '2025-06-30', periodType: '3M', totalRevenue: 100 }, { date: '2026-06-30', periodType: '3M', totalRevenue: 80, operatingIncome: -4 }],
  });
  const report = await service([{ symbol: 'AAPL', shares: 1, status: 'active' }]);
  assert.equal(report.results[0].recommendation.action, 'review');
  assert.ok(Math.abs(report.results[0].fundamentals.revenueGrowth + .2) < 1e-12);
  assert.equal(report.results[0].fundamentals.operatingMargin, -.05);
  assert.equal(report.results[0].fundamentals.revenueGrowthPeriod, 'quarterly_yoy');
  assert.equal(report.results[0].fundamentals.operatingMarginPeriod, 'quarterly');
});

test('valuation handles missing, negative earnings and high multiples without inventing PEG', () => {
  assert.equal(normalizeValuation(null).status, 'unavailable');
  assert.equal(normalizeValuation({ summaryDetail: { trailingPE: 20 }, defaultKeyStatistics: { trailingEps: -2 } }).status, 'unavailable');
  const summary = { summaryDetail: { trailingPE: 80 }, defaultKeyStatistics: { trailingEps: 2, forwardPE: 40 }, financialData: { revenueGrowth: 1, earningsGrowth: .2 } };
  assert.equal(normalizeValuation(summary).status, 'high_multiple');
  assert.equal(normalizeValuation(summary).pegRatio, null);
  assert.equal(normalizeValuation({ ...summary, defaultKeyStatistics: { trailingEps: 2, pegRatio: 1.5 } }).status, 'passes_screen');
  assert.equal(normalizeValuation({ ...summary, defaultKeyStatistics: { trailingEps: 2, pegRatio: 0 } }).status, 'high_multiple');
});
test('PE valuation materially gates buys but never alone triggers a sale', () => {
  const holding = { symbol: 'AAPL', shares: 3 };
  const data = { analystCount: 10, analystConsensus: 'buy', operatingMargin: .2, revenueGrowth: .1 };
  const sources = [{ source: 'One', title: 'a', url: 'https://one.test/a' }, { source: 'Two', title: 'b', url: 'https://two.test/b' }];
  for (const status of ['unavailable', 'high_multiple']) assert.equal(recommend(holding, { ...data, valuation: { status } }, sources).action, 'review');
  assert.equal(recommend(holding, { ...data, valuation: { status: 'passes_screen' } }, sources).action, 'buy_review');
  assert.equal(recommend(holding, { ...data, valuation: { status: 'high_multiple' } }, sources).action, 'review');
});
