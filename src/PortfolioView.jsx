import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, PlusCircle, TrendingUp, TrendingDown, DollarSign, Activity, Percent, Trash2, ArrowRight } from 'lucide-react';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function PortfolioView({ investmentId, investmentName, onBack, showToast }) {
  const [stocks, setStocks] = useState([]);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [totalDeposited, setTotalDeposited] = useState(0);
  const [overallPlIls, setOverallPlIls] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [isSoldStocksOpen, setIsSoldStocksOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
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

  const handleDeposit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) { showToast('הזן סכום תקין', 'error'); return; }
    try {
      const body = depositMode === 'add'
        ? { investment_id: investmentId, add_amount: amount }
        : { investment_id: investmentId, set_amount: amount };
      const res = await fetch('/api/portfolio', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        showToast(depositMode === 'add' ? `הופקדו ${amount.toLocaleString()} ₪ נוספו בהצלחה!` : `סכום הפקדות עודכן ל-${amount.toLocaleString()} ₪`);
        setIsDepositModalOpen(false);
        setDepositAmount('');
        fetchPortfolio(); // Re-fetch to reflect updated cash balance and portfolio value
      } else { showToast('שגיאה בעדכון', 'error'); }
    } catch { showToast('שגיאת רשת', 'error'); }
  };

  const fetchPortfolio = useCallback(async () => {
    try {
      const res = await fetch(`/api/portfolio?investment_id=${investmentId}`);
      if (res.ok) {
        const data = await res.json();
        setStocks(data.stocks);
        setPortfolioValue(data.portfolioValue);
        setTotalDeposited(data.totalDeposited || 0);
        setOverallPlIls(data.overallPlIls ?? (data.portfolioValue - (data.totalDeposited || 0)));
      } else {
         showToast("שגיאה במשיכת התיק", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("שגיאת רשת", "error");
    } finally {
      setLoading(false);
    }
  }, [investmentId, showToast]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const handleBuy = async (e) => {
    e.preventDefault();
    if (!buySymbol || !buyShares || !buyPrice) {
      showToast("יש למלא את כל שדות החובה", "error");
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investment_id: investmentId,
          symbol: buySymbol,
          shares: buyShares,
          currency: buyCurrency,
          purchase_price_fc: buyPrice,
          purchase_date: format(buyDate, 'yyyy-MM-dd')
        })
      });
      if (res.ok) {
        showToast("מניה נוספה בהצלחה!");
        setIsBuyModalOpen(false);
        setBuySymbol('');
        setBuyShares('');
        setBuyPrice('');
        fetchPortfolio();
      } else {
        showToast("שגיאה בהוספת מניה", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("שגיאת רשת", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async (e) => {
    e.preventDefault();
    if (!sellPrice) {
      showToast("יש להזין מחיר מכירה", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/portfolio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedStock.id,
          sale_price_fc: sellPrice,
          sale_shares: sellShares || selectedStock.shares,
          sale_date: format(sellDate, 'yyyy-MM-dd')
        })
      });
      if (res.ok) {
        showToast("מניה נמכרה בהצלחה!");
        setIsSellModalOpen(false);
        setSellPrice('');
        setSellShares('');
        fetchPortfolio();
      } else {
        showToast("שגיאה במכירה", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("שגיאת רשת", "error");
    } finally {
      setLoading(false);
    }
  };

  const cashStocks = stocks.filter(s => s.status === 'active' && (s.symbol === 'CASH_ILS' || s.symbol === 'CASH_USD'));
  const activeStocks = stocks.filter(s => s.status === 'active' && s.symbol !== 'CASH_ILS' && s.symbol !== 'CASH_USD');
  const filteredActiveStocks = activeStocks.filter(stock => stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || stock.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const soldStocks = stocks.filter(s => s.status === 'sold');

  const totalPurchaseIls = activeStocks.reduce((sum, s) => sum + parseFloat(s.purchase_price_ils), 0);
  const totalUnrealizedPl = activeStocks.reduce((sum, s) => sum + parseFloat(s.unrealized_pl_ils), 0);
  const totalRealizedPl = soldStocks.reduce((sum, s) => sum + parseFloat(s.realized_pl_ils), 0);

  const formatMoney = (val, currency = 'ILS') => {
    const num = parseFloat(val || 0);
    const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(num));
    const sym = currency === 'ILS' ? '₪' : '$';
    return `${num < 0 ? '-' : ''}${sym}${formatted}`;
  };

  if (loading && stocks.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-main)' }}>טוען נתונים...</div>;

  return (
    <div style={{ paddingBottom: '80px', display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
         <button onClick={onBack} className="btn-secondary" style={{ padding: '0.5rem' }}>
            <ArrowRight size={20} />
         </button>
         <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-main)' }}>{investmentName}</h1>
         <div style={{ width: 36 }}></div> {/* Spacer */}
      </div>

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
                  <span>{overallPlIls >= 0 ? '+' : ''}{((overallPlIls / totalDeposited) * 100).toFixed(2)}% על {formatMoney(totalDeposited)} שהופקדו</span>
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

      {/* Action Button */}
      <button className="btn-primary" onClick={() => setIsBuyModalOpen(true)} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '1rem' }}>
        <PlusCircle size={20} />
        קניית מניה חדשה
      </button>

      {/* Cash Balances */}
      {cashStocks.length > 0 && (
         <div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)', marginBottom: '1rem' }}>יתרות מזומן</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
               {cashStocks.map(stock => (
                  <div key={stock.id} className="glass-card" style={{ padding: '1.5rem', textAlign: 'center', borderTop: stock.symbol === 'CASH_USD' ? '4px solid #10b981' : '4px solid #3b82f6' }}>
                     <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                        {stock.symbol === 'CASH_ILS' ? 'שקלים (ILS)' : 'דולרים (USD)'}
                     </div>
                     <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)' }} dir="ltr">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: stock.symbol === 'CASH_ILS' ? 'ILS' : 'USD' }).format(stock.shares)}
                     </div>
                     {stock.symbol === 'CASH_USD' && (
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
               placeholder="חיפוש לפי טיקר או שם חברה..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="form-input"
            />
         </div>
         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredActiveStocks.map(stock => (
               <div key={stock.id} className="glass-card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                     <div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{stock.symbol}</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{stock.name}</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{parseFloat(stock.shares)} מניות</div>
                     </div>
                     <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--text-main)' }} dir="ltr">
                           {new Intl.NumberFormat('en-US', { style: 'currency', currency: stock.currency }).format(stock.current_price_fc)}
                        </div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 'bold', color: stock.day_change_percent >= 0 ? 'var(--income)' : 'var(--expense)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }} dir="ltr">
                           {stock.day_change_percent >= 0 ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
                           {parseFloat(stock.day_change_percent).toFixed(2)}%
                        </div>
                     </div>
                  </div>
                  
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>שווי הניה (₪)</div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }} dir="ltr">{formatMoney(stock.current_value_ils)}</div>
                     </div>
                     <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>רווח פתוח</div>
                        <div style={{ fontWeight: 'bold', color: stock.unrealized_pl_fc >= 0 ? 'var(--income)' : 'var(--expense)' }} dir="ltr">
                           {stock.unrealized_pl_fc >= 0 ? '+' : ''}{formatMoney(stock.unrealized_pl_fc, stock.currency)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: stock.unrealized_pl_percent >= 0 ? 'var(--income)' : 'var(--expense)' }} dir="ltr">
                           ({stock.unrealized_pl_percent >= 0 ? '+' : ''}{parseFloat(stock.unrealized_pl_percent).toFixed(2)}%)
                        </div>
                     </div>
                     <button 
                        onClick={() => { setSelectedStock(stock); setIsSellModalOpen(true); }}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.4rem 1rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                     >
                        מכירה
                     </button>
                  </div>
               </div>
            ))}
            {filteredActiveStocks.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>לא נמצאו החזקות פעילות שמתאימות לחיפוש.</div>}
         </div>
      </div>

      {/* Sold Stocks */}
      {soldStocks.length > 0 && (
         <div style={{ marginTop: '1rem' }}>
            <div 
               onClick={() => setIsSoldStocksOpen(!isSoldStocksOpen)} 
               style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '0.5rem', marginBottom: '1rem' }}
            >
               {isSoldStocksOpen ? <ChevronDown size={20} color="var(--text-main)" /> : <ChevronRight size={20} color="var(--text-main)" />}
               <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)', margin: 0 }}>היסטוריית עסקאות (מניות שנמכרו)</h2>
            </div>
            {isSoldStocksOpen && (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {soldStocks.map(stock => (
                     <div key={stock.id} className="glass-card" style={{ padding: '1rem', opacity: 0.8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                           <div>
                              <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{stock.symbol.replace('_SOLD', '')}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stock.name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>נמכר ב-{format(new Date(stock.sale_date), 'dd/MM/yyyy')}</div>
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

      {/* Modals */}
      {isBuyModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass-card" style={{ position: 'relative' }}>
            <button onClick={() => setIsBuyModalOpen(false)} style={{
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
                <label>סימול מניה (למשל AAPL)</label>
                <input type="text" value={buySymbol} onChange={e => setBuySymbol(e.target.value)} required dir="ltr" />
              </div>
              <div>
                <label>כמות מניות</label>
                <input type="number" step="any" value={buyShares} onChange={e => setBuyShares(e.target.value)} required dir="ltr" />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                 <div style={{ flex: 1 }}>
                   <label>מחיר קנייה</label>
                   <input type="number" step="any" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} required dir="ltr" />
                 </div>
                 <div style={{ width: '80px' }}>
                   <label>מטבע</label>
                   <select value={buyCurrency} onChange={e => setBuyCurrency(e.target.value)} dir="ltr">
                      <option value="USD">USD</option>
                      <option value="ILS">ILS</option>
                      <option value="EUR">EUR</option>
                   </select>
                 </div>
              </div>
              <div>
                 <label>תאריך קנייה</label>
                  <DatePicker
                     selected={buyDate}
                     onChange={date => setBuyDate(date)}
                     locale={he}
                     dateFormat="dd/MM/yyyy"
                     className="date-picker-input"
                     popperPlacement="bottom-start"
                     portalId="root-portal"
                  />
              </div>
              <button type="submit" className="btn-primary" style={{ marginTop: '1rem' }}>הוסף לתיק</button>
            </form>
          </div>
        </div>
      )}

      {isSellModalOpen && selectedStock && (
        <div className="modal-overlay">
          <div className="modal-content glass-card" style={{ position: 'relative' }}>
            <button onClick={() => setIsSellModalOpen(false)} style={{
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
                <label>כמות למכירה (מתוך {selectedStock.shares})</label>
                <input type="number" step="any" max={selectedStock.shares} value={sellShares} onChange={e => setSellShares(e.target.value)} required dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }} placeholder={selectedStock.shares} />
              </div>
              <div>
                <label>מחיר מכירה במטבע ({selectedStock.currency})</label>
                <input type="number" step="any" value={sellPrice} onChange={e => setSellPrice(e.target.value)} required dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }} />
              </div>
              <div>
                 <label>תאריך מכירה</label>
                 <DatePicker
                    selected={sellDate}
                    onChange={date => setSellDate(date)}
                    locale={he}
                    dateFormat="dd/MM/yyyy"
                    className="date-picker-input"
                    popperPlacement="bottom-start"
                    portalId="root-portal"
                 />
              </div>
              <button type="submit" className="btn-primary" style={{ marginTop: '1rem', background: 'var(--expense)' }}>
                 בצע מכירה
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {isDepositModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass-card" style={{ position: 'relative' }}>
            <button onClick={() => setIsDepositModalOpen(false)} style={{
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
                <label style={{ marginBottom: '0.4rem', display: 'block' }}>
                  {depositMode === 'add' ? 'סכום ההפקדה החדשה (₪)' : `סכום כולל חדש (₪) — נוכחי: ${totalDeposited.toLocaleString()} ₪`}
                </label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  placeholder={depositMode === 'add' ? 'לדוגמה: 10000' : `לדוגמה: ${totalDeposited}`}
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  required
                  dir="rtl"
                  style={{ textAlign: 'right', direction: 'rtl' }}
                  autoFocus
                />
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(59,130,246,0.07)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                {depositMode === 'add'
                  ? `הסכום שתזין יתווסף לסכום הנוכחי (${formatMoney(totalDeposited)}) ← סה"כ חדש: ${formatMoney(totalDeposited + (parseFloat(depositAmount) || 0))}`
                  : `הסכום שתזין יחליף את הסכום הנוכחי (${formatMoney(totalDeposited)})`
                }
              </div>
              <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }}>
                אישור עדכון
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}