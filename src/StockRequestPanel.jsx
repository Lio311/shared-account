import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Bell, CheckCircle2, Clock3 } from 'lucide-react';
import './StockRequestPanel.css';
async function api(path, options) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000), ...options });
  if (response.status === 401) window.dispatchEvent(new Event('shared-account-auth-expired'));
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'UNAVAILABLE');
  return data;
}
async function deviceEndpoint() {
  if (!('serviceWorker' in navigator)) return undefined;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager?.getSubscription())?.endpoint;
}
const initialId = new URLSearchParams(window.location.search).get('request') || '';
export default function StockRequestPanel({ renderAnalysis, onEnableNotifications }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [requests, setRequests] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(initialId);
  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const analysisRef = useRef(null);
  const searchAttempt = useRef(0), submitLock = useRef(false);
  const load = useCallback(async () => {
    try {
      const list = await api('/api/stock-requests');
      let items = list.requests;
      setRequests(items);
      if (initialId && !items.some(item => item.id === initialId)) {
        const focused = await api(`/api/stock-requests?id=${encodeURIComponent(initialId)}`);
        items = [...focused.requests, ...items];
      }
      setRequests(items); setError('');
    } catch (err) { setError(err.message === 'REQUEST_NOT_FOUND' ? 'הבקשה לא נמצאה בחשבון הזה.' : 'הבקשות לא נטענו. אפשר לנסות שוב.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // Synchronize saved research requests from the authenticated server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    deviceEndpoint().then(endpoint => setPushEnabled(Boolean(endpoint) && 'Notification' in window && Notification.permission === 'granted')).catch(() => {});
    const interval = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => clearInterval(interval);
  }, [load]);
  const selected = requests.find(item => item.id === selectedId);
  useEffect(() => {
    if (selected?.status === 'ready') analysisRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, [selected?.id, selected?.status]);
  const select = id => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('request', id); else url.searchParams.delete('request');
    window.history.replaceState(null, '', url.pathname + url.search);
  };
  const search = async event => {
    event.preventDefault();
    if (!query.trim() || searching) return;
    const attempt = ++searchAttempt.current;
    setSearching(true); setError(''); setMatches([]);
    try { const data = await api(`/api/stock-requests?q=${encodeURIComponent(query.trim())}`); if (attempt === searchAttempt.current) { setMatches(data.matches); if (!data.matches.length) setNotice('לא נמצאה מניה. נסה שם חברה באנגלית או סימול.'); else setNotice('בחר את המניה לשליחה למחקר.'); } }
    catch { setError('החיפוש לא זמין כרגע. נסה שוב.'); }
    finally { if (attempt === searchAttempt.current) setSearching(false); }
  };
  const enqueue = async match => {
    if (submitLock.current) return;
    submitLock.current = true; setSaving(match.symbol); setError('');
    try {
      const subscriptionEndpoint = await deviceEndpoint().catch(() => undefined);
      const data = await api('/api/stock-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: match.symbol, ...(subscriptionEndpoint ? { subscriptionEndpoint } : {}) }) });
      setNotice(data.duplicate ? `${match.symbol} כבר ממתינה לסריקה הקרובה.` : `${match.symbol} נוספה לסריקה הקרובה. כשהמחקר יהיה מוכן הוא יופיע כאן.`);
      setMatches([]); setQuery(''); select(data.request.id); await load();
    } catch (err) { setError(err.message === 'QUEUE_FULL' ? 'יש כבר 10 בקשות ממתינות. אפשר להוסיף לאחר השלמת סריקה.' : 'הבקשה לא נשמרה. נסה שוב.'); }
    finally { submitLock.current = false; setSaving(''); }
  };
  const enablePush = async () => { await onEnableNotifications?.(); setPushEnabled(Boolean(await deviceEndpoint().catch(() => undefined)) && 'Notification' in window && Notification.permission === 'granted'); };
  return <section className="stock-requests" aria-labelledby="stock-request-title">
    <h2 id="stock-request-title">איזו מניה לבדוק בשבילך?</h2>
    <p>בחר מניה למחקר בסריקה הקרובה. כשהניתוח מוכן, ההתראה פותחת אותו ישירות.</p>
    <form className="stock-request-search" onSubmit={search}><input aria-label="שם חברה או סימול למחקר" placeholder="שם חברה או סימול, למשל AAPL" value={query} maxLength={80} onChange={event => { setQuery(event.target.value); searchAttempt.current++; setSearching(false); setMatches([]); }} /><button type="submit" disabled={searching || !query.trim()} aria-label="חיפוש מניה למחקר"><Search size={18} />{searching ? 'מחפש…' : 'חיפוש'}</button></form>
    {matches.length > 0 && <div className="stock-request-matches">{matches.map(match => <button key={match.symbol} onClick={() => enqueue(match)} disabled={Boolean(saving)}><span><strong dir="ltr">{match.symbol}</strong><small dir="auto">{match.name}</small></span><span>{saving === match.symbol ? 'שומר…' : 'שלח למחקר'}</span></button>)}</div>}
    {notice && <p className="stock-request-notice" role="status">{notice}</p>}
    {error && <p className="stock-request-error" role="alert">{error} <button onClick={load}>רענון</button></p>}
    {onEnableNotifications ? <button className="stock-request-push" type="button" onClick={enablePush}><Bell size={15} />{pushEnabled ? 'התראות פעילות במכשיר · ניהול' : 'הפעל התראה כשהמחקר מוכן'}</button> : <a className="stock-request-push" href="/?view=research"><Bell size={15} />הפעלת התראות במסך המחקר</a>}
    {loading && <p role="status">טוען בקשות…</p>}
    {requests.length > 0 && <details className="stock-request-list" open={selected?.status === 'pending' || undefined}><summary>המחקרים שביקשתי · {requests.filter(item => item.status === 'pending').length} ממתינים</summary>{requests.slice(0, 12).map(item => <button key={item.id} onClick={() => select(item.id)} aria-pressed={item.id === selectedId}><span dir="ltr">{item.symbol}</span><span>{item.status === 'ready' ? <><CheckCircle2 size={14} />הניתוח מוכן</> : <><Clock3 size={14} />{item.attempts ? 'ממתינה לסריקה חוזרת' : 'ממתינה לסריקה הקרובה'}</>}</span></button>)}</details>}
    {selected?.status === 'ready' && <div className="stock-request-analysis" ref={analysisRef}><div className="stock-request-analysis-title"><h3>המחקר שביקשת · <b dir="ltr">{selected.symbol}</b></h3><button onClick={() => select('')}>סגירה</button></div><p className="stock-request-completed">עודכן {new Date(selected.completedAt).toLocaleString('he-IL')} · הסריקה אינה מבצעת מסחר</p>{renderAnalysis(selected.result)}</div>}
  </section>;
}
