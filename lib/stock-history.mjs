const DAY = 86400000;
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const date = value => { const parsed = new Date(value); return value != null && Number.isFinite(parsed.getTime()) ? parsed : null; };
const currency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null;

export function normalizeHistory({ chart, financials = [], cashFlow = [], reportingCurrency, splitHistoryKnown = false }, now = new Date()) {
  const end = now.getTime(), start = end - 365 * DAY;
  const allPrices = (chart?.quotes || []).flatMap(row => {
    const day = date(row.date), close = finite(row.close);
    return day && day.getTime() <= end && close !== null && close > 0 ? [{ date: day.toISOString(), close }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
  const uniquePrices = [...new Map(allPrices.map(row => [row.date.slice(0, 10), row])).values()];
  const grouped = new Map();
  // Ignore annual and trailing records: a quarter must never mix with either.
  for (const row of [...financials, ...cashFlow]) {
    const day = date(row.date);
    if (!day || day > now || day.getTime() < end - 800 * DAY || row.periodType !== '3M') continue;
    const key = day.toISOString().slice(0, 10);
    const existing = grouped.get(key) || { periodEnd: day.toISOString(), revenue: null, netIncome: null, operatingIncome: null, dilutedEPS: null, freeCashFlow: null };
    for (const [target, source] of [['revenue', 'totalRevenue'], ['netIncome', 'netIncome'], ['operatingIncome', 'operatingIncome'], ['dilutedEPS', 'dilutedEPS'], ['freeCashFlow', 'freeCashFlow']]) {
      const value = finite(row[source]);
      if (value !== null) existing[target] = value;
    }
    grouped.set(key, existing);
  }
  const priceCurrency = currency(chart?.meta?.currency), reportCurrency = currency(reportingCurrency);
  const splits = chart?.events?.splits;
  const noSplits = splitHistoryKnown && (!splits || Object.keys(splits).length === 0);
  const reports = [...grouped.values()].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd)).map((row, index, rows) => {
    const quarters = rows.slice(Math.max(0, index - 3), index + 1);
    const consecutive = quarters.length === 4 && quarters.every((quarter, position) => position === 0 || (new Date(quarter.periodEnd) - new Date(quarters[position - 1].periodEnd)) / DAY >= 70 && (new Date(quarter.periodEnd) - new Date(quarters[position - 1].periodEnd)) / DAY <= 110);
    const ttmEPS = consecutive && quarters.every(quarter => quarter.dilutedEPS !== null) ? quarters.reduce((sum, quarter) => sum + quarter.dilutedEPS, 0) : null;
    const quarterEnd = new Date(row.periodEnd).getTime();
    const price = uniquePrices.filter(point => point.date.slice(0, 10) <= row.periodEnd.slice(0, 10)).at(-1);
    const closeEnough = price && quarterEnd - new Date(price.date).getTime() <= 10 * DAY;
    const estimatedPE = noSplits && priceCurrency && priceCurrency === reportCurrency && ttmEPS > 0 && closeEnough ? price.close / ttmEPS : null;
    return { ...row, operatingMargin: row.revenue > 0 && row.operatingIncome !== null ? row.operatingIncome / row.revenue : null, ttmEPS, estimatedPE };
  }).filter(row => new Date(row.periodEnd).getTime() >= start);
  return { prices: uniquePrices.filter(point => new Date(point.date).getTime() >= start), reports, currency: priceCurrency, reportingCurrency: reportCurrency,
    peMethodology: 'מכפיל משוער: מחיר הסגירה האחרון ביום סוף הרבעון או לפניו, חלקי סכום הרווח המדולל למניה בארבעה רבעונים רצופים. מוצג רק במטבע זהה וללא פיצול מניות בתקופת הבדיקה. תאריך הרבעון אינו תאריך פרסום הדוח; זה אינו המכפיל שהיה ידוע בזמן אמת.',
    fetchedAt: now.toISOString() };
}
