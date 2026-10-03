export const numberOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
export const numberOrZero = value => numberOrNull(value) ?? 0;
export const positiveNumber = value => {
  const number = numberOrNull(value);
  return number !== null && number > 0 ? number : null;
};
export function formatPortfolioMoney(value, currency = 'ILS') {
  const number = numberOrNull(value);
  if (number === null) return '—';
  const code = ['ILS', 'USD', 'EUR', 'GBP', 'CAD', 'JPY', 'CHF', 'AUD'].includes(currency) ? currency : 'ILS';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
}
export function validTransactionDate(date, earliest) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (date > today) return false;
  if (earliest) {
    const minimum = new Date(earliest);
    minimum.setHours(0, 0, 0, 0);
    if (Number.isFinite(minimum.getTime()) && date < minimum) return false;
  }
  return true;
}
export function filterAndSortHoldings(stocks, searchTerm, sortOption) {
  const query = searchTerm.trim().toLocaleLowerCase();
  return stocks.filter(stock => `${stock.symbol ?? ''} ${stock.name ?? ''}`.toLocaleLowerCase().includes(query)).sort((a, b) => {
    const field = sortOption.startsWith('return_') ? 'unrealized_pl_percent' : 'current_value_ils';
    if (sortOption === 'default') return 0;
    const left = numberOrNull(a[field]);
    const right = numberOrNull(b[field]);
    // Missing valuations always follow known valuations, in either direction.
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return sortOption.endsWith('_high') ? right - left : left - right;
  });
}
