const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;

async function aggregate() {
  const c = new Client({ connectionString });
  try {
    await c.connect();
    
    // Find tickers with more than 1 active row per investment_id
    const dupesRes = await c.query(`
      SELECT investment_id, symbol, COUNT(*) as cnt 
      FROM portfolio_stocks 
      WHERE status='active' AND symbol NOT LIKE 'CASH_%'
      GROUP BY investment_id, symbol 
      HAVING COUNT(*) > 1
    `);
    
    for (const row of dupesRes.rows) {
      const { investment_id, symbol } = row;
      console.log(`Aggregating ${symbol} for investment ${investment_id}`);
      
      const rowsRes = await c.query(`
        SELECT id, shares, purchase_price_fc, purchase_exchange_rate, purchase_price_ils, purchase_date, currency 
        FROM portfolio_stocks 
        WHERE status='active' AND investment_id = $1 AND symbol = $2
        ORDER BY created_at ASC
      `, [investment_id, symbol]);
      
      let totalShares = 0;
      let totalFcCost = 0;
      let totalIlsCost = 0;
      let primaryId = rowsRes.rows[0].id;
      let latestDate = rowsRes.rows[0].purchase_date;
      const currency = rowsRes.rows[0].currency;
      
      for (const r of rowsRes.rows) {
        const shares = parseFloat(r.shares);
        totalShares += shares;
        totalFcCost += parseFloat(r.purchase_price_fc) * shares;
        totalIlsCost += parseFloat(r.purchase_price_ils);
        // keep latest date if available
        if (new Date(r.purchase_date) > new Date(latestDate)) {
            latestDate = r.purchase_date;
        }
      }
      
      const avgPriceFc = totalFcCost / totalShares;
      const effectiveRate = totalIlsCost / (avgPriceFc * totalShares);
      
      console.log(`New aggregated ${symbol}: Shares=${totalShares}, AvgPriceFC=${avgPriceFc}, TotalILS=${totalIlsCost}`);
      
      // Update primary row
      await c.query(`
        UPDATE portfolio_stocks 
        SET shares = $1, purchase_price_fc = $2, purchase_exchange_rate = $3, purchase_price_ils = $4, purchase_date = $5
        WHERE id = $6
      `, [totalShares, avgPriceFc, effectiveRate, totalIlsCost, latestDate, primaryId]);
      
      // Delete other rows
      const idsToDelete = rowsRes.rows.slice(1).map(r => r.id);
      for (const id of idsToDelete) {
        await c.query(`DELETE FROM portfolio_stocks WHERE id = $1`, [id]);
      }
    }
    console.log("Aggregation complete.");
  } catch(e) {
    console.error(e);
  } finally {
    await c.end();
  }
}

aggregate();
