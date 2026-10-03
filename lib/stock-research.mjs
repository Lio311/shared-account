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

export function normalizeValuation(summary) {
  const stats = summary?.defaultKeyStatistics || {}, details = summary?.summaryDetail || {};
  const trailingPE = finite(details.trailingPE) ?? finite(stats.trailingPE);
  const forwardPE = finite(stats.forwardPE) ?? finite(details.forwardPE);
  const trailingEPS = finite(stats.trailingEps), pegRatio = finite(stats.pegRatio);
  const valid = trailingPE > 0 && trailingEPS > 0;
  const expensive = valid && trailingPE >= 50;
  const growthSupported = pegRatio > 0 && pegRatio <= 2;
  const status = !valid ? 'unavailable' : expensive && !growthSupported ? 'high_multiple' : 'passes_screen';
  return { trailingPE, forwardPE, trailingEPS, pegRatio, earningsGrowth: finite(summary?.financialData?.earningsGrowth), status,
    analysis: !valid ? 'אין מכפיל רווח חיובי מאומת עם רווח למניה חיובי; לא נוצר אות קנייה על סמך הנתונים האלה.' : expensive ? `מכפיל רווח של ${trailingPE.toFixed(1)} מצביע על תמחור גבוה לפי סף הסינון. ${growthSupported ? 'יחס PEG של הספק עומד בסף הצמיחה, אך יש לבחון את התחזיות.' : 'בלי יחס PEG חיובי עד 2, המניה אינה עוברת את סינון הקנייה.'}` : `מכפיל רווח של ${trailingPE.toFixed(1)} עומד בסף הסינון; זו אינה קביעה שהמניה זולה.`,
    methodology: 'מכפיל TTM ו־PEG הם נתוני Yahoo Finance; מכפיל חזוי נשען על תחזיות. סף 50 ו־PEG עד 2 הם כללי סינון בלבד. לא חושב מכפיל ענפי או שווי הוגן; PEG אינו נגזר מצמיחת ההכנסות הרבעונית.',
    sourceUrl: 'https://www.finra.org/investors/investing/investment-products/stocks/evaluating-stocks',
  };
}

export function normalizeFundamentals(summary, now = new Date()) {
  const data = summary?.financialData;
  if (!data) return null;
  return { analystConsensus: typeof data.recommendationKey === 'string' ? data.recommendationKey : null,
    analystCount: finite(data.numberOfAnalystOpinions), revenueGrowth: finite(data.revenueGrowth),
    valuation: normalizeValuation(summary), operatingMargin: finite(data.operatingMargins), currentPrice: finite(data.currentPrice),
    fetchedAt: now.toISOString(), analystRatingDate: null, revenueGrowthPeriod: 'provider_reported_growth', operatingMarginPeriod: 'trailing_twelve_months',
  };
}

