import { useEffect, useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip } from 'chart.js';
import { Line } from 'react-chartjs-2';
import './StockHistoryCharts.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);
const METRICS = [
  ['price', 'מחיר מניה'], ['estimatedPE', 'מכפיל רווח'], ['operatingMargin', 'שולי רווח תפעולי'],
  ['revenue', 'הכנסות'], ['dilutedEPS', 'רווח למניה'], ['netIncome', 'רווח נקי'], ['freeCashFlow', 'תזרים מזומנים חופשי'],
];
const formatDate = value => new Date(value).toLocaleDateString('he-IL', { month: 'short', year: '2-digit' });
const number = value => new Intl.NumberFormat('he-IL', { notation: 'compact', maximumFractionDigits: 2 }).format(value);

export default function StockHistoryCharts({ symbol }) {
  const [state, setState] = useState({ data: null, error: false, loading: true });
  const [metric, setMetric] = useState('price');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); setState({ data: null, error: true, loading: false }); }, 15000);
    // This effect synchronizes an authenticated external data source after expansion.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ data: null, error: false, loading: true });
    fetch(`/api/stock-history?symbol=${encodeURIComponent(symbol)}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (response.status === 401) window.dispatchEvent(new Event('shared-account-auth-expired'));
        if (!response.ok) throw new Error('HISTORY_UNAVAILABLE');
        const data = await response.json();
        if (!controller.signal.aborted) setState({ data, error: false, loading: false });
      }).catch(() => { if (!controller.signal.aborted) setState({ data: null, error: true, loading: false }); })
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [symbol, attempt]);
  if (state.loading) return <p className="stock-history-message" role="status">טוען מגמות שנתיות…</p>;
  if (state.error) return <div className="stock-history-message" role="status">המגמות לא נטענו. <button type="button" onClick={() => setAttempt(value => value + 1)}>נסה שוב</button></div>;
  const { data } = state;
  const isPrice = metric === 'price', isRatio = metric === 'estimatedPE', isMargin = metric === 'operatingMargin';
  const points = isPrice ? data.prices.map(row => ({ date: row.date, value: row.close })) : data.reports.map(row => ({ date: row.periodEnd, value: row[metric] === null || row[metric] === undefined ? null : isMargin ? row[metric] * 100 : row[metric] }));
  const available = points.filter(point => point.value !== null);
  const label = METRICS.find(([key]) => key === metric)[1];
  const unit = isMargin ? '%' : isRatio ? '×' : (isPrice ? data.currency : data.reportingCurrency) || 'מטבע הדיווח לא זמין';
  const formatValue = value => value === null ? 'לא זמין' : `${number(value)} ${unit}`;
  return <section className="stock-history" aria-label={`מגמות שנתיות ${symbol}`}>
    <div className="stock-history-heading"><strong>מגמות בשנה האחרונה</strong><span>{isPrice ? 'סגירה יומית' : 'דוחות רבעוניים'}</span></div>
    <label className="stock-history-select">נתון להשוואה<select value={metric} onChange={event => setMetric(event.target.value)}>{METRICS.map(([key, title]) => <option value={key} key={key}>{title}</option>)}</select></label>
    {available.length ? <>
      <div className="stock-history-canvas" dir="ltr"><Line aria-label={`${label} בשנה האחרונה`} role="img" data={{ labels: points.map(point => formatDate(point.date)), datasets: [{ data: points.map(point => point.value), borderColor: '#287b70', backgroundColor: '#287b70', borderWidth: 2, pointRadius: isPrice ? 0 : 3, pointHitRadius: 12, spanGaps: false, tension: 0 }] }} options={{ responsive: true, maintainAspectRatio: false, animation: false, plugins: { tooltip: { callbacks: { label: context => formatValue(context.parsed.y) } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 5, maxRotation: 0 } }, y: { ticks: { callback: value => number(value), maxTicksLimit: 5 }, grid: { color: '#edf1f4' } } } }} /></div>
      <p className="stock-history-summary">{label}: {formatValue(available[0].value)} בתחילת התקופה הזמינה ← {formatValue(available.at(-1).value)} בסופה.</p>
      <details className="stock-history-values"><summary>הנתונים בגרף</summary><table><thead><tr><th>תקופה</th><th>{label}</th></tr></thead><tbody>{points.map(point => <tr key={point.date}><td>{new Date(point.date).toLocaleDateString('he-IL')}</td><td dir="ltr">{formatValue(point.value)}</td></tr>)}</tbody></table></details>
    </> : <p className="stock-history-message">הנתון אינו זמין לתקופה זו.</p>}
    {isRatio && <p className="stock-history-note">{data.peMethodology}</p>}
    <p className="stock-history-note">{isPrice ? 'מחירי הסגירה עשויים להיות מתואמים לפיצולי מניות.' : 'תאריך סוף הרבעון; סכומי הדוח אינם נתונים יומיים.'} מקור: <a href={data.sourceUrls[isPrice ? 0 : metric === 'freeCashFlow' ? 2 : 1]} target="_blank" rel="noopener noreferrer">Yahoo Finance</a></p>
  </section>;
}
