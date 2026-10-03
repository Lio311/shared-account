import YahooFinance from 'yahoo-finance2';
import { requireAuth } from './_lib/auth.mjs';
import { normalizeHistory } from '../lib/stock-history.mjs';

const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); }
  const symbol = req.query?.symbol;
  if (typeof symbol !== 'string' || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) return res.status(400).json({ error: 'INVALID_SYMBOL' });
  const now = new Date(), period1 = new Date(now.getTime() - 800 * 86400000);
  const options = { fetchOptions: { signal: AbortSignal.timeout(12000) } };
  const [chart, financials, cashFlow, summary] = await Promise.allSettled([
    yahoo.chart(symbol, { period1, period2: now, interval: '1d', events: 'split' }, options),
    yahoo.fundamentalsTimeSeries(symbol, { period1, period2: now, type: 'quarterly', module: 'financials' }, options),
    yahoo.fundamentalsTimeSeries(symbol, { period1, period2: now, type: 'quarterly', module: 'cash-flow' }, options),
    yahoo.quoteSummary(symbol, { modules: ['financialData'] }, options),
  ]);
  const value = result => result.status === 'fulfilled' ? result.value : undefined;
  const history = normalizeHistory({ chart: value(chart), financials: value(financials), cashFlow: value(cashFlow), reportingCurrency: value(summary)?.financialData?.financialCurrency, splitHistoryKnown: chart.status === 'fulfilled' }, now);
  if (!history.prices.length && !history.reports.length) return res.status(503).json({ error: 'HISTORY_UNAVAILABLE' });
  return res.status(200).json({ ...history, symbol, sourceUrls: [`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`, `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/financials/`, `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/cash-flow/`] });
}
