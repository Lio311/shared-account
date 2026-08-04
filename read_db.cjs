const { Client } = require('pg');

async function main() {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();
  
  const res = await client.query(`SELECT symbol, currency, purchase_price_fc FROM portfolio_stocks WHERE symbol = 'MRNA' OR symbol = 'MRNA_SOLD'`);
  console.table(res.rows);

  await client.end();
}
main().catch(console.error);
