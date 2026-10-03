export const MAX_NEWS_AGE_DAYS = 7;
export const INVESTMENT_POLICY = Object.freeze({ horizonYears: 5, risk: 'moderate', withdrawalsPlanned: false, leveragedInstrumentsAllowed: true, borrowingAllowed: false, shortsAllowed: false, leveragedAllocationLimit: null });

export function safeArticleUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost' || /^\d+\./.test(url.hostname) || url.hostname.includes(':')) return null;
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function normalizeArticles(news, symbol, now = new Date()) {
  if (!Array.isArray(news)) throw new Error('INVALID_PROVIDER_RESPONSE');
  const seen = new Set();
  return news.flatMap(item => {
    if (!item || typeof item.title !== 'string') return [];
    const url = safeArticleUrl(item.link);
    const published = new Date(item.providerPublishTime);
    const age = now.getTime() - published.getTime();
    if (!url || !Number.isFinite(age) || age < 0 || age > MAX_NEWS_AGE_DAYS * 86400000 || seen.has(url)) return [];
    if (!Array.isArray(item.relatedTickers) || !item.relatedTickers.includes(symbol)) return [];
    seen.add(url);
    return [{ title: item.title.slice(0, 300), url,
      source: typeof item.publisher === 'string' ? item.publisher.slice(0, 100) : new URL(url).hostname,
      sourceDomain: new URL(url).hostname.replace(/^www\./, ''), publishedAt: published.toISOString(),
    }];
  }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 8);
}

function finite(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }

export function normalizeFundamentals(summary, now = new Date()) {
  const data = summary?.financialData;
  if (!data) return null;
  return { analystConsensus: typeof data.recommendationKey === 'string' ? data.recommendationKey : null,
    analystCount: finite(data.numberOfAnalystOpinions), revenueGrowth: finite(data.revenueGrowth),
    operatingMargin: finite(data.operatingMargins), currentPrice: finite(data.currentPrice),
    fetchedAt: now.toISOString(), analystRatingDate: null,
  };
}

export function recommend(holding, fundamentals, articles, instrumentName = '') {
  const symbol = String(holding.symbol).toUpperCase();
  if (Number(holding.shares) < 0) return { action: 'cover_review', confidence: 'high', reason: 'החזקה שלילית מסומנת כשורט, בניגוד למדיניות שלך. בדוק סגירת החשיפה מול הברוקר.', evidence: [], limitations: ['יש לאמת שהכמות השלילית אינה שגיאת רישום.'] };
  const leveraged = symbol === 'NVDL' || /\b(?:leveraged|ultra|[23]x)\b/i.test(instrumentName);
  const inverse = /\b(?:inverse|short)\b/i.test(instrumentName);
  if (inverse) return { action: 'review', confidence: 'insufficient', reason: 'זוהתה חשיפה הפוכה. יש לבדוק אם איסור השורט שלך חל גם על המכשיר הזה.', evidence: [], limitations: ['זיהוי לפי שם בלבד; אין הוראת מכירה אוטומטית.'] };
  if (leveraged) return { action: 'review', confidence: 'insufficient', reason: 'מכשיר ממונף מותר במדיניות שלך. יש לבדוק חשיפה כוללת וסיכון; אין המלצת מכירה רק בגלל המינוף.', evidence: symbol === 'NVDL' ? [{ title: 'מאפייני המינוף היומי אצל המנפיק', url: 'https://graniteshares.com/etfs/nvdl/' }] : [], limitations: ['מינוף יומי אינו מכפיל קבוע של תשואה על פני חמש שנים.', 'בחרת לא לקבוע תקרת חשיפה למכשירים ממונפים כרגע.'] };
  const domains = new Set(articles.map(article => article.sourceDomain));
  const limitations = ['הנתונים חינמיים ועלולים להתעכב; תאריך המלצות האנליסטים אינו זמין.', 'לא חושבו מיסוי, עמלות, יעד הקצאה או חפיפה בין קרנות.'];
  if (fundamentals?.analystCount >= 5 && domains.size >= 2 && fundamentals.operatingMargin > 0 && fundamentals.revenueGrowth > 0 && ['buy', 'strong_buy'].includes(fundamentals.analystConsensus)) {
    return { action: 'buy_review', confidence: 'low', reason: `מועמדת לבחינת הגדלה: קונצנזוס ${fundamentals.analystCount} אנליסטים חיובי, צמיחת ההכנסות ושולי הרווח התפעולי חיוביים, ונמצאו כתבות מלפחות שני דומיינים. בדוק תמחור, פיזור והתאמה לסיכון בינוני לפני קנייה.`, evidence: articles.slice(0, 3).map(({ title, url }) => ({ title, url })), limitations };
  }
  if (fundamentals?.analystCount >= 5 && domains.size >= 2 && ['sell', 'strong_sell'].includes(fundamentals.analystConsensus) && fundamentals.operatingMargin < 0 && fundamentals.revenueGrowth < 0) {
    return { action: 'sell_review', confidence: 'low', reason: 'מועמדת לבחינת צמצום: קונצנזוס האנליסטים שלילי, צמיחת ההכנסות ושולי הרווח התפעולי שליליים. יש לבדוק את הדוח המקורי ואת תזת ההשקעה לפני מכירה.', evidence: articles.slice(0, 3).map(({ title, url }) => ({ title, url })), limitations };
  }
  return { action: 'review', confidence: 'insufficient', reason: 'אין מספיק ראיות להציע קנייה או מכירה. זהו מצב של מידע חסר, ולא המלצת החזקה.', evidence: [], limitations };
}

