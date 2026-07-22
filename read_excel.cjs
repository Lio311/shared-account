const xlsx = require('xlsx');

const workbook = xlsx.readFile('חשבון משותף.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

console.log(data.slice(0, 15));
