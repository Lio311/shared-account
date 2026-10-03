import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, ChevronDown, PlusCircle, TrendingUp, TrendingDown, ArrowRight, ArrowUpDown, PieChart, LineChart, Wallet, Newspaper } from 'lucide-react';
import StockResearchPanel from './StockResearchPanel';
import { numberOrNull, numberOrZero, positiveNumber, formatPortfolioMoney, filterAndSortHoldings, validTransactionDate } from './portfolioUtils.mjs';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

export default function PortfolioView({ investmentId, investmentName, onBack, showToast }) {
  const [stocks, setStocks] = useState([]);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [totalDeposited, setTotalDeposited] = useState(0);
  const [overallPlIls, setOverallPlIls] = useState(0);
  const [loading, setLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState('');
  const [loadedInvestmentId, setLoadedInvestmentId] = useState(null);
  const [retrievedAt, setRetrievedAt] = useState(null);
  const [valuationWarnings, setValuationWarnings] = useState([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const scopeRef = useRef(investmentId);
  const portfolioRequest = useRef(0);
  const historyRequest = useRef(0);
  const toastRef = useRef(showToast);
  useEffect(() => { toastRef.current = showToast; }, [showToast]);

  
  // Tabs & History
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get('view') === 'research' ? 'research' : 'portfolio');
  const [allocationView, setAllocationView] = useState('stock'); // 'stock' or 'sector'
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyInvestmentId, setHistoryInvestmentId] = useState(null);
  
  // Modals
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [isSoldStocksOpen, setIsSoldStocksOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState('default');
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMode, setDepositMode] = useState('add'); // 'add' or 'set'

  // Buy Form
  const [buySymbol, setBuySymbol] = useState('');
  const [buyShares, setBuyShares] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyCurrency, setBuyCurrency] = useState('USD');
  const [buyDate, setBuyDate] = useState(new Date());

  // Sell Form
  const [sellPrice, setSellPrice] = useState('');
  const [sellShares, setSellShares] = useState('');
  const [sellDate, setSellDate] = useState(new Date());
  const dialogRef = useRef(null);
  const modalOpen = isBuyModalOpen || isSellModalOpen || isDepositModalOpen;
  useEffect(() => {
    if (!modalOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const selector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';
    const calendar = () => document.getElementById('root-portal');
    const inside = element => dialog.contains(element) || Boolean(calendar()?.contains(element));
    const focusables = () => [...dialog.querySelectorAll(selector), ...(calendar()?.querySelectorAll(selector) || [])].filter(element => element.getClientRects().length > 0 && element.tabIndex >= 0);
    const frame = requestAnimationFrame(() => (dialog.querySelector('input:not(:disabled)') || focusables()[0] || dialog).focus());
    const handleKey = event => {
      if (event.key === 'Escape') {
        if (savingRef.current || calendar()?.querySelector('.react-datepicker')) return;
        event.preventDefault();
        setIsBuyModalOpen(false);
        setIsSellModalOpen(false);
        setIsDepositModalOpen(false);
      }
      if (event.key !== 'Tab') return;
      const elements = focusables();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !inside(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !inside(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const handleFocus = event => {
      if (!inside(event.target)) (focusables()[0] || dialog).focus();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', handleFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', handleFocus);
      document.body.style.overflow = oldOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [modalOpen]);




  const responseError = async (res, fallback) => {
    if (res.status === 401) {
      window.dispatchEvent(new Event('shared-account-auth-expired'));
      return 'ההתחברות פגה. יש להתחבר שוב כדי להמשיך.';
    }
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      const message = data.error || data.message || fallback;
      const translations = {
        'Investment not found': 'התיק לא נמצא. חזור לרשימת ההשקעות.',
        'Insufficient cash balance in purchase currency': 'אין מספיק מזומן במטבע הקנייה. יש לעדכן את יתרת המזומן לפני רישום הקנייה.',
        'Currency must match existing holding': 'מטבע הקנייה חייב להתאים למטבע ההחזקה הקיימת.',
        'Holding is not available for sale': 'ההחזקה אינה זמינה למכירה. רענן את התיק.',
        'Sale quantity exceeds available shares': 'כמות המכירה גדולה מהיתרה הזמינה. רענן את התיק.',
        'Sale date precedes purchase date': 'תאריך המכירה קודם לתאריך הקנייה.',
        'Deposit correction exceeds available cash': 'תיקון ההפקדות גדול מיתרת המזומן הזמינה.',
        'Portfolio operation failed': 'שמירת הפעולה נכשלה. נסה שוב.',
      };
      if (typeof message === 'string' && message.startsWith('Exchange rate unavailable')) return 'שער ההמרה אינו זמין כרגע. הפעולה לא נשמרה; נסה שוב מאוחר יותר.';
      return translations[message] || message;
    }
    catch { return text && !text.includes('<') && text.length < 250 ? text : fallback; }
  };

  const fetchPortfolio = useCallback(async () => {
    const request = ++portfolioRequest.current;
    await Promise.resolve();
    if (request !== portfolioRequest.current || scopeRef.current !== investmentId) return;
    setLoading(true);
    setPortfolioError('');
    try {
      const res = await fetch(`/api/portfolio?investment_id=${encodeURIComponent(investmentId)}`);
      if (!res.ok) throw new Error(await responseError(res, 'שגיאה במשיכת התיק'));
      const data = await res.json();
      if (!Array.isArray(data.stocks) || numberOrNull(data.portfolioValue) === null) throw new Error('השרת החזיר נתוני תיק לא תקינים');
      if (request !== portfolioRequest.current || scopeRef.current !== investmentId) return;
      setStocks(data.stocks);
      setPortfolioValue(numberOrZero(data.portfolioValue));
      setTotalDeposited(numberOrZero(data.totalDeposited));
      setOverallPlIls(numberOrNull(data.overallPlIls) ?? (numberOrZero(data.portfolioValue) - numberOrZero(data.totalDeposited)));
      setValuationWarnings(Array.isArray(data.valuation_warnings) ? data.valuation_warnings : []);
      setLoadedInvestmentId(investmentId);
      setRetrievedAt(new Date());
    } catch (err) {
      if (request === portfolioRequest.current && scopeRef.current === investmentId) setPortfolioError(err.message || 'שגיאת רשת');
    } finally {
      if (request === portfolioRequest.current && scopeRef.current === investmentId) setLoading(false);
    }
  }, [investmentId]);

  const fetchHistory = useCallback(async () => {
    const request = ++historyRequest.current;
    await Promise.resolve();
    if (request !== historyRequest.current || scopeRef.current !== investmentId) return;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await fetch(`/api/portfolio-history?investment_id=${encodeURIComponent(investmentId)}`);
      if (!res.ok) throw new Error(await responseError(res, 'שגיאה במשיכת היסטוריה'));
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('נתוני ההיסטוריה אינם תקינים');
      if (request !== historyRequest.current || scopeRef.current !== investmentId) return;
      setHistoryData(data.filter(row => Number.isFinite(new Date(row.date).getTime()) && numberOrNull(row.total_value_ils) !== null).sort((a, b) => new Date(a.date) - new Date(b.date)));
      setHistoryInvestmentId(investmentId);
    } catch (err) {
      if (request === historyRequest.current && scopeRef.current === investmentId) {
        setHistoryError(err.message || 'שגיאת רשת בהיסטוריה');
        setHistoryInvestmentId(investmentId);
      }
    } finally {
      if (request === historyRequest.current && scopeRef.current === investmentId) setHistoryLoading(false);
    }
  }, [investmentId]);

  useEffect(() => {
    scopeRef.current = investmentId;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) fetchPortfolio(); });
    return () => { cancelled = true; scopeRef.current = null; };
  }, [investmentId, fetchPortfolio]);

  useEffect(() => {
    let cancelled = false;
    if (activeTab === 'history' && historyInvestmentId !== investmentId) queueMicrotask(() => { if (!cancelled) fetchHistory(); });
    return () => { cancelled = true; };
  }, [activeTab, fetchHistory, historyInvestmentId, investmentId]);

  const saveTransaction = async (method, body, success, closeModal) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const scope = investmentId;
    try {
      const res = await fetch('/api/portfolio', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await responseError(res, 'שמירת הפעולה נכשלה'));
      if (scopeRef.current !== scope) return;
      toastRef.current(success);
      closeModal();
      historyRequest.current++;
      setHistoryInvestmentId(null);
      await fetchPortfolio();
    } catch (err) {
      if (scopeRef.current === scope) toastRef.current(err.message || 'שגיאת רשת', 'error');
    } finally { savingRef.current = false; setSaving(false); }
  };

  const handleDeposit = e => {
    e.preventDefault();
    const amount = positiveNumber(depositAmount);
    if (amount === null) { showToast('הזן סכום חיובי ותקין', 'error'); return; }
    saveTransaction('PATCH', depositMode === 'add' ? { investment_id: investmentId, add_amount: amount } : { investment_id: investmentId, set_amount: amount }, 'ההפקדות עודכנו בהצלחה', () => { setIsDepositModalOpen(false); setDepositAmount(''); });
  };

  const handleBuy = e => {
    e.preventDefault();
    const symbol = buySymbol.trim().toUpperCase();
    const shares = positiveNumber(buyShares);
    const price = positiveNumber(buyPrice);
    if (!/^[A-Z0-9][A-Z0-9.^=-]{0,19}$/.test(symbol) || symbol.startsWith('CASH_') || shares === null || price === null || !validTransactionDate(buyDate)) {
      showToast('יש להזין סימול תקין, כמות ומחיר חיוביים ותאריך שאינו בעתיד', 'error'); return;
    }
    saveTransaction('POST', { investment_id: investmentId, symbol, shares, currency: buyCurrency, purchase_price_fc: price, purchase_date: format(buyDate, 'yyyy-MM-dd') }, 'מניה נוספה בהצלחה!', () => { setIsBuyModalOpen(false); setBuySymbol(''); setBuyShares(''); setBuyPrice(''); });
  };

  const handleSell = e => {
    e.preventDefault();
    const shares = positiveNumber(sellShares);
    const price = positiveNumber(sellPrice);
    if (!selectedStock || shares === null || shares > numberOrZero(selectedStock.shares) || price === null || !validTransactionDate(sellDate, selectedStock.purchase_date)) {
      showToast('יש להזין כמות עד יתרת ההחזקה, מחיר חיובי ותאריך מכירה תקין', 'error'); return;
    }
    saveTransaction('PUT', { id: selectedStock.id, sale_price_fc: price, sale_shares: shares, sale_date: format(sellDate, 'yyyy-MM-dd') }, 'מניה נמכרה בהצלחה!', () => { setIsSellModalOpen(false); setSellPrice(''); setSellShares(''); });
  };

  const cashStocks = stocks.filter(s => s.status === 'active' && String(s.symbol || '').startsWith('CASH_'));
  const activeStocks = stocks.filter(s => s.status === 'active' && !String(s.symbol || '').startsWith('CASH_') && numberOrZero(s.shares) > 0);
  const filteredActiveStocks = filterAndSortHoldings(activeStocks, searchTerm, sortOption);
  const soldStocks = stocks.filter(s => s.status === 'sold');
  const totalRealizedPl = soldStocks.reduce((sum, s) => sum + numberOrZero(s.realized_pl_ils), 0);
  const formatMoney = formatPortfolioMoney;
  const formatPercent = value => numberOrNull(value) === null ? '—' : `${numberOrZero(value).toFixed(2)}%`;

  // Charts Setup
  const historyChartData = {
    labels: historyData.map(d => format(new Date(d.date), 'dd/MM/yyyy')),
    datasets: [
      {
        label: 'שווי תיק (₪)',
        data: historyData.map(d => parseFloat(d.total_value_ils)),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        tension: 0.3,
        fill: true,
      }
    ]
  };

  const historyChartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: false }
    },
    scales: {
      y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      x: { ticks: { color: '#9ca3af' }, grid: { display: false } }
    }
  };

  const getSector = (symbol) => {
    const sectors = {
      'NVDA': 'שבבים', 'AMD': 'שבבים', 'INTC': 'שבבים', 'TSM': 'שבבים', 'AVGO': 'שבבים', 'QCOM': 'שבבים', 'ASML': 'שבבים', 'NVDL': 'שבבים', 'MU': 'שבבים',
      'AAPL': 'חומרה ותוכנה', 'MSFT': 'תוכנה', 'GOOGL': 'תוכנה / שירותים', 'GOOG': 'תוכנה / שירותים', 'META': 'תוכנה / שירותים', 'AMZN': 'מסחר / ענן', 'ADBE': 'תוכנה', 'CRM': 'תוכנה',
      'PATH': 'תוכנה', 'MNDY': 'תוכנה', 'SHOP': 'תוכנה', 'UBER': 'תוכנה', 'PLTR': 'תוכנה',
      'JPM': 'פיננסים', 'BAC': 'פיננסים', 'V': 'פיננסים', 'MA': 'פיננסים', 'PYPL': 'פיננסים', 'WFC': 'פיננסים', 'GS': 'פיננסים', 'SOFI': 'פיננסים', 'PGY': 'פיננסים', 'LMND': 'פיננסים',
      'JNJ': 'בריאות', 'UNH': 'בריאות', 'PFE': 'בריאות', 'ABBV': 'בריאות', 'LLY': 'בריאות', 'MRK': 'בריאות', 'MRNA': 'בריאות',
      'XOM': 'אנרגיה', 'CVX': 'אנרגיה', 'SHEL': 'אנרגיה',
      'SPY': 'מדדים', 'QQQ': 'מדדים', 'DIA': 'מדדים', 'VOO': 'מדדים', 'IVV': 'מדדים', 'VTI': 'מדדים', 'VT': 'מדדים', '1183441': 'מדדים', '1159250': 'מדדים', 'IWM': 'מדדים', 'VIXY': 'מדדים', 'MAGS': 'מדדים',
      'TSLA': 'רכב / צריכה', 'WMT': 'קמעונאות', 'COST': 'קמעונאות', 'HD': 'קמעונאות',
      'CASH_ILS': 'מזומן', 'CASH_USD': 'מזומן',
      'LMT': 'תעופה', 'GE': 'תעופה', 'RTX': 'תעופה',
      'SCHD': 'דיבידנדים',
      'WKEY': 'קוונטי', 'LAES': 'קוונטי', 'IBM': 'קוונטי',
      'SOLZ': 'קריפטו', 'IBIT': 'קריפטו', 'ETHA': 'קריפטו', 'IREN': 'קריפטו', 'GLXY': 'קריפטו',
      'DELL': 'חומרה', 'SMCI': 'חומרה',
    };
    return sectors[symbol] || 'אחר';
  };

  let allocationLabels;
  let allocationData;

  if (allocationView === 'stock') {
    allocationLabels = [...cashStocks.map(s => `מזומן ${s.currency || String(s.symbol).replace('CASH_', '')}`), ...activeStocks.map(s => s.symbol)];
    allocationData = [...cashStocks.map(s => Math.max(0, numberOrZero(s.current_value_ils))), ...activeStocks.map(s => Math.max(0, numberOrZero(s.current_value_ils)))];
  } else {
    const sectorTotals = {};
    cashStocks.forEach(s => {
      sectorTotals['מזומן'] = (sectorTotals['מזומן'] || 0) + Math.max(0, numberOrZero(s.current_value_ils));
    });
    activeStocks.forEach(s => {
      const sector = getSector(s.symbol);
      sectorTotals[sector] = (sectorTotals[sector] || 0) + Math.max(0, numberOrZero(s.current_value_ils));
    });
    allocationLabels = Object.keys(sectorTotals).sort((a, b) => sectorTotals[b] - sectorTotals[a]);
    allocationData = allocationLabels.map(sec => sectorTotals[sec]);
  }

  const pieColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f43f5e', '#6366f1', '#64748b', '#84cc16'];

  const allocationChartData = {
    labels: allocationLabels,
    datasets: [{
      data: allocationData,
      backgroundColor: allocationData.map((_, index) => pieColors[index % pieColors.length]),
      borderWidth: 0,
      hoverOffset: 4
    }]
  };
  
  const allocationChartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: () => null,
          label: function(context) {
             let label = '';
             if (context.parsed !== null) {
                label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'ILS' }).format(context.parsed);
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = (total > 0 ? (context.parsed * 100) / total : 0).toFixed(1) + '%';
                label += ` (${percentage})`;
             }
             return label;
          }
        }
      }
    },
    cutout: '65%'
  };

  if (loadedInvestmentId !== investmentId) return (
    <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }} role="status">
      <button className="btn-secondary" onClick={onBack}>חזרה</button>
      <p>{portfolioError || 'טוען נתוני תיק...'}</p>
      {portfolioError && <button className="btn-primary" onClick={fetchPortfolio} disabled={loading}>נסה שוב</button>}
    </div>
  );

  return (
    <div style={{ paddingBottom: '80px', display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
         <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
           <button aria-label="חזרה לרשימת ההשקעות" onClick={onBack} className="btn-secondary" style={{ padding: '0.5rem' }}>
              <ArrowRight size={20} />
           </button>
         </div>
         <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-main)', textAlign: 'center' }}>{investmentName}</h1>
         <button className="btn-secondary" onClick={fetchPortfolio} disabled={loading || saving}>{loading ? 'מרענן...' : 'רענון'}</button>
      </div>

      {portfolioError && <div role="alert" className="glass-card" style={{ padding: '1rem', color: 'var(--expense)' }}>הרענון נכשל: {portfolioError}. מוצגים הנתונים האחרונים שהתקבלו.</div>}
      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>נתונים התקבלו: {retrievedAt?.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}. מועד קבלת הנתונים אינו מועד עדכון מחירי השוק.</div>
      {valuationWarnings.length > 0 && <div role="status" className="glass-card" style={{ padding: '1rem' }}>חלק מהמחירים הם אומדנים שמורים: {valuationWarnings.map(item => typeof item === 'string' ? item : item.symbol || item.message || 'מחיר לא זמין').join(', ')}</div>}
      {/* Summary Card */}
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(37,99,235,0.1) 100%)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>שווי התיק העדכני</div>
          <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--text-main)' }} dir="ltr">{formatMoney(portfolioValue)}</div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
           <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>רווח/הפסד כולל (vs הפקדות)</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 'bold', color: overallPlIls >= 0 ? 'var(--income)' : 'var(--expense)' }} dir="ltr">
                 {overallPlIls >= 0 ? '+' : ''}{formatMoney(overallPlIls)}
              </div>
              {totalDeposited > 0 && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span>
                     <span dir="ltr">{overallPlIls >= 0 ? '+' : ''}{((overallPlIls / totalDeposited) * 100).toFixed(2)}%</span>
                     {' על '}
                     <span dir="ltr">{formatMoney(totalDeposited)}</span>
                     {' שהופקדו'}
                  </span>
                  <button
                    onClick={() => { setDepositMode('add'); setIsDepositModalOpen(true); }}
                    style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', borderRadius: '0.4rem', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}
                  >+ עדכן הפקדות</button>
                </div>
              )}
           </div>
           <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
           <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>רווח ממומש</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 'bold', color: totalRealizedPl >= 0 ? 'var(--income)' : 'var(--expense)' }} dir="ltr">
                 {totalRealizedPl >= 0 ? '+' : ''}{formatMoney(totalRealizedPl)}
              </div>
           </div>
        </div>
      </div>

      {totalDeposited <= 0 && <button className="btn-secondary" onClick={() => { setDepositMode('add'); setIsDepositModalOpen(true); }}>עדכון הפקדות</button>}
      {/* Action Button */}
      <button className="btn-primary" onClick={() => setIsBuyModalOpen(true)} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '1rem' }}>
        <PlusCircle size={20} />
        קניית מניה חדשה
      </button>

      {/* Tabs */}
      <div role="tablist" aria-label="תצוגות תיק ההשקעות" style={{ display: 'flex', gap: '0.25rem', background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.8)', padding: '0.35rem', borderRadius: '1rem', marginBottom: '0.5rem', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
        <button 
          role="tab" aria-selected={activeTab === 'portfolio'}
          onClick={() => setActiveTab('portfolio')} 
          style={{ flex: 1, minWidth: 0, padding: '0.75rem 0.2rem', borderRadius: '0.75rem', border: 'none', background: activeTab === 'portfolio' ? 'var(--accent)' : 'transparent', color: activeTab === 'portfolio' ? 'white' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: activeTab === 'portfolio' ? 'bold' : '500', transition: 'all 0.3s ease', boxShadow: activeTab === 'portfolio' ? '0 4px 12px rgba(59,130,246,0.25)' : 'none' }}>
          <Wallet size={16} /> התיק
        </button>
        <button 
          role="tab" aria-selected={activeTab === 'history'}
          onClick={() => setActiveTab('history')} 
          style={{ flex: 1, minWidth: 0, padding: '0.75rem 0.2rem', borderRadius: '0.75rem', border: 'none', background: activeTab === 'history' ? 'var(--accent)' : 'transparent', color: activeTab === 'history' ? 'white' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: activeTab === 'history' ? 'bold' : '500', transition: 'all 0.3s ease', boxShadow: activeTab === 'history' ? '0 4px 12px rgba(59,130,246,0.25)' : 'none' }}>
          <LineChart size={16} /> מגמה
        </button>
        <button 
          role="tab" aria-selected={activeTab === 'allocation'}
          onClick={() => setActiveTab('allocation')} 
          style={{ flex: 1, minWidth: 0, padding: '0.75rem 0.2rem', borderRadius: '0.75rem', border: 'none', background: activeTab === 'allocation' ? 'var(--accent)' : 'transparent', color: activeTab === 'allocation' ? 'white' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: activeTab === 'allocation' ? 'bold' : '500', transition: 'all 0.3s ease', boxShadow: activeTab === 'allocation' ? '0 4px 12px rgba(59,130,246,0.25)' : 'none' }}>
          <PieChart size={16} /> פיזור
        </button>
        <button
          role="tab" aria-selected={activeTab === 'research'}
          onClick={() => setActiveTab('research')}
          style={{ flex: 1, minWidth: 0, padding: '0.75rem 0.2rem', borderRadius: '0.75rem', border: 'none', background: activeTab === 'research' ? 'var(--accent)' : 'transparent', color: activeTab === 'research' ? 'white' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: activeTab === 'research' ? 'bold' : '500', transition: 'all 0.3s ease' }}>
          <Newspaper size={16} /> מחקר
        </button>
      </div>

      {activeTab === 'history' && (
         <div className="glass-card" style={{ padding: '1.5rem', minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)', marginBottom: '1.5rem' }}>היסטוריית שווי התיק</h2>
            {historyLoading || historyInvestmentId !== investmentId ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>טוען נתונים...</div>
            ) : historyError ? (<div role="alert"><p>{historyError}</p><button className="btn-secondary" onClick={fetchHistory}>נסה שוב</button></div>) : historyData.length > 0 ? (
              <Line options={historyChartOptions} data={historyChartData} />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>אין עדיין נתוני היסטוריה לתיק הזה.</div>
            )}
         </div>
      )}

      {activeTab === 'allocation' && (
         <div className="glass-card" style={{ padding: '1.5rem', minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', width: '100%', marginBottom: '1.5rem', direction: 'rtl' }}>
              <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(0,0,0,0.05)', padding: '0.25rem', borderRadius: '0.5rem' }}>
                <button
                  onClick={() => setAllocationView('stock')}
                  style={{
                    border: 'none', padding: '0.35rem 0.6rem', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold',
                    background: allocationView === 'stock' ? 'white' : 'transparent',
                    color: allocationView === 'stock' ? 'var(--accent)' : 'var(--text-muted)',
                    boxShadow: allocationView === 'stock' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  לפי מניות
                </button>
                <button
                  onClick={() => setAllocationView('sector')}
                  style={{
                    border: 'none', padding: '0.35rem 0.6rem', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold',
                    background: allocationView === 'sector' ? 'white' : 'transparent',
                    color: allocationView === 'sector' ? 'var(--accent)' : 'var(--text-muted)',
                    boxShadow: allocationView === 'sector' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  לפי סקטורים
                </button>
              </div>
            </div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)', margin: 0, marginBottom: '1.25rem', width: '100%', textAlign: 'right' }}>התפלגות נכסים</h2>
            {allocationData.some(value => value > 0) ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
                <div style={{ width: '100%', maxWidth: '300px' }}>
                  <Doughnut options={allocationChartOptions} data={allocationChartData} />
                </div>
                <div style={{ 
                  width: '100%', 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', 
                  columnGap: '0.25rem',
                  rowGap: '0.75rem',
                  direction: 'rtl'
                }}>
                  {allocationLabels.map((label, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-start', minWidth: 0 }}>
                      <div style={{ 
                        width: '12px', 
                        height: '12px', 
                        backgroundColor: pieColors[index % pieColors.length],
                        borderRadius: '3px',
                        flexShrink: 0
                      }} />
                      <span style={{ 
                        color: 'var(--text-main)', 
                        fontSize: '0.75rem', 
                        fontWeight: '600',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
               <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>אין נכסים פעילים בתיק.</div>
            )}
         </div>
      )}

      {activeTab === 'portfolio' && (
         <>
            {/* Cash Balances */}
            {cashStocks.length > 0 && (
               <div>
                  <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)', marginBottom: '1rem' }}>יתרות מזומן</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                     {cashStocks.map(stock => (
                        <div key={stock.id} className="glass-card" style={{ padding: '1.5rem', textAlign: 'center', borderTop: stock.symbol === 'CASH_USD' ? '4px solid #10b981' : '4px solid #3b82f6' }}>
                           <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                              {`מזומן (${stock.currency || String(stock.symbol).replace('CASH_', '')})`}
                           </div>
                           <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)' }} dir="ltr">
                              {formatMoney(stock.shares, stock.currency || String(stock.symbol).replace('CASH_', ''))}
                           </div>
                           {stock.symbol !== 'CASH_ILS' && (
                              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                 ≈ {formatMoney(stock.current_value_ils)}
                              </div>
                           )}
                        </div>
                     ))}
                  </div>
               </div>
            )}

            {/* Active Stocks */}
            <div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)', margin: 0 }}>החזקות פעילות ({activeStocks.length})</h2>
                  <input 
                     type="text" 
                     aria-label="חיפוש החזקות לפי סימול או שם חברה"
                     placeholder="חיפוש לפי טיקר או שם חברה..." 
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                     className="form-input"
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                     <ArrowUpDown size={16} color="var(--text-muted)" />
                     <select
                        aria-label="מיון החזקות"
                        value={sortOption}
                        onChange={(e) => setSortOption(e.target.value)}
                        style={{
                           flex: 1,
                           padding: '0.6rem 0.75rem',
                           borderRadius: '0.75rem',
                           border: '1px solid rgba(255,255,255,0.1)',
                           background: 'rgba(255,255,255,0.05)',
                           color: 'var(--text-main)',
                           fontSize: '0.875rem',
                           cursor: 'pointer',
                           appearance: 'none',
                           WebkitAppearance: 'none',
                           backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                           backgroundRepeat: 'no-repeat',
                           backgroundPosition: 'left 0.75rem center',
                           paddingLeft: '2rem'
                        }}
                     >
                        <option value="default">ברירת מחדל</option>
                        <option value="pct_high">% מההגבוה לנמוך</option>
                        <option value="pct_low">% מהנמוך לגבוה</option>
                        <option value="ils_high">₪ מההגבוה לנמוך</option>
                        <option value="ils_low">₪ מהנמוך לגבוה</option>
                        <option value="return_high">התשואה הגבוהה ביותר</option>
                        <option value="return_low">התשואה הנמוכה ביותר</option>
                     </select>
                  </div>
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {filteredActiveStocks.map(stock => (
                     <div key={stock.id} className="glass-card" style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                           <div>
                              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{stock.symbol}</div>
                              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{stock.name || 'שם חברה לא זמין'}</div>
                              {stock.valuation_status && stock.valuation_status === 'stored_estimate' && <div style={{ fontSize: '0.75rem', color: 'var(--expense)' }}>מחיר משוער • נדרש אימות</div>}
                              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{parseFloat(stock.shares)} מניות</div>
                           </div>
                           <div style={{ textAlign: 'left' }}>
                              <div style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--text-main)' }} dir="ltr">
                                 {formatMoney(stock.current_price_fc, stock.currency)}
                              </div>
                              {stock.current_quote_time && Number.isFinite(new Date(stock.current_quote_time).getTime()) && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>מחיר שוק: {new Date(stock.current_quote_time).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}</div>}
                              <div style={{ fontSize: '0.875rem', fontWeight: 'bold', color: stock.day_change_percent >= 0 ? 'var(--income)' : 'var(--expense)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }} dir="ltr">
                                 {stock.day_change_percent >= 0 ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
                                 {stock.valuation_status === 'stored_estimate' ? '—' : formatPercent(stock.day_change_percent)}
                              </div>
                           </div>
                        </div>
                        
                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>שווי אחזקה (₪)</div>
                              <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }} dir="ltr">{formatMoney(stock.current_value_ils)}</div>
                           </div>
                           <div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>רווח פתוח</div>
                              <div style={{ fontWeight: 'bold', color: stock.unrealized_pl_fc >= 0 ? 'var(--income)' : 'var(--expense)' }} dir="ltr">
                                 {stock.unrealized_pl_fc >= 0 ? '+' : ''}{formatMoney(stock.unrealized_pl_fc, stock.currency)}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: stock.unrealized_pl_percent >= 0 ? 'var(--income)' : 'var(--expense)' }} dir="ltr">
                                 ({stock.unrealized_pl_percent >= 0 ? '+' : ''}{formatPercent(stock.unrealized_pl_percent)})
                              </div>
                           </div>
                           <button 
                              onClick={() => { setSelectedStock(stock); setSellShares(String(stock.shares)); setSellPrice(''); setSellDate(new Date()); setIsSellModalOpen(true); }}
                              style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.4rem 1rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                           >
                              מכירה
                           </button>
                        </div>
                     </div>
                  ))}
                  {filteredActiveStocks.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{activeStocks.length === 0 ? 'אין החזקות פעילות בתיק. אפשר לרשום קנייה חדשה.' : 'לא נמצאו החזקות שמתאימות לחיפוש.'}</div>}
               </div>
            </div>

            {/* Sold Stocks */}
            {soldStocks.length > 0 && (
               <div style={{ marginTop: '1rem' }}>
                  <button
                     type="button"
                     aria-expanded={isSoldStocksOpen}
                     className="btn-secondary"
                     onClick={() => setIsSoldStocksOpen(!isSoldStocksOpen)} 
                     style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '0.5rem', marginBottom: '1rem' }}
                  >
                     {isSoldStocksOpen ? <ChevronDown size={20} color="var(--text-main)" /> : <ChevronRight size={20} color="var(--text-main)" />}
                     <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)', margin: 0 }}>היסטוריית עסקאות (מניות שנמכרו)</h2>
                  </button>
                  {isSoldStocksOpen && (
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {soldStocks.map(stock => (
                           <div key={stock.id} className="glass-card" style={{ padding: '1rem', opacity: 0.8 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                 <div>
                                    <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{String(stock.symbol || '').replace('_SOLD', '')}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stock.name || 'שם חברה לא זמין'}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>נמכר ב-{(Number.isFinite(new Date(stock.sale_date).getTime()) ? format(new Date(stock.sale_date), 'dd/MM/yyyy') : 'תאריך לא זמין')}</div>
                                 </div>
                                 <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>רווח ממומש</div>
                                    <div style={{ fontWeight: 'bold', color: stock.realized_pl_ils >= 0 ? 'var(--income)' : 'var(--expense)' }} dir="ltr">
                                       {stock.realized_pl_ils >= 0 ? '+' : ''}{formatMoney(stock.realized_pl_ils)}
                                    </div>
                                 </div>
                              </div>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
            )}
         </>
      )}

      {activeTab === 'research' && <StockResearchPanel stocks={stocks} />}

      {/* Modals */}
      {isBuyModalOpen && (
        <div className="modal-overlay">
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="עדכון תיק ההשקעות" className="modal-content glass-card" style={{ position: 'relative' }}>
            <button aria-label="סגירת חלון" disabled={saving} onClick={() => setIsBuyModalOpen(false)} style={{
              position: 'absolute', top: '1rem', left: '1rem',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: '1.5rem', lineHeight: 1, color: 'var(--text-muted)',
              padding: '0.25rem', zIndex: 10
            }}>×</button>
            <div className="modal-header">
              <h2>קניית מניה</h2>
            </div>
            <form onSubmit={handleBuy} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label htmlFor="buy-symbol">סימול מניה (למשל AAPL)</label>
                <input id="buy-symbol" type="text" value={buySymbol} onChange={e => setBuySymbol(e.target.value)} required dir="ltr" />
              </div>
              <div>
                <label htmlFor="buy-shares">כמות מניות</label>
                <input id="buy-shares" type="number" min="0.00000001" step="any" value={buyShares} onChange={e => setBuyShares(e.target.value)} required dir="ltr" />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                 <div style={{ flex: 1 }}>
                   <label htmlFor="buy-price">מחיר קנייה</label>
                   <input id="buy-price" type="number" min="0.00000001" step="any" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} required dir="ltr" />
                 </div>
                 <div style={{ width: '80px' }}>
                   <label htmlFor="buy-currency">מטבע</label>
                   <select id="buy-currency" value={buyCurrency} onChange={e => setBuyCurrency(e.target.value)} dir="ltr">
                      <option value="USD">USD</option>
                      <option value="ILS">ILS</option>
                      <option value="EUR">EUR</option>
                   </select>
                 </div>
              </div>
              <div>
                 <label htmlFor="buy-date">תאריך קנייה</label>
                  <DatePicker
                     id="buy-date"
                     selected={buyDate}
                     maxDate={new Date()}
                     onChange={date => setBuyDate(date)}
                     locale={he}
                     dateFormat="dd/MM/yyyy"
                     className="date-picker-input"
                     popperPlacement="bottom-start"
                     portalId="root-portal"
                  />
              </div>
              <button type="submit" disabled={saving} className="btn-primary" style={{ marginTop: '1rem' }}>הוסף לתיק</button>
            </form>
          </div>
        </div>
      )}

      {isSellModalOpen && selectedStock && (
        <div className="modal-overlay">
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="עדכון תיק ההשקעות" className="modal-content glass-card" style={{ position: 'relative' }}>
            <button aria-label="סגירת חלון" disabled={saving} onClick={() => setIsSellModalOpen(false)} style={{
              position: 'absolute', top: '1rem', left: '1rem',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: '1.5rem', lineHeight: 1, color: 'var(--text-muted)',
              padding: '0.25rem', zIndex: 10
            }}>×</button>
            <div className="modal-header">
              <h2>מכירת {selectedStock.symbol}</h2>
            </div>
            <form onSubmit={handleSell} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label htmlFor="sell-shares">כמות למכירה (מתוך {selectedStock.shares})</label>
                <input id="sell-shares" type="number" min="0.00000001" step="any" max={selectedStock.shares} value={sellShares} onChange={e => setSellShares(e.target.value)} required dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }} placeholder={selectedStock.shares} />
              </div>
              <div>
                <label htmlFor="sell-price">מחיר מכירה במטבע ({selectedStock.currency})</label>
                <input id="sell-price" type="number" min="0.00000001" step="any" value={sellPrice} onChange={e => setSellPrice(e.target.value)} required dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }} />
              </div>
              <div>
                 <label htmlFor="sell-date">תאריך מכירה</label>
                 <DatePicker
                    id="sell-date"
                    selected={sellDate}
                    maxDate={new Date()}
                    minDate={selectedStock.purchase_date ? new Date(selectedStock.purchase_date) : undefined}
                    onChange={date => setSellDate(date)}
                    locale={he}
                    dateFormat="dd/MM/yyyy"
                    className="date-picker-input"
                    popperPlacement="bottom-start"
                    portalId="root-portal"
                 />
              </div>
              <button type="submit" disabled={saving} className="btn-primary" style={{ marginTop: '1rem', background: 'var(--expense)' }}>
                 בצע מכירה
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {isDepositModalOpen && (
        <div className="modal-overlay">
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="עדכון תיק ההשקעות" className="modal-content glass-card" style={{ position: 'relative' }}>
            <button aria-label="סגירת חלון" disabled={saving} onClick={() => setIsDepositModalOpen(false)} style={{
              position: 'absolute', top: '1rem', left: '1rem',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: '1.5rem', lineHeight: 1, color: 'var(--text-muted)', padding: '0.25rem', zIndex: 10
            }}>×</button>
            <div className="modal-header">
              <h2>עדכון הפקדות לתיק</h2>
            </div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', background: 'rgba(0,0,0,0.05)', borderRadius: '0.75rem', padding: '0.25rem' }}>
              <button
                onClick={() => setDepositMode('add')}
                style={{ flex: 1, padding: '0.5rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontWeight: depositMode === 'add' ? '700' : '400', background: depositMode === 'add' ? 'white' : 'transparent', boxShadow: depositMode === 'add' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', color: 'var(--text-main)', transition: 'all 0.2s' }}
              >הוסף הפקדה</button>
              <button
                onClick={() => setDepositMode('set')}
                style={{ flex: 1, padding: '0.5rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontWeight: depositMode === 'set' ? '700' : '400', background: depositMode === 'set' ? 'white' : 'transparent', boxShadow: depositMode === 'set' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', color: 'var(--text-main)', transition: 'all 0.2s' }}
              >עדכן סכום כולל</button>
            </div>

            <form onSubmit={handleDeposit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label htmlFor="deposit-amount" style={{ marginBottom: '0.4rem', display: 'block' }}>
                  {depositMode === 'add' ? 'סכום ההפקדה החדשה (₪)' : `סכום כולל חדש (₪) — נוכחי: ${totalDeposited.toLocaleString()} ₪`}
                </label>
                <input
                  id="deposit-amount"
                  type="number"
                  step="any"
                  min="0.00000001"
                  placeholder={depositMode === 'add' ? 'לדוגמה: 10000' : `לדוגמה: ${totalDeposited}`}
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  required
                  dir="rtl"
                  style={{ textAlign: 'right', direction: 'rtl' }}
                />
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(59,130,246,0.07)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                {depositMode === 'add'
                  ? `הסכום שתזין יתווסף לסכום הנוכחי (${formatMoney(totalDeposited)}) ← סה"כ חדש: ${formatMoney(totalDeposited + (parseFloat(depositAmount) || 0))}`
                  : `הסכום שתזין יחליף את הסכום הנוכחי (${formatMoney(totalDeposited)})`
                }
              </div>
              <button type="submit" disabled={saving} className="btn-primary" style={{ marginTop: '0.5rem' }}>
                אישור עדכון
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}