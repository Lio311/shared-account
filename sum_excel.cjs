const xlsx = require('xlsx');

function run() {
  const workbook = xlsx.readFile('public/data (4).xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet);

  let total = 0;
  for (const row of data) {
    if (typeof row['שווי נוכחי'] === 'number') {
      total += row['שווי נוכחי'];
    }
  }
  console.log('Total:', total);
}
run();
