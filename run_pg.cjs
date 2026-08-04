const fs = require('fs');
const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  await client.connect();
  console.log('Connected to DB');
  
  const sql = fs.readFileSync('import.sql', 'utf8');
  await client.query(sql);
  
  console.log('Successfully inserted data');
  await client.end();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
