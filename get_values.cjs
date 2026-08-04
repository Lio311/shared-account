const { Client } = require('pg');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

const c = new Client({ connectionString: process.env.DATABASE_URL });

async function getBoiRate(currency) {
  if (currency === 'ILS') return 1;
  try {
    const res = await fetch('https://boi.org.il/PublicApi/GetExchangeRates');
    const data = await res.json();
    const rateData = data.exchangeRates.find(r => r.key === currency);
    if (rateData) return rateData.currentExchangeRate;
  } catch (err) {}
  return 1;
}

async function run() {
  await c.connect();
  const res = await c.query("SELECT symbol, shares, currency FROM portfolio_stocks WHERE investment_id = 1 AND status = 'active' ORDER BY symbol");
  const usdRate = await getBoiRate('USD');
  const results = [];
  
  for (let row of res.rows) {
    if (row.symbol.startsWith('CASH_')) continue;
    let priceFc = 0;
    let rate = row.currency === 'USD' ? usdRate : 1;
    try {
      const qSymbol = row.symbol.match(/^\d+$/) ? row.symbol + '.TA' : row.symbol;
      const quote = await yahooFinance.quote(qSymbol);
      priceFc = quote.regularMarketPrice;
      if (qSymbol.endsWith('.TA')) priceFc = priceFc / 100;
    } catch(e) {
      console.log('error', row.symbol, e.message);
    }
    const valueIls = priceFc * rate * parseFloat(row.shares);
    results.push({
      Symbol: row.symbol,
      Shares: row.shares,
      'Price (FC)': priceFc.toFixed(2),
      'Value (ILS)': valueIls.toFixed(2)
    });
  }
  
  console.table(results);
  await c.end();
}
run();
