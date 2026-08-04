import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
const res = await yahooFinance.quote(['AAPL', 'MSFT']);
console.log(res);
