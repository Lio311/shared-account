
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;

async function createTable() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    
    // Create portfolio_transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS portfolio_transactions (
        id SERIAL PRIMARY KEY,
        investment_id INTEGER REFERENCES investments(id) ON DELETE CASCADE,
        type VARCHAR(50), -- 'fee', 'interest'
        amount_ils NUMERIC,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('portfolio_transactions table created successfully.');
  } catch (err) {
    console.error('Error creating table:', err);
  } finally {
    await client.end();
  }
}

createTable();
