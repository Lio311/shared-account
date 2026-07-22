const fs = require('fs');
const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://neondb_owner:npg_7gt0IRDvYAJW@ep-hidden-smoke-apxqgfzb-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require',
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
