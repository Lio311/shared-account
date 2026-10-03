import { useCallback, useEffect, useRef, useState } from 'react';
import { Newspaper, RefreshCw, ExternalLink } from 'lucide-react';
import './StockResearchPanel.css';

const formatDate = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(date) : 'מועד לא ידוע';
};

export default function StockResearchPanel({ stocks = null }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const activeRequest = useRef(null);
  const symbols = [...new Set((stocks || []).filter(stock => stock.status === 'active' && Number(stock.shares) > 0 && !stock.symbol?.startsWith('CASH_')).map(stock => stock.symbol).filter(Boolean))];
  const symbolKey = stocks === null ? '*' : [...symbols].sort().join(',');

  const loadReport = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/stock-research', { signal: controller.signal });
      const data = await response.json();
      if (response.status === 401) {
        window.dispatchEvent(new Event('shared-account-auth-expired'));
        throw new Error('UNAUTHORIZED');
      }
      if (!response.ok) throw new Error(data.error || 'FETCH_FAILED');
      setReport(data);
      setCheckedAt(Date.now());
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message === 'UNAUTHORIZED' ? 'יש להתחבר מחדש כדי לצפות במחקר.'
          : err.message === 'NO_REPORT' ? 'עדיין לא הסתיימה סריקה. הסיכום יופיע כאן אחרי הסריקה הראשונה.'
          : 'לא ניתן לטעון את סיכום המחקר כרגע. נסו שוב.');
      }
    } finally {
      if (activeRequest.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Synchronize the latest external report when entering this view or switching holdings.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (symbolKey) loadReport();
    return () => activeRequest.current?.abort();
  }, [symbolKey, loadReport]);

  const visibleResults = report?.results?.filter(result => stocks === null || symbols.includes(result.symbol)) || [];
  return (
    <section className="glass-card stock-research" aria-labelledby="research-title" aria-busy={loading}>
      <div className="research-heading">
        <div><span className="research-eyebrow">מחקר לתיק שלך</span><h2 id="research-title"><Newspaper size={21} aria-hidden="true" />מה חדש במניות שלך</h2></div>
        <button type="button" className="btn-secondary research-refresh" onClick={loadReport} disabled={loading || (stocks !== null && !symbols.length)}>
          <RefreshCw size={16} aria-hidden="true" />{loading ? 'טוען…' : 'הצגת סיכום'}
        </button>
      </div>
      <p className="research-intro">כתבות וקישורים ממקורות חינמיים, עם תאריך ומקור לכל פריט. תדירות הסריקה המתוכננת: כל 8 שעות.</p>
      <p className="research-policy">המדיניות שלך: 5 שנים ומעלה, סיכון בינוני, ללא משיכה מתוכננת. מכשירים ממונפים מותרים ללא תקרת חשיפה כרגע; הלוואה, מרווח ושורט אסורים. ההצעות דורשות בדיקה שלך לפני פעולה.</p>
      {stocks !== null && !symbols.length && <p className="research-notice">אין כרגע מניות פעילות לסריקה.</p>}
      {error && <p role="alert" className="research-notice">{error}</p>}
      {report && <p className="research-date">סריקה אחרונה: {formatDate(report.scannedAt)} · ספק: {report.provider}{checkedAt - Date.parse(report.scannedAt) > 12 * 3600000 ? ' · הסיכום אינו מעודכן' : ''}</p>}
      {report?.notificationStatus && <p className="research-notice">פוש בסריקה האחרונה: {report.notificationStatus.sent || 0} שליחות אושרו על ידי שירות הפוש.{report.notificationStatus.failed ? ' חלק מהמנויים לא קיבלו אישור שליחה; הפעילו מחדש התראות במכשיר הרצוי.' : ''}{report.notificationStatus.unavailable ? ' שירות הפוש אינו מוגדר כרגע.' : ''}</p>}
      <div className="research-results">
        {visibleResults.map(result => (
          <article className="research-result" key={result.symbol}>
            <div className="research-result-title"><strong dir="ltr">{result.symbol}</strong><span>{result.status === 'error' ? 'המקור אינו זמין' : `${result.articles.length} כתבות`}</span></div>
            {result.status === 'error' && <p>הסריקה למניה זו לא הושלמה. לא הוסקה מסקנה מהיעדר מידע.</p>}
            {result.status === 'unsupported' && <p>אין כיסוי מאומת למכשיר זה במקור החינמי.</p>}
            {result.status === 'no_recent_news' && <p>לא נמצאו כתבות רלוונטיות בשבעת הימים האחרונים במקור שנבדק.</p>}
            {result.recommendation && <div className="research-suggestion">
              <strong>{({ buy_review: 'לבחינת קנייה או הגדלה', sell_review: 'לבחינת מכירה או צמצום', cover_review: 'לבחינת סגירת שורט', review: 'נדרשת בדיקה נוספת' })[result.recommendation.action]}</strong>
              <p>{result.recommendation.reason}</p>
              {result.recommendation.evidence?.filter(item => !result.articles.some(article => article.url === item.url)).map(item => <a href={item.url} key={item.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{item.title}</a>)}
              <details><summary>נתונים ופערי מידע</summary>
                {result.fundamentals && <p>אנליסטים: {result.fundamentals.analystCount ?? 'לא ידוע'} · קונצנזוס: {result.fundamentals.analystConsensus ?? 'לא ידוע'} · צמיחת הכנסות: {result.fundamentals.revenueGrowth === null ? 'לא ידועה' : `${(result.fundamentals.revenueGrowth * 100).toFixed(1)}%`} · שולי רווח תפעולי: {result.fundamentals.operatingMargin === null ? 'לא ידועים' : `${(result.fundamentals.operatingMargin * 100).toFixed(1)}%`}</p>}
                <ul>{[...(result.issues || []), ...(result.recommendation.limitations || [])].map(item => <li key={item}>{item}</li>)}</ul>
                <a href={result.researchUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">בדיקת נתוני האנליסטים במקור</a>
              </details>
            </div>}
            {result.articles.map(article => (
              <div className="research-article" key={article.url}>
                <a href={article.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{article.title}<ExternalLink size={13} aria-hidden="true" /></a>
                <span>{article.source} · {formatDate(article.publishedAt)}</span>
              </div>
            ))}
          </article>
        ))}
      </div>
      {report && !visibleResults.length && <p className="research-notice">הסיכום האחרון אינו כולל את ההחזקות הפעילות בתיק הזה.</p>}
    </section>
  );
}
