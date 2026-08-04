import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/shared_account';

async function check() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    console.log("Tables:", res.rows.map(r => r.table_name));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

check();
