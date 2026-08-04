const { Client } = require('pg');
import('yahoo-finance2').then(({ default: YahooFinance }) => {
  const yahooFinance = new YahooFinance();
  const client = new Client(process.env.DATABASE_URL);
  client.connect().then(async () => {
    const result = await client.query("SELECT symbol, shares, currency, purchase_price_ils FROM portfolio_stocks WHERE investment_id = 1 AND status = 'active'");
    let totalIls = 0;
    for (const stock of result.rows) {
      let val = 0;
      if (stock.symbol === 'CASH_ILS') {
        val = Number(stock.shares);
      } else if (stock.symbol === 'CASH_USD') {
        val = Number(stock.shares) * 3.7;
      } else {
        const isTA = stock.symbol.match(/^\d{6,7}$/);
        const yfSym = isTA ? `${stock.symbol}.TA` : stock.symbol;
        try {
          const q = await yahooFinance.quote(yfSym);
          if (q && q.regularMarketPrice) {
            let p = q.regularMarketPrice;
            if (isTA) p = p / 100;
            if (stock.currency === 'USD') val = p * Number(stock.shares) * 3.7;
            else val = p * Number(stock.shares);
          } else {
             val = isTA ? stock.purchase_price_ils : 0;
          }
        } catch (e) {
          val = isTA ? stock.purchase_price_ils : 0;
        }
      }
      console.log(stock.symbol, val);
      totalIls += val;
    }
    console.log("TOTAL:", totalIls);
    client.end();
  });
});