export function recommend(holding, fundamentals, articles, instrumentName = '') {
  const symbol = String(holding.symbol).toUpperCase();
  if (Number(holding.shares) < 0) return { action: 'cover_review', confidence: 'high', reason: 'החזקה שלילית מסומנת כשורט, בניגוד למדיניות שלך. בדוק סגירת החשיפה מול הברוקר.', evidence: [], limitations: ['יש לאמת שהכמות השלילית אינה שגיאת רישום.'] };
  const leveraged = symbol === 'NVDL' || /\b(?:leveraged|ultra|[23]x)\b/i.test(instrumentName);
  const inverse = /\b(?:inverse|short)\b/i.test(instrumentName);
  if (inverse) return { action: 'review', confidence: 'insufficient', reason: 'זוהתה חשיפה הפוכה. יש לבדוק אם איסור השורט שלך חל גם על המכשיר הזה.', evidence: [], limitations: ['זיהוי לפי שם בלבד; אין הוראת מכירה אוטומטית.'] };
  if (leveraged) return { action: 'review', confidence: 'insufficient', reason: 'מכשיר ממונף מותר במדיניות שלך. יש לבדוק חשיפה כוללת וסיכון; אין המלצת מכירה רק בגלל המינוף.', evidence: symbol === 'NVDL' ? [{ title: 'מאפייני המינוף היומי אצל המנפיק', url: 'https://graniteshares.com/etfs/nvdl/' }] : [], limitations: ['מינוף יומי אינו מכפיל קבוע של תשואה על פני חמש שנים.', 'בחרת לא לקבוע תקרת חשיפה למכשירים ממונפים כרגע.'] };
  const publishers = new Set(articles.map(article => String(article.source || article.sourceDomain || '').trim().toLowerCase()).filter(Boolean));
  const limitations = ['הנתונים חינמיים ועלולים להתעכב; תאריך המלצות האנליסטים אינו זמין.', 'לא חושבו מיסוי, עמלות, יעד הקצאה או חפיפה בין קרנות.', 'מפרסמים שונים עשויים להפיץ את אותה ידיעה; אין בכך אימות עצמאי.'];
  if (fundamentals?.valuation?.status === 'passes_screen' && fundamentals.analystCount >= 5 && publishers.size >= 2 && fundamentals.operatingMargin > 0 && fundamentals.revenueGrowth > 0 && ['buy', 'strong_buy'].includes(fundamentals.analystConsensus)) {
    return { action: 'buy_review', confidence: 'low', reason: `מועמדת לבחינת הגדלה: קונצנזוס ${fundamentals.analystCount} אנליסטים חיובי, צמיחת ההכנסות ושולי הרווח התפעולי חיוביים, ונמצאו כתבות של לפחות שני מפרסמים. מכפיל הרווח עבר את סינון התמחור; בדוק פיזור והתאמה לסיכון בינוני לפני קנייה.`, evidence: articles.slice(0, 3).map(({ title, url }) => ({ title, url })), limitations };
  }
  if (fundamentals?.analystCount >= 5 && publishers.size >= 2 && ['sell', 'strong_sell'].includes(fundamentals.analystConsensus) && fundamentals.operatingMargin < 0 && fundamentals.revenueGrowth < 0) {
    return { action: 'sell_review', confidence: 'low', reason: 'מועמדת לבחינת צמצום: קונצנזוס האנליסטים שלילי, צמיחת ההכנסות ושולי הרווח התפעולי שליליים. יש לבדוק את הדוח המקורי ואת תזת ההשקעה לפני מכירה.', evidence: articles.slice(0, 3).map(({ title, url }) => ({ title, url })), limitations };
  }
  return { action: 'review', confidence: 'insufficient', reason: 'אין מספיק ראיות להציע קנייה או מכירה. זהו מצב של מידע חסר, ולא המלצת החזקה.', evidence: [], limitations };
}

function providerDate(value) {
  const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  return value != null && Number.isFinite(date.getTime()) ? date : null;
}

