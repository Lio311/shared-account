const { Client } = require('pg');

const client = new Client({ connectionString: process.env.VITE_NEON_DATABASE_URL });

async function main() {
  await client.connect();
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      endpoint TEXT UNIQUE NOT NULL,
      keys JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("Table push_subscriptions created successfully");
  
  await client.end();
}
main().catch(console.error);
