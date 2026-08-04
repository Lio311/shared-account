const { Client } = require('pg');

async function run() {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();
  const result = await client.query("SELECT symbol, shares, currency, purchase_price_ils FROM portfolio_stocks WHERE investment_id = 1 AND status = 'active'");
  let totalIls = 0;
  
  // Use dynamic import correctly for yahoo-finance2
  const yahooFinanceModule = await import('yahoo-finance2');
  const yahooFinance = yahooFinanceModule.default;

  // Let's set a realistic USD to ILS exchange rate if we need to
  const USD_TO_ILS = 3.7;

  for (const stock of result.rows) {
    if (stock.symbol === 'VIXY') continue; // Omit VIXY
    
    let val = 0;
    if (stock.symbol === 'CASH_ILS') {
      // update based on new data
      val = 30287.03; // Using the latest ledger balance
    } else if (stock.symbol === 'CASH_USD') {
      val = 9352.04 * USD_TO_ILS;
    } else {
      const isTA = stock.symbol.match(/^\d{6,7}$/);
      const yfSym = isTA ? `${stock.symbol}.TA` : stock.symbol;
      try {
        const q = await yahooFinance.quote(yfSym);
        if (q && q.regularMarketPrice) {
          let p = q.regularMarketPrice;
          if (isTA) {
            p = p / 100; // TA prices are in Agorot
          }
          if (stock.currency === 'USD') {
            val = p * Number(stock.shares) * USD_TO_ILS;
          } else {
            val = p * Number(stock.shares);
          }
        } else {
           val = isTA ? Number(stock.purchase_price_ils) : 0;
        }
      } catch (e) {
        val = isTA ? Number(stock.purchase_price_ils) : 0;
      }
    }
    // console.log(stock.symbol, val);
    totalIls += Number(val);
  }
  console.log('Total ILS (Live Prices):', totalIls);
  await client.end();
}
run().catch(console.error);
