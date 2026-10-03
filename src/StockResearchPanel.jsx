import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ArrowUpRight, ArrowDownRight, ExternalLink, Sparkles } from 'lucide-react';
import './StockResearchPanel.css';

const formatDate = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(date) : '';
};
const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';

export default function StockResearchPanel({ stocks = null }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const activeRequest = useRef(null);
  const symbols = [...new Set((stocks || []).filter(stock => stock.status === 'active' && Number(stock.shares) !== 0 && !stock.symbol?.startsWith('CASH_')).map(stock => stock.symbol).filter(Boolean))];
  const symbolKey = stocks === null ? '*' : [...symbols].sort().join(',');

  const loadReport = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/stock-research', { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 401) {
        window.dispatchEvent(new Event('shared-account-auth-expired'));
        throw new Error('UNAUTHORIZED');
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'FETCH_FAILED');
      if (activeRequest.current === controller) { setReport(data); setCheckedAt(Date.now()); }
    } catch (err) {
      if (activeRequest.current === controller && (err.name !== 'AbortError' || !controller.signal.aborted)) {
        setError(err.message === 'UNAUTHORIZED' ? 'יש להתחבר מחדש.' : err.message === 'NO_REPORT' ? 'הסריקה הראשונה תופיע כאן בקרוב.' : 'לא ניתן לעדכן כרגע. נסו שוב.');
      } else if (activeRequest.current === controller) setError('העדכון התעכב. נסו שוב.');
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Synchronize the external report on view/portfolio changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (symbolKey) loadReport();
    return () => { activeRequest.current?.abort(); activeRequest.current = null; };
  }, [symbolKey, loadReport]);

  const actions = (report?.results || []).filter(item =>
    (stocks === null || symbols.includes(item.symbol)) && ['buy_review', 'sell_review', 'cover_review'].includes(item.recommendation?.action)
  );
  const buys = actions.filter(item => item.recommendation.action !== 'sell_review').length;
  const sells = actions.length - buys;
  const filtered = actions.filter(item => filter === 'all' || (filter === 'buy' ? item.recommendation.action !== 'sell_review' : item.recommendation.action === 'sell_review'));
  const visible = showAll ? filtered : filtered.slice(0, 6);
  const stale = report && checkedAt - Date.parse(report.scannedAt) > 12 * 3600000;

  return (
    <section className="stock-research" aria-labelledby="research-title" aria-busy={loading}>
      <div className="research-heading">
        <div><span className="research-eyebrow"><Sparkles size={14} aria-hidden="true" />התיק שלך, במבט קדימה</span><h2 id="research-title">מה כדאי לשנות</h2></div>
        <button type="button" className="research-refresh" aria-label="רענון ההמלצות" onClick={loadReport} disabled={loading}><RefreshCw size={18} className={loading ? 'research-spinning' : ''} aria-hidden="true" /></button>
      </div>
      <p className="research-date">הצעות קנייה ומכירה לבחינתך · מתעדכן כל 8 שעות{report ? ` · ${formatDate(report.scannedAt)}` : ''}</p>
      {stale && <p className="research-notice" role="status">הסריקה האחרונה התעכבה. ההצעות מוצגות מתאריך הסריקה.</p>}
      {error && <p role="alert" className="research-notice">{error}</p>}
      {report && actions.length > 0 && <div className="research-counts" role="group" aria-label="סינון המלצות">
        {[['all', 'הכול', actions.length], ['buy', 'קנייה', buys], ['sell', 'מכירה', sells]].map(([value, label, count]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setShowAll(false); }}>{label}<span>{count}</span></button>)}
      </div>}
      <div className="research-results">
        {visible.map(item => {
          const selling = item.recommendation.action === 'sell_review';
          const covering = item.recommendation.action === 'cover_review';
          const data = item.fundamentals;
          const reason = covering ? 'נרשמה יתרה שלילית. בדוק סגירת השורט בהתאם למדיניות שלך.' : selling ? `קונצנזוס מכירה של ${data.analystCount} אנליסטים, לצד ירידה בהכנסות ורווחיות שלילית.` : `קונצנזוס קנייה של ${data.analystCount} אנליסטים, לצד צמיחת הכנסות ורווחיות חיובית.`;
          const publisherSources = [...new Map(item.articles.map(article => [article.source, article])).values()].slice(0, 2);
          return <article className={`research-action-card ${selling ? 'sell' : 'buy'}`} key={item.symbol}>
            <div className="research-action-top"><div className="research-symbol"><strong dir="ltr">{item.symbol}</strong>{item.instrumentName && <span dir="auto">{item.instrumentName}</span>}</div><span className={`research-action-badge ${selling ? 'sell' : 'buy'}`}>{selling ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}{selling ? 'מכירה / צמצום' : covering ? 'קנייה לסגירת שורט' : 'קנייה / הגדלה'}</span></div>
            <p className="research-reason">{reason}</p>
            {data && <div className="research-metrics"><span>צמיחת הכנסות<strong dir="ltr">{percent(data.revenueGrowth)}</strong></span><span>רווח תפעולי<strong dir="ltr">{percent(data.operatingMargin)}</strong></span></div>}
            <details className="research-evidence"><summary>למה? · מקור ונימוק</summary>
              <p>{item.recommendation.reason}</p>
              {!covering && <a href={item.researchUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Yahoo Finance · נתוני אנליסטים<ExternalLink size={13} /></a>}
              {publisherSources.map(article => <a href={article.url} key={article.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><span>{article.source} · {article.title}</span><ExternalLink size={13} /></a>)}
              <p className="research-date">אות לבחינה, בביטחון נמוך. תאריך דירוג האנליסטים אינו זמין; לא חושבו תמחור, משקל בתיק, מיסוי או חפיפה בין קרנות. מפרסמים שונים עשויים להפיץ אותה ידיעה.</p>
            </details>
          </article>;
        })}
      </div>
      {report && !filtered.length && <div className="research-empty"><Sparkles size={24} /><h3>{actions.length ? 'אין הצעות בקטגוריה הזו' : 'אין שינויים מוצעים בסריקה הזו'}</h3><p>כשתעלה הצעה חדשה, היא תופיע כאן.</p></div>}
      {filtered.length > 6 && <button className="research-more" onClick={() => setShowAll(value => !value)}>{showAll ? 'הצגת פחות' : `עוד ${filtered.length - 6} הצעות`}</button>}
    </section>
  );
}