export function createResearchService({ search, summary, now = () => new Date() }) {
  return async holdings => {
    if (!Array.isArray(holdings) || holdings.length > 200) throw new Error('INVALID_HOLDINGS');
    const relevant = holdings.filter(item => item.status === 'active' && !String(item.symbol).startsWith('CASH_') && Number(item.shares) !== 0);
    const symbols = [...new Set(relevant.map(item => String(item.symbol).toUpperCase()))];
    const scannedAt = now().toISOString();
    const deadline = Date.now() + 35000;
    const results = new Map();
    let position = 0;
    await Promise.all(Array.from({ length: Math.min(3, symbols.length) }, async () => {
      while (position < symbols.length) {
        const symbol = symbols[position++];
        if (Date.now() > deadline) {
          results.set(symbol, { symbol, status: 'error', articles: [], fundamentals: null, instrumentName: '', issues: ['מגבלת זמן הסריקה הגיעה; מכשיר זה לא נבדק בריצה הזו.'] });
          continue;
        }
        if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) {
          results.set(symbol, { symbol, status: 'unsupported', articles: [], fundamentals: null, instrumentName: '', issues: ['אין כיסוי מאומת במקור החינמי למכשיר זה.'] });
          continue;
        }
        const [newsResult, financialResult] = await Promise.allSettled([search(symbol), summary(symbol)]);
        let articles = [];
        let status = 'error';
        const issues = [];
        if (newsResult.status === 'fulfilled') {
          try { articles = normalizeArticles(newsResult.value.news, symbol, now()); status = articles.length ? 'available' : 'no_recent_news'; }
          catch { issues.push('תשובת החדשות אינה תקינה.'); }
        } else { issues.push('מקור החדשות אינו זמין.'); }
        const fundamentals = financialResult.status === 'fulfilled' ? normalizeFundamentals(financialResult.value, now()) : null;
        if (!fundamentals) issues.push('נתוני האנליסטים והדוחות אינם זמינים.');
        const instrumentName = financialResult.status === 'fulfilled' ? String(financialResult.value?.price?.longName || financialResult.value?.price?.shortName || '') : '';
        results.set(symbol, { symbol, status, articles, fundamentals, instrumentName, issues });
      }
    }));
    return { provider: 'Yahoo Finance', scannedAt, policy: INVESTMENT_POLICY, mode: 'suggestions_only', maxNewsAgeDays: MAX_NEWS_AGE_DAYS,
      results: symbols.map(symbol => {
        const result = results.get(symbol);
        const lots = relevant.filter(item => String(item.symbol).toUpperCase() === symbol);
        const holding = lots.find(item => Number(item.shares) < 0) || lots[0];
        return { ...result, recommendation: recommend(holding, result.fundamentals, result.articles, result.instrumentName), researchUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/analysis/` };
      }),
    };
  };
}
