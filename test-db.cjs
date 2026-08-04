const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => c.query("SELECT symbol, purchase_date FROM portfolio_stocks WHERE symbol='IBM'")).then(r => { console.table(r.rows); c.end() }).catch(console.error);
