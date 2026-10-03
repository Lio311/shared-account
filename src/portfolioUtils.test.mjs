import test from 'node:test';
import assert from 'node:assert/strict';
import { positiveNumber, formatPortfolioMoney, filterAndSortHoldings, validTransactionDate } from './portfolioUtils.mjs';
test('transactions reject nonfinite, partial, zero and negative numbers', () => {
  for (const value of ['', null, '1abc', 'Infinity', '-1', '0']) assert.equal(positiveNumber(value), null);
  assert.equal(positiveNumber('0.125'), 0.125);
});
test('amounts preserve euros and never turn missing prices into zero', () => {
  assert.match(formatPortfolioMoney(12, 'EUR'), /€/);
  assert.equal(formatPortfolioMoney(null), '—');
});
test('search accepts absent company name; missing valuations sort last', () => {
  const rows = [{ symbol: 'AAPL', name: null, current_value_ils: null }, { symbol: 'B', current_value_ils: '2' }, { symbol: 'C', current_value_ils: '10' }];
  assert.equal(filterAndSortHoldings(rows, ' aapl ', 'default').length, 1);
  assert.deepEqual(filterAndSortHoldings(rows, '', 'ils_low').map(row => row.symbol), ['B', 'C', 'AAPL']);
  assert.deepEqual(filterAndSortHoldings(rows, '', 'pct_high').map(row => row.symbol), ['C', 'B', 'AAPL']);
});
test('transaction dates reject future, invalid and sales predating purchases', () => {
  assert.equal(validTransactionDate(null), false);
  assert.equal(validTransactionDate(new Date('invalid')), false);
  assert.equal(validTransactionDate(new Date('2999-01-01')), false);
  assert.equal(validTransactionDate(new Date('2020-01-01'), '2021-01-01'), false);
  assert.equal(validTransactionDate(new Date('2021-01-01'), '2020-01-01'), true);
});
