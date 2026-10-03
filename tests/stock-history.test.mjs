import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHistory } from '../lib/stock-history.mjs';
const now = new Date('2026-10-03T12:00:00Z');
const financials = ['2025-06-30', '2025-09-30', '2025-12-31', '2026-03-31', '2026-06-30'].map((date, i) => ({ date, periodType: '3M', totalRevenue: (i + 1) * 100, operatingIncome: 20, netIncome: i * 10, dilutedEPS: i + 1 }));
const chart = { meta: { currency: 'USD' }, quotes: financials.map(row => ({ date: row.date, close: 140 })), events: {} };
const input = { chart, financials, reportingCurrency: 'USD', splitHistoryKnown: true };
test('calculates trailing EPS from four consecutive quarters and preserves quarterly ratios', () => {
  const result = normalizeHistory(input, now);
  assert.equal(result.reports.length, 3);
  assert.equal(result.reports[1].ttmEPS, 10);
  assert.equal(result.reports[1].estimatedPE, 14);
  assert.equal(result.reports[2].ttmEPS, 14);
  assert.equal(result.reports[2].operatingMargin, 0.04);
  assert.equal(result.prices.length, 3);
});
test('does not compute PE with negative EPS, missing currency, currency mismatch, or splits', () => {
  for (const override of [
    { reportingCurrency: null }, { reportingCurrency: 'EUR' }, { splitHistoryKnown: false },
    { chart: { ...chart, events: { splits: [{ date: '2026-01-01', numerator: 2, denominator: 1 }] } } },
    { financials: financials.map(row => ({ ...row, dilutedEPS: -1 })) },
  ]) assert.ok(normalizeHistory({ ...input, ...override }, now).reports.every(row => row.estimatedPE === null));
});
test('keeps absent values null and rejects annual, future, zero prices and nonconsecutive quarters', () => {
  const rows = financials.filter((_, i) => i !== 1).concat([{ date: '2027-03-31', periodType: '3M', totalRevenue: 999 }, { date: '2026-06-30', periodType: '12M', totalRevenue: 999 }]);
  rows[rows.length - 3] = { ...rows[rows.length - 3], dilutedEPS: undefined, operatingIncome: undefined };
  const result = normalizeHistory({ ...input, financials: rows, chart: { ...chart, quotes: [...chart.quotes, { date: '2026-09-01', close: 0 }, { date: '2027-01-01', close: 3 }] } }, now);
  assert.ok(result.reports.every(row => row.ttmEPS === null && row.estimatedPE === null));
  assert.equal(result.reports.at(-1).revenue, 500);
  assert.equal(result.reports.at(-1).operatingMargin, null);
  assert.equal(result.prices.length, 3);
});
test('merges cash-flow by exact quarter date without turning missing values into zero', () => {
  const result = normalizeHistory({ ...input, cashFlow: [{ date: '2026-06-30', periodType: '3M', freeCashFlow: -50 }] }, now);
  assert.equal(result.reports.at(-1).freeCashFlow, -50);
  assert.equal(result.reports[0].freeCashFlow, null);
});
test('does not use a stale quote to construct quarter-end PE', () => {
  const result = normalizeHistory({ ...input, chart: { ...chart, quotes: [{ date: '2026-06-01', close: 100 }] } }, now);
  assert.equal(result.reports.at(-1).estimatedPE, null);
});

test('preserves daily closes and uses the quarter-end trading day despite its later UTC time', () => {
  const quotes = [...chart.quotes.filter(row => row.date !== '2026-06-30'), { date: '2026-06-29T20:00:00Z', close: 126 }, { date: '2026-06-30T20:00:00Z', close: 140 }];
  const result = normalizeHistory({ ...input, chart: { ...chart, quotes } }, now);
  assert.equal(result.prices.length, 4);
  assert.equal(result.reports.at(-1).estimatedPE, 10);
});
