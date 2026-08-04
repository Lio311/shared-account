import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const res = await client.query('SELECT DISTINCT symbol, status FROM portfolio_stocks');
console.log(res.rows);
await client.end();
