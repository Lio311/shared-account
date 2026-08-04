import { Client } from 'pg';
import YahooFinance from 'yahoo-finance2';
import webpush from 'web-push';

const yahooFinance = new YahooFinance();
const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_7gt0IRDvYAJW@ep-hidden-smoke-apxqgfzb-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  process.env.VITE_VAPID_PUBLIC_KEY || 'BHQ2jS5SVlOHPhpA7ZVMTT0VjMc9HII94ck8j2eGXQyF9SEcN8RGSEMECDELcGCgGUm5-s-ABaJZId6x00UMw04',
  process.env.VAPID_PRIVATE_KEY || 'Wrlq3IZzLTKwc6Ft2BJODqVYQxNRgTWR4RHNwgtQ0X4'
);

async function getBoiRate(currency) {
  if (currency === 'ILS') return 1;
  try {
    const res = await fetch('https://boi.org.il/PublicApi/GetExchangeRates');
    const data = await res.json();
    const rateData = data.exchangeRates.find(r => r.key === currency);
    if (rateData) {
      return rateData.currentExchangeRate;
    }
  } catch (err) {
    console.error("Error fetching BOI rate", err);
  }
  return 1;
}

export default async function handler(req, res) {
  // In production, ensure this is called by Vercel Cron
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();

    // Fetch all active stocks
    const result = await client.query("SELECT * FROM portfolio_stocks WHERE status = 'active'");
    const stocks = result.rows;
    
    // Fetch total deposited
    const invResult = await client.query("SELECT total_deposited FROM investments LIMIT 1");
    const totalDeposited = parseFloat(invResult.rows[0]?.total_deposited || 0);

    let totalCurrentValueIls = 0;
    let totalPreviousValueIls = 0;

    for (let stock of stocks) {
      let currentPriceFc = parseFloat(stock.purchase_price_fc);
      let currentExchangeRate = parseFloat(stock.purchase_exchange_rate);
      let dayChangePercent = 0;

      if (stock.symbol === 'CASH_ILS') {
        currentPriceFc = 1;
        currentExchangeRate = 1;
      } else if (stock.symbol === 'CASH_USD') {
        currentPriceFc = 1;
        currentExchangeRate = await getBoiRate('USD');
      } else {
        const isIsraeli = stock.symbol.match(/^\d{6,7}$/);
        if (isIsraeli) {
          currentExchangeRate = 1;
          try {
            const knownIsraeliPrices = {
              '1183441': 46.34,
              '1159250': 2486.60
            };
            const quote = await yahooFinance.quote(`${stock.symbol}.TA`);
            if (quote && quote.regularMarketPrice) {
              currentPriceFc = quote.regularMarketPrice / 100;
              dayChangePercent = quote.regularMarketChangePercent || 0;
            } else {
              currentPriceFc = knownIsraeliPrices[stock.symbol] || parseFloat(stock.purchase_price_fc);
            }
          } catch (e) {
            const knownIsraeliPrices = {
              '1183441': 46.34,
              '1159250': 2486.60
            };
            currentPriceFc = knownIsraeliPrices[stock.symbol] || parseFloat(stock.purchase_price_fc);
          }
        } else {
          try {
            const quote = await yahooFinance.quote(stock.symbol);
            if (quote && quote.regularMarketPrice) {
              currentPriceFc = quote.regularMarketPrice;
              dayChangePercent = quote.regularMarketChangePercent || 0;
            }
          } catch (e) {
            console.error(`Failed to fetch Yahoo Finance for ${stock.symbol}`, e.message);
          }
          currentExchangeRate = await getBoiRate(stock.currency);
        }
      }

      const currentValueIls = currentPriceFc * currentExchangeRate * parseFloat(stock.shares);
      
      // Calculate previous day value for this stock
      // New Value = Old Value * (1 + change%)
      // Old Value = New Value / (1 + change%)
      let prevValueIls = currentValueIls;
      if (dayChangePercent !== 0) {
        prevValueIls = currentValueIls / (1 + (dayChangePercent / 100));
      }

      totalCurrentValueIls += currentValueIls;
      totalPreviousValueIls += prevValueIls;
    }

    const overallPlIls = totalCurrentValueIls - totalDeposited;
    const overallPlPercent = totalDeposited > 0 ? (overallPlIls / totalDeposited) * 100 : 0;
    
    const dailyPlIls = totalCurrentValueIls - totalPreviousValueIls;
    const dailyPlPercent = totalPreviousValueIls > 0 ? (dailyPlIls / totalPreviousValueIls) * 100 : 0;

    const formatMoney = (val) => {
      const num = parseFloat(val || 0);
      const formatted = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(num));
      return `${num < 0 ? '-' : ''}₪${formatted}`;
    };

    const title = 'סיכום תיק יומי 📈';
    const body = `התיק ${dailyPlPercent >= 0 ? 'עלה' : 'ירד'} היום ב-${Math.abs(dailyPlPercent).toFixed(2)}% (${formatMoney(dailyPlIls)})\n` +
                 `סה״כ רווח פתוח: ${overallPlPercent >= 0 ? '+' : ''}${overallPlPercent.toFixed(2)}% (${formatMoney(overallPlIls)})\n` +
                 `שווי כולל: ${formatMoney(totalCurrentValueIls)}`;

    // Fetch all push subscriptions
    const subRes = await client.query('SELECT * FROM push_subscriptions');
    const subscriptions = subRes.rows;

    let successCount = 0;
    let failCount = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub.keys, JSON.stringify({
          title,
          body
        }));
        successCount++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription has expired or is no longer valid
          await client.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        } else {
          console.error('Push notification failed for a subscriber:', err);
        }
        failCount++;
      }
    }

    return res.status(200).json({ 
      success: true, 
      notified: successCount, 
      failed: failCount,
      stats: {
        portfolioValue: totalCurrentValueIls,
        dailyPlIls,
        dailyPlPercent,
        overallPlIls,
        overallPlPercent
      }
    });

  } catch (error) {
    console.error('Cron Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
