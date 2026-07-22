const { Client } = require('pg');

const connectionString = 'postgresql://neondb_owner:npg_7gt0IRDvYAJW@ep-hidden-smoke-apxqgfzb-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function fixDb() {
  const c = new Client({ connectionString });
  try {
    await c.connect();

    // 1. Fix Israeli stocks currency
    await c.query(`
      UPDATE portfolio_stocks
      SET currency = 'ILS'
      WHERE symbol IN ('1183441', '1183441_SOLD', '1159250', '1159250_SOLD');
    `);
    console.log("Updated Israeli stocks currency to ILS");

    // 2. Backfill purchase_price_fc for USD stocks using 3.695 exchange rate
    // Note: We only backfill if currency = 'USD' and purchase_price_fc is 0
    await c.query(`
      UPDATE portfolio_stocks
      SET purchase_exchange_rate = 3.695,
          purchase_price_fc = purchase_price_ils / 3.695
      WHERE currency = 'USD' AND purchase_price_fc = 0 AND symbol != 'CASH_USD';
    `);
    console.log("Updated purchase_price_fc for USD stocks");

    // Let's also update CASH_USD purchase_price_fc to the same logic or just the same as ils/3.695
    await c.query(`
      UPDATE portfolio_stocks
      SET purchase_exchange_rate = 3.695,
          purchase_price_fc = purchase_price_ils / 3.695
      WHERE symbol = 'CASH_USD';
    `);

    // 3. For ILS stocks, purchase_price_fc should be equal to purchase_price_ils since it's 1:1
    await c.query(`
      UPDATE portfolio_stocks
      SET purchase_exchange_rate = 1,
          purchase_price_fc = purchase_price_ils
      WHERE currency = 'ILS' AND purchase_price_fc = 0 AND symbol != 'CASH_ILS';
    `);
    console.log("Updated purchase_price_fc for ILS stocks");

  } catch(e) {
    console.error(e);
  } finally {
    await c.end();
  }
}

fixDb();
