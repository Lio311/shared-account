const xlsx = require('xlsx');
const { Client } = require('pg');

async function run() {
  const workbook = xlsx.readFile('public/data (4).xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet);

  const excelMap = new Map();
  for (const row of data) {
    const symbol = row['סימבול'];
    const quantity = row['כמות נוכחית'];
    if (symbol && typeof quantity === 'number') {
      excelMap.set(symbol, quantity);
    }
  }

  const client = new Client(process.env.DATABASE_URL);
  await client.connect();
  const res = await client.query("SELECT symbol, shares FROM portfolio_stocks WHERE investment_id = 1 AND status = 'active'");
  await client.end();

  const dbMap = new Map();
  for (const row of res.rows) {
    // skip cash and TA stocks (which are mostly numbers)
    if (row.symbol !== 'CASH_ILS' && row.symbol !== 'CASH_USD' && !row.symbol.match(/^\d{6,7}$/)) {
      dbMap.set(row.symbol, parseFloat(row.shares));
    }
  }

  let match = true;
  for (const [sym, qty] of excelMap.entries()) {
    if (dbMap.has(sym)) {
      if (dbMap.get(sym) !== qty) {
        console.log(`Mismatch for ${sym}: Excel = ${qty}, DB = ${dbMap.get(sym)}`);
        match = false;
      }
    } else {
      console.log(`Missing in DB: ${sym} (${qty})`);
      match = false;
    }
  }

  for (const [sym, qty] of dbMap.entries()) {
    if (!excelMap.has(sym)) {
      console.log(`Extra in DB: ${sym} (${qty})`);
      match = false;
    }
  }

  if (match) {
    console.log('PORTFOLIO IS FULLY UPDATED!');
  }
}
run().catch(console.error);
