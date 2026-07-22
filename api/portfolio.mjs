import { Client } from 'pg';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_7gt0IRDvYAJW@ep-hidden-smoke-apxqgfzb-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function getBoiRate(currency, dateStr) {
  if (currency === 'ILS') return 1;
  try {
    if (dateStr) {
      const url = `https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/?startperiod=${dateStr}&endperiod=${dateStr}&format=csv`;
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith(`RER_${currency}_ILS`)) {
            const cols = line.split(',');
            if (cols.length >= 14) {
              return parseFloat(cols[13]);
            }
          }
        }
      }
    }
    
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
  const client = new Client({ connectionString });

  try {
    await client.connect();

    if (req.method === 'GET') {
      const investmentId = req.query.investment_id;

      if (!investmentId) {
        return res.status(400).send('Missing investment_id');
      }

      const result = await client.query('SELECT * FROM portfolio_stocks WHERE investment_id = $1 ORDER BY status ASC, purchase_date DESC', [investmentId]);
      const stocks = result.rows;
      const invResult = await client.query('SELECT total_deposited FROM investments WHERE id = $1', [investmentId]);
      const totalDeposited = parseFloat(invResult.rows[0]?.total_deposited || 0);

      const enrichedStocks = [];
      let totalCurrentValueIls = 0;

      for (let stock of stocks) {
        let currentPriceFc = stock.purchase_price_fc;
        let currentExchangeRate = stock.purchase_exchange_rate;
        let dayChangePercent = 0;

        if (stock.status === 'active') {
          if (stock.symbol === 'CASH_ILS') {
            currentPriceFc = 1;
            currentExchangeRate = 1;
          } else if (stock.symbol === 'CASH_USD') {
            currentPriceFc = 1;
            currentExchangeRate = await getBoiRate('USD', null);
          } else {
            const isIsraeli = stock.symbol.match(/^\d{6,7}$/);
            if (isIsraeli) {
              currentExchangeRate = 1;
              try {
                const quote = await yahooFinance.quote(`${stock.symbol}.TA`);
                if (quote && quote.regularMarketPrice) {
                  currentPriceFc = quote.regularMarketPrice / 100;
                  dayChangePercent = quote.regularMarketChangePercent || 0;
                } else {
                  currentPriceFc = parseFloat(stock.purchase_price_fc);
                }
              } catch (e) {
                console.error(`Failed to fetch Yahoo Finance for ${stock.symbol}`, e.message || e);
                currentPriceFc = parseFloat(stock.purchase_price_fc);
              }
            } else {
              try {
                const quote = await yahooFinance.quote(stock.symbol);
                if (quote && quote.regularMarketPrice) {
                  currentPriceFc = quote.regularMarketPrice;
                  dayChangePercent = quote.regularMarketChangePercent || 0;
                }
              } catch (e) {
                console.error(`Failed to fetch Yahoo Finance for ${stock.symbol}`, e.message || e);
              }
              currentExchangeRate = await getBoiRate(stock.currency, null);
            }
          }
        } else if (stock.status === 'sold') {
          currentPriceFc = stock.sale_price_fc;
          currentExchangeRate = stock.sale_exchange_rate;
        }

        const currentValueIls = currentPriceFc * currentExchangeRate * stock.shares;

        if (stock.status === 'active') {
          totalCurrentValueIls += currentValueIls;
        }

        enrichedStocks.push({
          ...stock,
          current_price_fc: currentPriceFc,
          current_exchange_rate: currentExchangeRate,
          current_value_ils: currentValueIls,
          day_change_percent: dayChangePercent,
          unrealized_pl_fc: stock.status === 'active' ? ((currentPriceFc - parseFloat(stock.purchase_price_fc)) * stock.shares) : 0,
          unrealized_pl_percent: stock.status === 'active' && parseFloat(stock.purchase_price_fc) > 0 ? ((currentPriceFc - parseFloat(stock.purchase_price_fc)) / parseFloat(stock.purchase_price_fc) * 100) : 0,
          unrealized_pl_ils: stock.status === 'active' ? (currentValueIls - stock.purchase_price_ils) : 0,
          realized_pl_ils: stock.status === 'sold' ? (stock.sale_price_ils - stock.purchase_price_ils) : 0
        });
      }

      if (stocks.some(s => s.status === 'active') || stocks.length > 0) {
        await client.query('UPDATE investments SET current_value = $1, last_value_update = NOW() WHERE id = $2', [totalCurrentValueIls, investmentId]);
      }

      return res.status(200).json({
        stocks: enrichedStocks,
        portfolioValue: totalCurrentValueIls,
        totalDeposited: totalDeposited,
        overallPlIls: totalCurrentValueIls - totalDeposited
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { investment_id, symbol, shares, currency, purchase_date, purchase_price_fc } = body;

      const rate = await getBoiRate(currency, purchase_date);
      const purchase_price_ils = parseFloat(purchase_price_fc) * rate * parseFloat(shares);

      const result = await client.query(
        `INSERT INTO portfolio_stocks (investment_id, symbol, shares, currency, purchase_date, purchase_price_fc, purchase_exchange_rate, purchase_price_ils)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [investment_id, symbol.toUpperCase(), shares, currency.toUpperCase(), purchase_date, purchase_price_fc, rate, purchase_price_ils]
      );

      const cashSymbol = currency.toUpperCase() === 'ILS' ? 'CASH_ILS' : 'CASH_USD';
      const totalCostFc = parseFloat(shares) * parseFloat(purchase_price_fc);
      await client.query(
        `UPDATE portfolio_stocks SET shares = shares - $1 WHERE investment_id = $2 AND symbol = $3`,
        [totalCostFc, investment_id, cashSymbol]
      );

      return res.status(201).json(result.rows[0]);
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { id, sale_date, sale_price_fc } = body;
      
      const stockRes = await client.query('SELECT * FROM portfolio_stocks WHERE id = $1', [id]);
      if (stockRes.rows.length === 0) return res.status(404).send('Not found');
      const stock = stockRes.rows[0];

      const rate = await getBoiRate(stock.currency, sale_date);
      const sale_price_ils = parseFloat(sale_price_fc) * rate * parseFloat(stock.shares);

      const result = await client.query(
        `UPDATE portfolio_stocks 
         SET status = 'sold', sale_date = $1, sale_price_fc = $2, sale_exchange_rate = $3, sale_price_ils = $4
         WHERE id = $5 RETURNING *`,
        [sale_date, sale_price_fc, rate, sale_price_ils, id]
      );

      const cashSymbol = stock.currency.toUpperCase() === 'ILS' ? 'CASH_ILS' : 'CASH_USD';
      const totalGainFc = parseFloat(stock.shares) * parseFloat(sale_price_fc);
      await client.query(
        `UPDATE portfolio_stocks SET shares = shares + $1 WHERE investment_id = $2 AND symbol = $3`,
        [totalGainFc, stock.investment_id, cashSymbol]
      );

      return res.status(200).json(result.rows[0]);
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).send('Missing id');
      await client.query('DELETE FROM portfolio_stocks WHERE id = $1', [id]);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { investment_id, add_amount, set_amount } = body;
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
        await client.query(
          `UPDATE portfolio_stocks SET shares = shares + $1 WHERE investment_id = $2 AND symbol = 'CASH_ILS'`,
          [cashDelta, investment_id]
        );
      }

      const inv = await client.query('SELECT total_deposited FROM investments WHERE id = $1', [investment_id]);
      return res.status(200).json({ total_deposited: parseFloat(inv.rows[0].total_deposited) });
    }

    return res.status(405).send('Method Not Allowed');
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
