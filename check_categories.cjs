const xlsx = require('xlsx');

function getCategory(desc) {
  if (!desc) return 'כללי';
  if (/(דלק|פנגו|חניה|ביטוח רכב|מוסך)/.test(desc)) return 'רכב';
  if (/(אוכל|פיצה|בר|מסעדה|וולט|המבורגר|סושי|קפה|ארוחה|לחם|על האש|גלידה|יוגורט|מקסיקני|פירות)/.test(desc)) return 'מסעדות ופנאי';
  if (/(סופר|קניות|שופרסל|ויקטורי|רמי לוי|קפסולות|פיצוחים|דנונה|טופו|חומץ|שוםרסל)/.test(desc)) return 'סופרמרקט';
  if (/(אסוס|אליאקספרס|בגדים|זארה|שיין|Aliexpress|טמו|אמזון|אייהרב|לולו למון|נעליים|כובע|Figs)/.test(desc)) return 'קניות ובגדים';
  if (/(גוד פארם|סופר פארם|Be|פלקסיטול|משחות|תחבושות|גל דורקס)/.test(desc)) return 'פארם/בריאות';
  if (/(מפיצי ריח|לבית|חשמל|ריהוט|מקרר|ספה|מדפסת|מקס סטוק|Ksp|שואב|נרות)/.test(desc)) return 'לבית';
  if (/(ארנונה|מים|גז|חשמל|ועד בית|פרטנר)/.test(desc)) return 'חשבונות';
  if (/(רב קו|רכבת|אוטובוס)/.test(desc)) return 'תחבורה ציבורית';
  if (/(חול|אתונה|יורו|טיול)/.test(desc)) return 'חופשות וחו"ל';
  if (/(ביטוח דירה|ביטוח חול)/.test(desc)) return 'ביטוחים';
  if (/(חתונה|ברית)/.test(desc)) return 'אירועים ומתנות';
  return 'כללי';
}

const workbook = xlsx.readFile('חשבון משותף.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

const unknownDescriptions = new Set();
let negativeCount = 0;

for (let i = 1; i < data.length; i++) {
  const row = data[i];
  if (row.length === 0) continue;
  let amount = row[0];
  let description = row[1] || '';
  if (typeof amount !== 'number' || isNaN(amount)) continue;
  
  if (amount < 0) negativeCount++;
  
  if (amount > 0 && getCategory(description) === 'כללי') {
    unknownDescriptions.add(description);
  }
}

console.log('Negative entries (Incomes):', negativeCount);
console.log('Unknown expense descriptions:');
Array.from(unknownDescriptions).forEach(d => console.log(d));
