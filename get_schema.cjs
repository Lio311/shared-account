const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();
const client = new Client({ connectionString: process.env.VITE_NEON_DATABASE_URL || process.env.DATABASE_URL });
async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  console.log(res.rows);
  await client.end();
}
main();
