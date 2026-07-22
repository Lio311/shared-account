const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_7gt0IRDvYAJW@ep-hidden-smoke-apxqgfzb-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require' });
c.connect().then(() => c.query("SELECT symbol, purchase_date FROM portfolio_stocks WHERE symbol='IBM'")).then(r => { console.table(r.rows); c.end() }).catch(console.error);
