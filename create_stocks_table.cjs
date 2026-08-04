const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;

const createTableQuery = `
CREATE TABLE IF NOT EXISTS portfolio_stocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    investment_id INT REFERENCES investments(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    shares NUMERIC NOT NULL,
    currency VARCHAR(10) NOT NULL,
    purchase_date DATE NOT NULL,
    purchase_price_fc NUMERIC NOT NULL,
    purchase_exchange_rate NUMERIC NOT NULL,
    purchase_price_ils NUMERIC NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    sale_date DATE,
    sale_price_fc NUMERIC,
    sale_exchange_rate NUMERIC,
    sale_price_ils NUMERIC,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

async function main() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        console.log('Connected to database.');
        await client.query(createTableQuery);
        console.log('Table portfolio_stocks created successfully.');
    } catch (err) {
        console.error('Error executing query', err.stack);
    } finally {
        await client.end();
    }
}

main();
