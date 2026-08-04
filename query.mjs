import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query('SELECT * FROM portfolio_stocks');
  console.log(res.rows);
  await client.end();
}

main().catch(console.error);
