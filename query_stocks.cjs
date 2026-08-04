const { Client } = require('pg');
const client = new Client({ connectionString: process.env.VITE_NEON_DATABASE_URL });
async function main() {
  await client.connect();
  const res = await client.query(`SELECT symbol, name, shares, purchase_price_ils FROM portfolio_stocks WHERE status = 'active'`);
  console.log(JSON.stringify(res.rows, null, 2));
  
  const invRes = await client.query('SELECT total_deposited FROM investments');
  console.log('Investments:', invRes.rows);
  
  await client.end();
}
main();
