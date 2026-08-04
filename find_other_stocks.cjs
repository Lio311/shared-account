const { Client } = require('pg');

const sectors = {
  'NVDA': 'שבבים', 'AMD': 'שבבים', 'INTC': 'שבבים', 'TSM': 'שבבים', 'AVGO': 'שבבים', 'QCOM': 'שבבים', 'ASML': 'שבבים',
  'AAPL': 'חומרה ותוכנה', 'MSFT': 'תוכנה', 'GOOGL': 'תוכנה / שירותים', 'GOOG': 'תוכנה / שירותים', 'META': 'תוכנה / שירותים', 'AMZN': 'מסחר / ענן', 'ADBE': 'תוכנה', 'CRM': 'תוכנה',
  'JPM': 'פיננסים', 'BAC': 'פיננסים', 'V': 'פיננסים', 'MA': 'פיננסים', 'PYPL': 'פיננסים', 'WFC': 'פיננסים', 'GS': 'פיננסים',
  'JNJ': 'בריאות', 'UNH': 'בריאות', 'PFE': 'בריאות', 'ABBV': 'בריאות', 'LLY': 'בריאות', 'MRK': 'בריאות',
  'XOM': 'אנרגיה', 'CVX': 'אנרגיה', 'SHEL': 'אנרגיה',
  'SPY': 'מדדים', 'QQQ': 'מדדים', 'DIA': 'מדדים', 'VOO': 'מדדים', 'IVV': 'מדדים', 'VTI': 'מדדים', 'VT': 'מדדים',
  'TSLA': 'רכב / צריכה', 'WMT': 'קמעונאות', 'COST': 'קמעונאות', 'HD': 'קמעונאות',
  'CASH_ILS': 'מזומן', 'CASH_USD': 'מזומן',
};

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT DISTINCT symbol, name FROM portfolio_stocks WHERE status = 'active'");
  
  const others = res.rows.filter(r => !sectors[r.symbol]);
  console.log("Other stocks:");
  others.forEach(r => {
    console.log(`- ${r.symbol} ${r.name ? `(${r.name})` : ''}`);
  });
  await client.end();
}
main().catch(console.error);
