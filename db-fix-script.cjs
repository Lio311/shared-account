const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;

async function fix() {
  const c = new Client({ connectionString });
  try {
    await c.connect();
    const res = await c.query("SELECT id, symbol, shares, purchase_price_fc, purchase_exchange_rate, purchase_price_ils FROM portfolio_stocks WHERE status='active'");
    let updated = 0;
    
    for (const s of res.rows) {
      const fc = parseFloat(s.purchase_price_fc);
      const rate = parseFloat(s.purchase_exchange_rate);
      const ils = parseFloat(s.purchase_price_ils);
      const shares = parseFloat(s.shares);
      
      if (shares <= 0 || s.symbol.startsWith('CASH_')) continue;
      
      const totalCondition = Math.abs(fc * rate - ils) < 1;
      const perShareCondition = Math.abs(fc * rate * shares - ils) < 1;
      
      if (totalCondition && !perShareCondition && shares !== 1) {
        const newFc = fc / shares;
        await c.query("UPDATE portfolio_stocks SET purchase_price_fc = $1 WHERE id = $2", [newFc, s.id]);
        updated++;
      }
    }
    console.log('Fixed', updated, 'rows.');
  } catch(e) {
    console.error(e);
  } finally {
    await c.end();
  }
}

fix();
