const { Client } = require('pg');

async function main() {
  const client = new Client('postgresql://neondb_owner:npg_7gt0IRDvYAJW@ep-hidden-smoke-apxqgfzb-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require');
  await client.connect();
  
  const res = await client.query(`SELECT symbol, currency, purchase_price_fc FROM portfolio_stocks WHERE symbol = 'MRNA' OR symbol = 'MRNA_SOLD'`);
  console.table(res.rows);

  await client.end();
}
main().catch(console.error);
