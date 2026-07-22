const xlsx = require('xlsx');
const fs = require('fs');

function getCategory(desc) {
  if (!desc) return 'כללי';
  if (/(דלק|פנגו|חניה|ביטוח רכב|מוסך)/.test(desc)) return 'רכב';
  if (/(אוכל|פיצה|בר|מסעדה|וולט|המבורגר|סושי|קפה|ארוחה|לחם|על האש|גלידה|יוגורט|מקסיקני|פירות|כיסונים|נאם|שישי|סרט)/.test(desc)) return 'מסעדות ופנאי';
  if (/(סופר|קניות|שופרסל|ויקטורי|רמי לוי|קפסולות|פיצוחים|דנונה|טופו|חומץ|שוםרסל|שמן זית|מטליות)/.test(desc)) return 'סופרמרקט';
  if (/(אסוס|אליאקספרס|בגדים|זארה|שיין|Aliexpress|טמו|אמזון|אייהרב|לולו למון|נעליים|כובע|Figs|גונו|תחפושת|עגילים)/.test(desc)) return 'קניות מחנויות אונליין';
  if (/(גוד פארם|סופר פארם|Be|פלקסיטול|משחות|תחבושות|גל דורקס|מכבי|גינגר)/.test(desc)) return 'פארם/בריאות';
  if (/(מפיצי ריח|לבית|חשמל|ריהוט|מקרר|ספה|מדפסת|מקס סטוק|Ksp|שואב|נרות)/.test(desc)) return 'לבית';
  if (/(ארנונה|מים|גז|חשמל|ועד בית|ועד הבית|פרטנר|תיקון דוד)/.test(desc)) return 'חשבונות';
  if (/(רב קו|רכבת|אוטובוס)/.test(desc)) return 'תחבורה ציבורית';
  if (/(חול|אתונה|יורו|טיול)/.test(desc)) return 'חופשות וחו"ל';
  if (/(ביטוח דירה|ביטוח חול)/.test(desc)) return 'ביטוחים';
  if (/(חתונה|ברית|פרחים)/.test(desc)) return 'אירועים ומתנות';
  if (/(אור|רון|אלי|חלק של|פרומיס ביט|פיס)/.test(desc)) return 'העברות אישיות ושונות';
  return 'כללי';
}

function getRandomDate() {
  const start = new Date();
  start.setMonth(start.getMonth() - 3); // last 3 months
  const end = new Date();
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function main() {
  const workbook = xlsx.readFile('חשבון משותף.xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  let sql = 'TRUNCATE TABLE transactions;\n';
  sql += 'INSERT INTO transactions (date, amount, description, category, type) VALUES\n';
  const values = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row.length === 0) continue;
    
    let amount = row[0];
    let description = row[1] || '';
    
    if (typeof amount !== 'number' || isNaN(amount)) continue;
    
    const isExpense = amount > 0;
    const actualAmount = Math.abs(amount);
    
    // User logic: negatives are "הפרשות מיוחדות" to the shared account (income)
    let type = isExpense ? 'expense' : 'income';
    let category = '';
    
    if (!isExpense) {
      category = 'הפרשות מיוחדות';
    } else {
      category = getCategory(description);
    }
    
    const date = getRandomDate().toISOString();
    const escapedDesc = description.replace(/'/g, "''");
    values.push(`('${date}', ${actualAmount}, '${escapedDesc}', '${category}', '${type}')`);
  }
  
  sql += values.join(',\n') + ';';
  fs.writeFileSync('import.sql', sql);
  console.log('SQL generated.');
}

main().catch(console.error);
