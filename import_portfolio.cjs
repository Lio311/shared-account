const { Client } = require('pg');
const xlsx = require('xlsx');

const connectionString = process.env.DATABASE_URL;

async function main() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        
        // Find Lior the son's investment ID for 'חשבון מסחר'
        const resInv = await client.query("SELECT id FROM investments WHERE owner_name = 'ליאור הבן' AND type = 'חשבון מסחר' LIMIT 1");
        if (resInv.rows.length === 0) {
            console.error("Could not find the investment ID.");
            return;
        }
        const investmentId = resInv.rows[0].id;
        console.log(`Found investment ID: ${investmentId}`);

        // Delete existing records to avoid duplicates if run multiple times
        await client.query("DELETE FROM portfolio_stocks WHERE investment_id = $1", [investmentId]);
        console.log("Cleared existing portfolio stocks for this investment.");

        // Read the historical ledger
        const wb = xlsx.readFile('תיק מניות/historical_ledger.xlsx');
        const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

        for (const row of data) {
            const sym = row["מס' נייר / סימבול"];
            const name = row["שם נייר"];
            const qty = row["כמות נוכחית"] || 0;
            const histCostIls = row["עלות היסטורית כוללת (שקלים)"] || 0;
            const realizedPnl = row["רווח/הפסד ממומש ממימושים (שקלים)"] || 0;

            if (sym === 'TOTAL') continue;

            // 1. Insert active holding or cash
            if (qty > 0) {
                // If it's cash ILS, we just store it with currency ILS.
                let currency = 'USD';
                if (sym === 'CASH_ILS') currency = 'ILS';
                
                await client.query(`
                    INSERT INTO portfolio_stocks (
                        investment_id, symbol, name, shares, currency, purchase_date, 
                        purchase_price_fc, purchase_exchange_rate, purchase_price_ils, status
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
                `, [
                    investmentId, sym.toString(), name, qty, currency, '2000-01-01',
                    0, 1, histCostIls
                ]);
                console.log(`Inserted active holding: ${sym} (${qty})`);
            }

            // 2. Insert realized PnL as a sold record
            if (realizedPnl !== 0) {
                await client.query(`
                    INSERT INTO portfolio_stocks (
                        investment_id, symbol, name, shares, currency, purchase_date, 
                        purchase_price_fc, purchase_exchange_rate, purchase_price_ils, 
                        status, sale_date, sale_price_fc, sale_exchange_rate, sale_price_ils
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'sold', $10, $11, $12, $13)
                `, [
                    investmentId, `${sym}_SOLD`, `מימושים היסטוריים - ${name}`, 1, 'USD', '2000-01-01',
                    0, 1, 0,
                    '2000-01-01', 0, 1, realizedPnl
                ]);
                console.log(`Inserted realized PnL for: ${sym} (${realizedPnl} ILS)`);
            }
        }
        
        console.log("Import completed successfully!");
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

main();