export function normalizeLatestReport(series, reportingCurrency, symbol, now = new Date()) {
  if (!Array.isArray(series)) return null;
  const quarters = series.flatMap(row => {
    const date = providerDate(row?.date);
    if (!date || date > now || row.periodType !== '3M' || !['totalRevenue', 'netIncome', 'operatingIncome', 'dilutedEPS'].some(key => finite(row[key]) !== null)) return [];
    return [{ ...row, date }];
  }).sort((a, b) => b.date - a.date);
  const latest = quarters[0];
  if (!latest) return null;
  const yearAgo = new Date(latest.date); yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const previous = quarters.slice(1).filter(row => Math.abs(row.date - yearAgo) <= 14 * 86400000)
    .sort((a, b) => Math.abs(a.date - yearAgo) - Math.abs(b.date - yearAgo))[0];
  const revenue = finite(latest.totalRevenue), operatingIncome = finite(latest.operatingIncome);
  const priorRevenue = finite(previous?.totalRevenue);
  const currency = typeof reportingCurrency === 'string' && /^[A-Z]{3}$/.test(reportingCurrency) ? reportingCurrency : null;
  return { periodEnd: latest.date.toISOString(), periodType: 'quarterly', publicationDate: null, currency,
    revenue, netIncome: finite(latest.netIncome), operatingIncome, dilutedEPS: finite(latest.dilutedEPS),
    revenueGrowth: revenue !== null && priorRevenue !== null && priorRevenue > 0 ? revenue / priorRevenue - 1 : null,
    revenueGrowthPeriod: 'same_quarter_previous_year', previousPeriodEnd: previous?.date.toISOString() || null,
    operatingMargin: revenue !== null && revenue > 0 && operatingIncome !== null ? operatingIncome / revenue : null,
    sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/financials/`, fetchedAt: now.toISOString(),
    limitations: ['זהו סוף הרבעון המדווח, לא תאריך פרסום הדוח.', 'הנתונים מועברים דרך Yahoo Finance ואינם אימות של דיווח החברה המקורי.'],
  };
}

export function discoveryCandidates(payload, heldSymbols, now = new Date()) {
  if (!Array.isArray(payload?.quotes)) throw new Error('INVALID_DISCOVERY_RESPONSE');
  const seen = new Set();
  return payload.quotes.flatMap(quote => {
    const symbol = String(quote?.symbol || '').toUpperCase();
    const quoteTime = providerDate(quote?.regularMarketTime);
    const changePercent = finite(quote?.regularMarketChangePercent), marketCap = finite(quote?.marketCap);
    if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) || heldSymbols.has(symbol) || seen.has(symbol) || quote.quoteType !== 'EQUITY' || quote.currency !== 'USD' || marketCap === null || marketCap < 2e9 || changePercent === null || changePercent <= 0 || !quoteTime || quoteTime > now || now - quoteTime > 4 * 86400000) return [];
    seen.add(symbol);
    const average = finite(quote.averageDailyVolume3Month), volume = finite(quote.regularMarketVolume);
    return [{ symbol, instrumentName: quote.longName || quote.shortName || symbol, marketActivity: {
      changePercent, relativeVolume: average !== null && average > 0 && volume !== null && volume >= 0 ? volume / average : null,
      quoteTime: quoteTime.toISOString(), marketCap, currency: 'USD', volume, averageVolume: average,
      sourceUrl: 'https://finance.yahoo.com/markets/stocks/most-active/',
    } }];
  }).sort((a, b) => (b.marketActivity.relativeVolume ?? -1) - (a.marketActivity.relativeVolume ?? -1) || b.marketActivity.changePercent - a.marketActivity.changePercent).slice(0, 8);
}

async function boundedCall(callback, key, deadline) {
  if (!callback || Date.now() >= deadline) throw new Error('SOURCE_UNAVAILABLE');
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('SOURCE_TIMEOUT')); }, Math.min(8000, deadline - Date.now())); });
  try { return await Promise.race([Promise.resolve().then(() => callback(key, { signal: controller.signal })), timeout]); }
  finally { clearTimeout(timer); }
}

export function createResearchService({ search, summary, quarterly, discover, now = () => new Date() }) {
  return async (holdings, { budgetMs = 42000 } = {}) => {
    if (!Array.isArray(holdings) || holdings.length > 200) throw new Error('INVALID_HOLDINGS');
    const active = holdings.filter(item => item?.status === 'active');
    const heldSymbols = new Set(active.map(item => String(item.symbol).toUpperCase()));
    const relevant = active.filter(item => !String(item.symbol).startsWith('CASH_') && Number(item.shares) !== 0);
    const symbols = [...new Set(relevant.map(item => String(item.symbol).toUpperCase()))];
    const scannedAt = now().toISOString(), deadline = Date.now() + Math.max(1, Math.min(42000, budgetMs));
    const holdingDeadline = Math.max(Date.now(), deadline - 6000);
    const results = new Map();
    const scanSymbol = async (symbol, stopAt) => {
      const empty = { symbol, status: 'error', articles: [], fundamentals: null, latestReport: null, instrumentName: '', issues: [] };
      if (Date.now() >= stopAt) return { ...empty, issues: ['מגבלת זמן הסריקה הגיעה; מכשיר זה לא נבדק בריצה הזו.'] };
      if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) return { ...empty, status: 'unsupported', issues: ['אין כיסוי מאומת במקור החינמי למכשיר זה.'] };
      const [newsResult, financialResult, quarterlyResult] = await Promise.allSettled([
        boundedCall(search, symbol, stopAt), boundedCall(summary, symbol, stopAt), boundedCall(quarterly, symbol, stopAt),
      ]);
      let articles = [], status = 'error'; const issues = [];
      if (newsResult.status === 'fulfilled') {
        try { articles = normalizeArticles(newsResult.value?.news, symbol, now()); status = articles.length ? 'available' : 'no_recent_news'; }
        catch { issues.push('תשובת החדשות אינה תקינה.'); }
      } else issues.push('מקור החדשות אינו זמין.');
      const rawSummary = financialResult.status === 'fulfilled' ? financialResult.value : null;
      let fundamentals = normalizeFundamentals(rawSummary, now());
      if (!fundamentals) issues.push('נתוני האנליסטים אינם זמינים.');
      const latestReport = quarterlyResult.status === 'fulfilled' ? normalizeLatestReport(quarterlyResult.value, rawSummary?.financialData?.financialCurrency, symbol, now()) : null;
      if (latestReport && fundamentals) {
        fundamentals = { ...fundamentals,
          ...(latestReport.revenueGrowth !== null ? { revenueGrowth: latestReport.revenueGrowth, revenueGrowthPeriod: 'quarterly_yoy' } : {}),
          ...(latestReport.operatingMargin !== null ? { operatingMargin: latestReport.operatingMargin, operatingMarginPeriod: 'quarterly' } : {}),
          latestQuarterEnd: latestReport.periodEnd,
        };
      }
      if (!latestReport) issues.push('הדוח הרבעוני האחרון אינו זמין במקור; לא מוצגים נתוני TTM כרבעון.');
      else if (!latestReport.currency) issues.push('מטבע הדיווח הרבעוני אינו זמין; הסכומים מוצגים ללא הנחת מטבע.');
      const instrumentName = String(rawSummary?.price?.longName || rawSummary?.price?.shortName || '');
      return { symbol, status, articles, fundamentals, valuation: fundamentals?.valuation || normalizeValuation(rawSummary), latestReport, instrumentName, issues,
        researchUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/analysis/` };
    };
    const runPool = async (items, count, callback) => {
      let position = 0;
      await Promise.all(Array.from({ length: Math.min(count, items.length) }, async () => { while (position < items.length) await callback(items[position++]); }));
    };
    let opportunities = [];
    const discovery = { scannedAt, status: discover ? 'pending' : 'unavailable', sourceUrl: 'https://finance.yahoo.com/markets/stocks/most-active/',
      methodology: 'מניות USD מסוג EQUITY מתוך Most Actives של Yahoo, בשווי שוק של לפחות 2 מיליארד דולר ובעלייה במושב המסחר האחרון. מדורגות לפי יחס המחזור לממוצע 3 חודשים ואחוז העלייה; כל סימול שמוחזק בתיק מוחרג. נבדקות עד 8 מועמדות ומוצגות עד 4 רק כשהחדשות ונתוני האנליסטים עומדים בכללי buy_review. זו רשימה מוגבלת, לא סריקה של כל השוק.',
      candidateCount: 0, researchedCount: 0, qualifiedCount: 0, issues: [],
    };
    await Promise.all([
      runPool(symbols, 3, async symbol => {
        const result = await scanSymbol(symbol, holdingDeadline);
        const lots = relevant.filter(item => String(item.symbol).toUpperCase() === symbol);
        const holding = lots.find(item => Number(item.shares) < 0) || lots[0];
        results.set(symbol, { ...result, recommendation: recommend(holding, result.fundamentals, result.articles, result.instrumentName) });
      }),
      (async () => {
        if (!discover) return;
        try {
          const candidates = discoveryCandidates(await boundedCall(discover, null, deadline), heldSymbols, now());
          discovery.candidateCount = candidates.length;
          const eligible = [];
          await runPool(candidates, 2, async candidate => {
            const result = await scanSymbol(candidate.symbol, deadline);
            if (result.status !== 'error' && result.status !== 'unsupported') discovery.researchedCount++;
            const recommendation = recommend({ symbol: candidate.symbol, shares: 0 }, result.fundamentals, result.articles, result.instrumentName);
            if (recommendation.action === 'buy_review') eligible.push({ ...result, instrumentName: result.instrumentName || candidate.instrumentName, marketActivity: candidate.marketActivity, recommendation });
          });
          eligible.sort((a, b) => (b.marketActivity.relativeVolume ?? -1) - (a.marketActivity.relativeVolume ?? -1) || b.marketActivity.changePercent - a.marketActivity.changePercent);
          discovery.qualifiedCount = eligible.length;
          opportunities = eligible.slice(0, 4);
          discovery.status = discovery.researchedCount < candidates.length ? 'partial' : 'complete';
          if (discovery.status === 'partial') discovery.issues.push('חלק מהמועמדות לא נבדקו עקב מידע חסר או מגבלת זמן.');
        } catch { discovery.status = 'unavailable'; discovery.issues.push('מקור גילוי המניות אינו זמין; מחקר ההחזקות נשמר.'); }
      })(),
    ]);
    return { provider: 'Yahoo Finance', reportVersion: 3, scannedAt, policy: INVESTMENT_POLICY, mode: 'suggestions_only', maxNewsAgeDays: MAX_NEWS_AGE_DAYS,
      results: symbols.map(symbol => results.get(symbol)), opportunities, discovery,
    };
  };
}
