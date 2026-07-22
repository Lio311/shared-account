const fs = require('fs');
const xlsx = require('xlsx');
const { Client } = require('pg');

async function importData() {
  const wb = xlsx.readFile('חשבון משותף.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(ws, {header: 1});
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  await client.connect();
  console.log('Connected to DB');
  
  await client.query('TRUNCATE TABLE transactions');
  console.log('Truncated transactions table');
  
  let count = 0;
  // A2 is index 1, A234 is index 233
  for(let i=1; i<=233; i++) {
    const row = data[i];
    if (!row || typeof row[0] !== 'number') continue;
    
    let amount = row[0];
    const desc = row[1] || '';
    
    let type = 'expense';
    if (amount < 0) {
      type = 'income';
      amount = Math.abs(amount);
    }
    
    // Default values since Excel doesn't have them
    const category = type === 'expense' ? 'כללי' : 'העברות אישיות ושונות';
    const date = new Date(new Date().getTime() - i * 1000 * 60).toISOString(); // fake dates to maintain order
    
    await client.query(
      'INSERT INTO transactions (date, amount, description, category, type) VALUES ($1, $2, $3, $4, $5)',
      [date, amount, desc, category, type]
    );
    count++;
  }
  
  // Also insert the latest MaxStock
  await client.query(
    'INSERT INTO transactions (date, amount, description, category, type) VALUES ($1, $2, $3, $4, $5)',
    [new Date().toISOString(), 21.8, 'מקססטוק', 'סופרמרקט', 'expense']
  );
  
  console.log('Inserted', count + 1, 'transactions');
  
  await client.end();
}

importData().catch(console.error);
