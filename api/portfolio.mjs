import { requireAuth } from './_lib/auth.mjs';
import { Client } from 'pg';
import YahooFinance from 'yahoo-finance2';
import { HttpError, bodyObject, finiteNumber, positiveId, requiredText, validDate, closeClient, historicalExchangeRate } from './_lib/validation.mjs';
const yahooFinance = new YahooFinance();

const connectionString = process.env.DATABASE_URL;

let boiRateCache = {};
let lastBoiFetchTime = 0;
let yahooQuoteCache = {};

async function getBoiRate(currency, dateStr) {
  currency = requiredText(currency, 'currency', 3).toUpperCase();
  if (currency === 'ILS') return 1;
  try {
    if (dateStr) {
      const start = new Date(`${dateStr}T00:00:00Z`);
      start.setUTCDate(start.getUTCDate() - 7);
      const url = `https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/?startperiod=${start.toISOString().slice(0, 10)}&endperiod=${dateStr}&format=csv`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return historicalExchangeRate(await res.text(), currency, dateStr);
    } else {
      // Use cache if within 1 hour
      if (boiRateCache[currency] && (Date.now() - lastBoiFetchTime < 1000 * 60 * 60)) {
        return boiRateCache[currency];
      }
      const res = await fetch('https://boi.org.il/PublicApi/GetExchangeRates', { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('Exchange rate service unavailable');
      const data = await res.json();
      
      lastBoiFetchTime = Date.now();
      for (const r of data.exchangeRates) {
        const value = Number(r.currentExchangeRate);
        if (Number.isFinite(value) && value > 0) boiRateCache[r.key] = value;
      }
      
      const rateData = data.exchangeRates.find(r => r.key === currency);
      if (rateData) {
        const value = Number(rateData.currentExchangeRate);
        if (Number.isFinite(value) && value > 0) return value;
      }
    }
  } catch (err) {
    console.error("Error fetching BOI rate", err);
  }
  throw new HttpError(503, `Exchange rate unavailable for ${currency}; no changes were saved`);
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  const client = new Client({ connectionString });
  let inTransaction = false;

  try {
    if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return res.status(405).send('Method Not Allowed');
    // Validate request shape before opening a connection.
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) req.body = bodyObject(req.body);
    await client.connect();
    if (req.method !== 'GET') {
      await client.query('BEGIN');
      inTransaction = true;
    }

    if (req.method === 'GET') {
      const investmentId = positiveId(req.query?.investment_id, 'investment_id');

      if (!investmentId) {
        return res.status(400).send('Missing investment_id');
      }

      const result = await client.query('SELECT * FROM portfolio_stocks WHERE investment_id = $1 ORDER BY status ASC, purchase_date DESC', [investmentId]);
      const stocks = result.rows;
      const invResult = await client.query('SELECT total_deposited FROM investments WHERE id = $1', [investmentId]);
      if (!invResult.rows.length) throw new HttpError(404, 'Investment not found');
      const totalDeposited = parseFloat(invResult.rows[0]?.total_deposited || 0);

      let totalCurrentValueIls = 0;

      const enrichedStocks = await Promise.all(stocks.map(async (stock) => {
        let currentPriceFc = stock.purchase_price_fc;
        let currentExchangeRate = stock.purchase_exchange_rate;
        let dayChangePercent = 0;
        let currentQuoteTime = null;
        let displayName = stock.name;
        let valuationStatus = stock.status === 'sold' ? 'sale' : 'stored_estimate';
        const currentRate = async (currency) => {
          try { return await getBoiRate(currency, null); }
          catch { valuationStatus = 'stored_estimate'; return Number(stock.purchase_exchange_rate); }
        };

        if (stock.status === 'active') {
          if (stock.symbol === 'CASH_ILS') {
            currentPriceFc = 1;
            currentExchangeRate = 1;
            valuationStatus = 'cash';
          } else if (stock.symbol.startsWith('CASH_')) {
            currentPriceFc = 1;
            valuationStatus = 'cash';
            currentExchangeRate = await currentRate(stock.currency);
          } else {
            const isIsraeli = stock.symbol.match(/^\d{6,7}$/);
            if (isIsraeli) {
              currentExchangeRate = 1;
              try {
                const cacheKey = `${stock.symbol}.TA`;
                if (!yahooQuoteCache[cacheKey] || Date.now() - yahooQuoteCache[cacheKey].time > 1000 * 60 * 15) {
                   yahooQuoteCache[cacheKey] = { quote: await yahooFinance.quote(cacheKey).catch(() => null), time: Date.now() };
                }
                const quote = yahooQuoteCache[cacheKey].quote;

                if (quote && Number.isFinite(quote.regularMarketPrice) && quote.regularMarketPrice > 0) {
                  // TASE prices may be quoted in agorot; only convert when currency explicitly says ILA.
                  currentPriceFc = quote.currency === 'ILA' ? quote.regularMarketPrice / 100 : quote.regularMarketPrice;
                  valuationStatus = 'market';
                  displayName = quote.longName || quote.shortName || stock.name;
                  const quoteDate = new Date(quote.regularMarketTime);
                  if (quote.regularMarketTime && Number.isFinite(quoteDate.getTime())) currentQuoteTime = quoteDate.toISOString();
                  dayChangePercent = Number.isFinite(quote.regularMarketChangePercent) ? quote.regularMarketChangePercent : 0;
                } else {
                  currentPriceFc = parseFloat(stock.purchase_price_fc);
                }
              } catch (e) {
                console.error(`Failed to fetch Yahoo Finance for ${stock.symbol}`, e.message || e);
                currentPriceFc = parseFloat(stock.purchase_price_fc);
              }
            } else {
              try {
                const cacheKey = stock.symbol;
                if (!yahooQuoteCache[cacheKey] || Date.now() - yahooQuoteCache[cacheKey].time > 1000 * 60 * 15) {
                   yahooQuoteCache[cacheKey] = { quote: await yahooFinance.quote(cacheKey).catch(() => null), time: Date.now() };
                }
                const quote = yahooQuoteCache[cacheKey].quote;

                if (quote && Number.isFinite(quote.regularMarketPrice) && quote.regularMarketPrice > 0) {
                  currentPriceFc = quote.regularMarketPrice;
                  valuationStatus = 'market';
                  displayName = quote.longName || quote.shortName || stock.name;
                  const quoteDate = new Date(quote.regularMarketTime);
                  if (quote.regularMarketTime && Number.isFinite(quoteDate.getTime())) currentQuoteTime = quoteDate.toISOString();
                  dayChangePercent = Number.isFinite(quote.regularMarketChangePercent) ? quote.regularMarketChangePercent : 0;
                }
              } catch (e) {
                console.error(`Failed to fetch Yahoo Finance for ${stock.symbol}`, e.message || e);
              }
              currentExchangeRate = await currentRate(stock.currency);
            }
          }
        } else if (stock.status === 'sold') {
          currentPriceFc = stock.sale_price_fc;
          currentExchangeRate = stock.sale_exchange_rate;
        }

        const currentValueIls = currentPriceFc * currentExchangeRate * stock.shares;
        if (![Number(currentPriceFc), Number(currentExchangeRate), Number(stock.shares), currentValueIls].every(Number.isFinite) || Number(currentPriceFc) < 0 || Number(currentExchangeRate) <= 0) throw new HttpError(503, `Invalid stored valuation data for ${stock.symbol}`);

        return {
          ...stock,
          name: displayName,
          current_quote_time: currentQuoteTime,
          current_price_fc: currentPriceFc,
          current_exchange_rate: currentExchangeRate,
          current_value_ils: currentValueIls,
          day_change_percent: dayChangePercent,
          valuation_status: valuationStatus,
          unrealized_pl_fc: stock.status === 'active' ? ((currentPriceFc - parseFloat(stock.purchase_price_fc)) * stock.shares) : 0,
          unrealized_pl_percent: stock.status === 'active' && parseFloat(stock.purchase_price_fc) > 0 ? ((currentPriceFc - parseFloat(stock.purchase_price_fc)) / parseFloat(stock.purchase_price_fc) * 100) : 0,
          unrealized_pl_ils: stock.status === 'active' ? (currentValueIls - stock.purchase_price_ils) : 0,
          realized_pl_ils: stock.status === 'sold' ? (stock.sale_price_ils - stock.purchase_price_ils) : 0
        };
      }));

      for (const stock of enrichedStocks) {
        if (stock.status === 'active') {
          totalCurrentValueIls += stock.current_value_ils;
        }
      }

      // Reading prices must never persist stale estimates into the user's financial records.

      return res.status(200).json({
        stocks: enrichedStocks,
        fetched_at: new Date().toISOString(),
        valuation_warnings: enrichedStocks.filter(stock => stock.status === 'active' && stock.valuation_status === 'stored_estimate').map(stock => stock.symbol),
        portfolioValue: totalCurrentValueIls,
        totalDeposited: totalDeposited,
        overallPlIls: totalCurrentValueIls - totalDeposited
      });
    }

    if (req.method === 'POST') {
      const body = bodyObject(req.body);
      const investment_id = positiveId(body.investment_id, 'investment_id');
      const symbol = requiredText(body.symbol, 'symbol', 32).toUpperCase();
      if (!/^[A-Z0-9.^=-]+$/.test(symbol) || symbol.startsWith('CASH_')) throw new HttpError(400, 'Invalid stock symbol');
      const currency = requiredText(body.currency, 'currency', 3).toUpperCase();
      if (!['ILS', 'USD', 'EUR'].includes(currency)) throw new HttpError(400, 'Unsupported currency');
      const shares = finiteNumber(body.shares, 'shares', { exclusive: true });
      const purchase_price_fc = finiteNumber(body.purchase_price_fc, 'purchase_price_fc', { exclusive: true });
      const purchase_date = validDate(body.purchase_date, 'purchase_date').slice(0, 10);
      const investment = await client.query('SELECT id FROM investments WHERE id = $1 FOR UPDATE', [investment_id]);
      if (!investment.rows.length) throw new HttpError(404, 'Investment not found');

      const rate = await getBoiRate(currency, purchase_date);
      const cashSymbol = `CASH_${currency}`;
      const cash = await client.query("SELECT id, shares FROM portfolio_stocks WHERE investment_id = $1 AND symbol = $2 AND status = 'active' FOR UPDATE", [investment_id, cashSymbol]);
      if (cash.rows.length !== 1 || Number(cash.rows[0].shares) + 1e-8 < shares * purchase_price_fc) throw new HttpError(400, 'Insufficient cash balance in purchase currency');
      const added_ils = parseFloat(purchase_price_fc) * rate * parseFloat(shares);
      const added_fc_cost = parseFloat(purchase_price_fc) * parseFloat(shares);
      if (!Number.isFinite(added_ils) || !Number.isFinite(added_fc_cost)) throw new HttpError(400, 'Purchase amount is too large');

      const existingRes = await client.query(
        `SELECT id, shares, purchase_price_fc, purchase_price_ils FROM portfolio_stocks WHERE investment_id = $1 AND symbol = $2 AND status = 'active'`,
        [investment_id, symbol.toUpperCase()]
      );

      let result;
      if (existingRes.rows.length > 0) {
        const existing = existingRes.rows[0];
        const currencyCheck = await client.query('SELECT currency FROM portfolio_stocks WHERE id = $1', [existing.id]);
        if (currencyCheck.rows[0]?.currency !== currency) throw new HttpError(400, 'Currency must match existing holding');
        const newShares = parseFloat(existing.shares) + parseFloat(shares);
        const newIls = parseFloat(existing.purchase_price_ils) + added_ils;
        const newTotalFc = (parseFloat(existing.purchase_price_fc) * parseFloat(existing.shares)) + added_fc_cost;
        const newAvgFc = newTotalFc / newShares;
        const newAvgRate = newIls / newTotalFc;
        
        result = await client.query(
          `UPDATE portfolio_stocks 
           SET shares = $1, purchase_price_fc = $2, purchase_exchange_rate = $3, purchase_price_ils = $4, purchase_date = $5
           WHERE id = $6 RETURNING *`,
          [newShares, newAvgFc, newAvgRate, newIls, purchase_date, existing.id]
        );
      } else {
        result = await client.query(
          `INSERT INTO portfolio_stocks (investment_id, symbol, shares, currency, purchase_date, purchase_price_fc, purchase_exchange_rate, purchase_price_ils)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [investment_id, symbol.toUpperCase(), shares, currency.toUpperCase(), purchase_date, purchase_price_fc, rate, added_ils]
        );
      }

      const totalCostFc = parseFloat(shares) * parseFloat(purchase_price_fc);
      await client.query(
        `UPDATE portfolio_stocks SET shares = shares - $1 WHERE investment_id = $2 AND symbol = $3 AND status = 'active'`,
        [totalCostFc, investment_id, cashSymbol]
      );

      await client.query('COMMIT'); inTransaction = false;
      return res.status(201).json(result.rows[0]);
    }

    if (req.method === 'PUT') {
      const body = bodyObject(req.body);
      const id = positiveId(body.id);
      const sale_date = validDate(body.sale_date, 'sale_date').slice(0, 10);
      const sale_price_fc = finiteNumber(body.sale_price_fc, 'sale_price_fc');
      const sale_shares = body.sale_shares;
      
      const lookup = await client.query('SELECT * FROM portfolio_stocks WHERE id = $1', [id]);
      if (!lookup.rows.length) throw new HttpError(404, 'Holding not found');
      // Serialize every cash operation within an investment, including absent cash rows.
      await client.query('SELECT id FROM investments WHERE id = $1 FOR UPDATE', [lookup.rows[0].investment_id]);
      const stockRes = await client.query('SELECT * FROM portfolio_stocks WHERE id = $1 FOR UPDATE', [id]);
      if (stockRes.rows.length === 0) return res.status(404).send('Not found');
      const stock = stockRes.rows[0];
      if (stock.status !== 'active' || stock.symbol.startsWith('CASH_')) throw new HttpError(400, 'Holding is not available for sale');
      const sellQty = sale_shares === undefined ? Number(stock.shares) : finiteNumber(sale_shares, 'sale_shares', { exclusive: true });
      if (sellQty > Number(stock.shares)) throw new HttpError(400, 'Sale quantity exceeds available shares');
      if (sale_date < String(stock.purchase_date instanceof Date ? stock.purchase_date.toISOString() : stock.purchase_date).slice(0, 10)) throw new HttpError(400, 'Sale date precedes purchase date');
      const remainingShares = parseFloat(stock.shares) - sellQty;

      const rate = await getBoiRate(stock.currency, sale_date);
      const sale_price_ils = parseFloat(sale_price_fc) * rate * sellQty;
      if (!Number.isFinite(sale_price_ils)) throw new HttpError(400, 'Sale amount is too large');

      const avgCostIls = parseFloat(stock.purchase_price_ils) / parseFloat(stock.shares);
      const realizedCostIls = avgCostIls * sellQty;

      let result;
      if (remainingShares === 0) {
        result = await client.query(
          `UPDATE portfolio_stocks 
           SET status = 'sold', sale_date = $1, sale_price_fc = $2, sale_exchange_rate = $3, sale_price_ils = $4
           WHERE id = $5 RETURNING *`,
          [sale_date, sale_price_fc, rate, sale_price_ils, id]
        );
      } else {
        await client.query(
          `UPDATE portfolio_stocks SET shares = $1, purchase_price_ils = $2 WHERE id = $3`,
          [remainingShares, parseFloat(stock.purchase_price_ils) - realizedCostIls, id]
        );
        result = await client.query(
          `INSERT INTO portfolio_stocks (investment_id, symbol, name, shares, currency, purchase_date, purchase_price_fc, purchase_exchange_rate, purchase_price_ils, status, sale_date, sale_price_fc, sale_exchange_rate, sale_price_ils)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'sold', $10, $11, $12, $13) RETURNING *`,
          [stock.investment_id, stock.symbol, stock.name, sellQty, stock.currency, stock.purchase_date, stock.purchase_price_fc, stock.purchase_exchange_rate, realizedCostIls, sale_date, sale_price_fc, rate, sale_price_ils]
        );
      }

      const cashSymbol = `CASH_${stock.currency.toUpperCase()}`;
      const totalGainFc = sellQty * parseFloat(sale_price_fc);
      const cashUpdate = await client.query(
        `UPDATE portfolio_stocks SET shares = shares + $1 WHERE investment_id = $2 AND symbol = $3 AND status = 'active' RETURNING id`,
        [totalGainFc, stock.investment_id, cashSymbol]
      );
      if (!cashUpdate.rows.length) await client.query(
        `INSERT INTO portfolio_stocks (investment_id, symbol, shares, currency, purchase_date, purchase_price_fc, purchase_exchange_rate, purchase_price_ils) VALUES ($1, $2, $3, $4, $5, 1, $6, $7)`,
        [stock.investment_id, cashSymbol, totalGainFc, stock.currency, sale_date, rate, sale_price_ils]
      );

      await client.query('COMMIT'); inTransaction = false;
      return res.status(200).json(result.rows[0]);
    }

    if (req.method === 'DELETE') {
      const id = positiveId(req.query?.id);
      if (!id) return res.status(400).send('Missing id');
      await client.query('DELETE FROM portfolio_stocks WHERE id = $1', [id]);
      await client.query('COMMIT'); inTransaction = false;
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PATCH') {
      const body = bodyObject(req.body);
      const investment_id = positiveId(body.investment_id, 'investment_id');
      if ((body.add_amount !== undefined) === (body.set_amount !== undefined)) throw new HttpError(400, 'Provide exactly one deposit amount');
      const add_amount = body.add_amount === undefined ? undefined : finiteNumber(body.add_amount, 'add_amount', { exclusive: true });
      const set_amount = body.set_amount === undefined ? undefined : finiteNumber(body.set_amount, 'set_amount');
      const investment = await client.query('SELECT id FROM investments WHERE id = $1 FOR UPDATE', [investment_id]);
      if (!investment.rows.length) throw new HttpError(404, 'Investment not found');
      if (!investment_id) return res.status(400).send('Missing investment_id');

      let cashDelta = 0;

      if (set_amount !== undefined) {
        const oldInv = await client.query('SELECT total_deposited FROM investments WHERE id = $1', [investment_id]);
        const oldDeposited = parseFloat(oldInv.rows[0]?.total_deposited || 0);
        cashDelta = set_amount - oldDeposited;
        await client.query('UPDATE investments SET total_deposited = $1 WHERE id = $2', [set_amount, investment_id]);
      } else if (add_amount !== undefined) {
        cashDelta = add_amount;
        await client.query('UPDATE investments SET total_deposited = total_deposited + $1 WHERE id = $2', [add_amount, investment_id]);
      } else {
        return res.status(400).send('Missing add_amount or set_amount');
      }

      if (cashDelta !== 0) {
        const cash = await client.query("SELECT id, shares FROM portfolio_stocks WHERE investment_id = $1 AND symbol = 'CASH_ILS' AND status = 'active' FOR UPDATE", [investment_id]);
        if (cashDelta < 0 && (!cash.rows.length || Number(cash.rows[0].shares) + cashDelta < 0)) throw new HttpError(400, 'Deposit correction exceeds available cash');
        if (cash.rows.length) {
          await client.query('UPDATE portfolio_stocks SET shares = shares + $1 WHERE id = $2', [cashDelta, cash.rows[0].id]);
        } else {
          await client.query("INSERT INTO portfolio_stocks (investment_id, symbol, shares, currency, purchase_date, purchase_price_fc, purchase_exchange_rate, purchase_price_ils) VALUES ($1, 'CASH_ILS', $2, 'ILS', CURRENT_DATE, 1, 1, $2)", [investment_id, cashDelta]);
        }
      }

      const inv = await client.query('SELECT total_deposited FROM investments WHERE id = $1', [investment_id]);
      await client.query('COMMIT'); inTransaction = false;
      return res.status(200).json({ total_deposited: parseFloat(inv.rows[0].total_deposited) });
    }

    return res.status(405).send('Method Not Allowed');
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Portfolio operation failed' });
  } finally {
    if (inTransaction) { try { await client.query('ROLLBACK'); } catch { /* Connection may already be closed. */ } }
    await closeClient(client);
  }
}
