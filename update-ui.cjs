const fs = require('fs');
let code = fs.readFileSync('src/PortfolioView.jsx', 'utf8');

// 1. Add Search state
if (!code.includes('const [searchTerm, setSearchTerm]')) {
    code = code.replace(
        "const [isSoldStocksOpen, setIsSoldStocksOpen] = useState(false);",
        "const [isSoldStocksOpen, setIsSoldStocksOpen] = useState(false);\n  const [searchTerm, setSearchTerm] = useState('');"
    );
}

// 2. Add Search Bar UI and filter
if (!code.includes('filteredActiveStocks')) {
    code = code.replace(
        "const activeStocks = stocks.filter(s => s.status === 'active' && s.symbol !== 'CASH_ILS' && s.symbol !== 'CASH_USD');",
        "const activeStocks = stocks.filter(s => s.status === 'active' && s.symbol !== 'CASH_ILS' && s.symbol !== 'CASH_USD');\n  const filteredActiveStocks = activeStocks.filter(stock => stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || stock.name.toLowerCase().includes(searchTerm.toLowerCase()));"
    );
}

// 3. Update activeStocks mapping to filteredActiveStocks
code = code.replace(
    "<h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)', marginBottom: '1rem' }}>החזקות פעילות ({activeStocks.length})</h2>",
    `<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)', margin: 0 }}>החזקות פעילות ({activeStocks.length})</h2>
            <input 
               type="text" 
               placeholder="חיפוש לפי טיקר או שם חברה..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="form-input"
            />
         </div>`
);

code = code.replace(
    "{activeStocks.map(stock => (",
    "{filteredActiveStocks.map(stock => ("
);

code = code.replace(
    "{activeStocks.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>אין החזקות פעילות.</div>}",
    "{filteredActiveStocks.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>לא נמצאו החזקות פעילות שמתאימות לחיפוש.</div>}"
);

// 4. Update formatMoney to support left-side minus sign correctly, and native PnL formatting
const oldFormatMoney = `  const formatMoney = (val) => {
    const num = parseFloat(val || 0);
    const isNeg = num < 0;
    const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(num));
    return \`\${isNeg ? '-' : ''}₪\${formatted}\`;
  };`;

const newFormatMoney = `  const formatMoney = (val, currency = 'ILS') => {
    const num = parseFloat(val || 0);
    const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(num));
    const symbol = currency === 'ILS' ? '₪' : '$';
    return \`\${num < 0 ? '-' : ''}\${symbol}\${formatted}\`;
  };`;

code = code.replace(oldFormatMoney, newFormatMoney);

// 5. Update Unrealized PnL to use native currency logic and format correctly
code = code.replace(
    "<div>\n                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>רווח פתוח</div>\n                        <div style={{ fontWeight: 'bold', color: stock.unrealized_pl_ils >= 0 ? 'var(--income)' : 'var(--expense)' }} dir=\"ltr\">\n                           {stock.unrealized_pl_ils >= 0 ? '+' : ''}{formatMoney(stock.unrealized_pl_ils)}\n                        </div>\n                     </div>",
    `<div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>רווח פתוח</div>
                        <div style={{ fontWeight: 'bold', color: stock.unrealized_pl_fc >= 0 ? 'var(--income)' : 'var(--expense)' }} dir="ltr">
                           {stock.unrealized_pl_fc >= 0 ? '+' : ''}{formatMoney(stock.unrealized_pl_fc, stock.currency)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: stock.unrealized_pl_percent >= 0 ? 'var(--income)' : 'var(--expense)' }} dir="ltr">
                           ({stock.unrealized_pl_percent >= 0 ? '+' : ''}{parseFloat(stock.unrealized_pl_percent).toFixed(2)}%)
                        </div>
                     </div>`
);


fs.writeFileSync('src/PortfolioView.jsx', code);
console.log("Updated PortfolioView.jsx successfully");
