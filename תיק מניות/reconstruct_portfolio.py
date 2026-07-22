import pandas as pd
import yfinance as yf
import requests
import io
import os
from datetime import datetime, timedelta
import warnings

warnings.simplefilter(action='ignore', category=FutureWarning)

try:
    df_data3 = pd.read_excel('data (3).xlsx')
    data3_prices = {}
    for idx, row in df_data3.iterrows():
        name = str(row.get('שם נייר', '')).strip()
        sym = str(row.get('סימבול', '')).strip()
        price = row.get('שער', 0.0)
        if pd.notna(price):
            if name:
                data3_prices[name] = price
            if sym and sym != 'nan':
                data3_prices[sym] = price
except Exception:
    data3_prices = {}

def fetch_boi_rates(start_date, end_date):
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    url = f"https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI/EXR/1.0/R0101GVS.V.V.V.USD?startPeriod={start_str}&endPeriod={end_str}"
    headers = {"Accept": "text/csv"}
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            df = pd.read_csv(io.StringIO(response.text))
            df['TIME_PERIOD'] = pd.to_datetime(df['TIME_PERIOD']).dt.date
            rates = dict(zip(df['TIME_PERIOD'], df['OBS_VALUE']))
            return rates
    except Exception as e:
        print(f"Error fetching BOI rates: {e}")
    return {}

def fetch_live_price(symbol, currency):
    try:
        if pd.isna(symbol):
            return None, None
        sym_str = str(symbol).strip()
        if 'US' in sym_str:
            ticker = sym_str.replace('US', '').strip()
            tkr = yf.Ticker(ticker)
            return tkr.fast_info.last_price, '$'
        elif sym_str.isdigit():
            ticker = f"{sym_str}.TA"
            tkr = yf.Ticker(ticker)
            return tkr.fast_info.last_price, 'ILA'
        return None, None
    except Exception:
        return None, None

def main():
    folder = r"c:\Users\Lior\Desktop\תיק מניות"
    files = [os.path.join(folder, f) for f in ["data.xlsx", "data (1).xlsx", "data (2).xlsx"]]
    
    dfs = [pd.read_excel(f) for f in files if os.path.exists(f)]
    if not dfs:
        print("No historical data files found.")
        return
        
    df = pd.concat(dfs, ignore_index=True)
    df['תאריך_dt'] = pd.to_datetime(df['תאריך'], format='%d/%m/%Y', errors='coerce')
    df = df.dropna(subset=['תאריך_dt']).sort_values(by='תאריך_dt')
    
    min_date = df['תאריך_dt'].min()
    max_date = df['תאריך_dt'].max()
    print(f"Fetching BOI rates from {min_date.date()} to {max_date.date()}...")
    boi_rates = fetch_boi_rates(min_date - timedelta(days=14), max_date + timedelta(days=1))
    
    all_dates = pd.date_range(start=min_date - timedelta(days=14), end=max_date + timedelta(days=1)).date
    filled_rates = {}
    last_rate = 3.75
    for d in all_dates:
        if d in boi_rates:
            last_rate = boi_rates[d]
        filled_rates[d] = last_rate
        
    holdings = {}
    usd_cash = 0.0
    ils_cash = 0.0
    last_ils_date = None
    
    buy_actions = ['קניה שח', 'קניה חול מטח', 'קניה רצף', 'הטבה']
    sell_actions = ['מכירה שח', 'מכירה חול מטח', 'מכירה רצף', 'פדיון']
    
    for _, row in df.iterrows():
        d = row['תאריך_dt'].date()
        action = str(row['סוג פעולה']).strip()
        sym = row["מס' נייר / סימבול"]
        name = str(row["שם נייר"]).strip()
        qty = row["כמות"]
        price = row["שער ביצוע"]
        curr = str(row["מטבע"]).strip()
        usd_flow = row['תמורה במט"ח']
        ils_flow = row['תמורה בשקלים']
        ils_bal = row['יתרה שקלית']
        
        if "מס לשלם" in name or "זיכוי מס" in name or "מס ששולם" in name:
            continue
            
        if pd.notna(ils_bal):
            if last_ils_date is None or d >= last_ils_date:
                ils_cash = float(ils_bal)
                last_ils_date = d
                
        if pd.notna(usd_flow):
            usd_cash += float(usd_flow)
            
        if "USD/ILS" in name or "דולר ארה" in name:
            if action in buy_actions and pd.notna(qty):
                usd_cash += float(qty)
            elif action in sell_actions and pd.notna(qty):
                usd_cash -= float(qty)
            continue
            
        if pd.isna(sym) or pd.isna(qty) or qty == 0:
            continue
            
        if sym not in holdings:
            holdings[sym] = {
                'Name': name,
                'Quantity': 0.0,
                'Currency': curr,
                'Total Cost ILS': 0.0,
                'Realized PnL ILS': 0.0,
                'Last Execution Price': 0.0,
                'Last Non-Zero Price': 0.0
            }
            
        ex_rate = filled_rates.get(d, 3.75)
            
        if action in buy_actions:
            holdings[sym]['Quantity'] += float(qty)
            holdings[sym]['Last Execution Price'] = price
            if price > 0:
                holdings[sym]['Last Non-Zero Price'] = price
            
            if curr == '$' and pd.notna(usd_flow) and usd_flow != 0:
                cost_ils = abs(float(usd_flow)) * ex_rate
            elif pd.notna(ils_flow) and ils_flow != 0 and abs(ils_flow) > 1:
                cost_ils = abs(float(ils_flow))
            else:
                if curr == '$':
                    cost_ils = float(qty) * float(price) * ex_rate
                else:
                    cost_ils = float(qty) * float(price)
                    if curr == 'אג' or price > 1000:
                        cost_ils = cost_ils / 100.0
                        
            holdings[sym]['Total Cost ILS'] += cost_ils
            
        elif action in sell_actions:
            old_qty = holdings[sym]['Quantity']
            sell_qty = float(qty)
            
            if curr == '$' and pd.notna(usd_flow) and usd_flow != 0:
                revenue_ils = abs(float(usd_flow)) * ex_rate
            elif pd.notna(ils_flow) and ils_flow != 0 and abs(ils_flow) > 1:
                revenue_ils = abs(float(ils_flow))
            else:
                if curr == '$':
                    revenue_ils = float(qty) * float(price) * ex_rate
                else:
                    revenue_ils = float(qty) * float(price)
                    if curr == 'אג' or price > 1000:
                        revenue_ils = revenue_ils / 100.0
            
            if old_qty > 0:
                avg_cost_per_share = holdings[sym]['Total Cost ILS'] / old_qty
                cost_of_sold_shares = avg_cost_per_share * sell_qty
                realized_pnl = revenue_ils - cost_of_sold_shares
                
                holdings[sym]['Realized PnL ILS'] += realized_pnl
                holdings[sym]['Total Cost ILS'] -= cost_of_sold_shares
                
            holdings[sym]['Quantity'] -= sell_qty
            
            if holdings[sym]['Quantity'] < 0.0001:
                holdings[sym]['Quantity'] = 0.0
                holdings[sym]['Total Cost ILS'] = 0.0
                
    try:
        current_usd_ils = yf.Ticker("ILS=X").fast_info.last_price
    except:
        current_usd_ils = filled_rates.get(list(filled_rates.keys())[-1], 3.75)
        
    print("Fetching live prices for stocks...")
    results = []
    total_unrealized_portfolio = 0.0
    total_curr_portfolio = 0.0
    
    for sym, data in holdings.items():
        qty = data['Quantity']
        hist_cost_ils = data['Total Cost ILS']
        realized_pnl = data['Realized PnL ILS']
        name = data.get('Name', str(sym))
        
        status = "פעיל" if qty > 0 else "נמכר לחלוטין"
        
        avg_cost_ils = hist_cost_ils / qty if qty > 0 else 0
        base_curr = data['Currency']
        
        live_price, live_curr = fetch_live_price(sym, base_curr)
        used_price = live_price
        if used_price is None:
            # Fallback to data3_prices
            if sym in data3_prices:
                used_price = data3_prices[sym]
            elif name in data3_prices:
                used_price = data3_prices[name]
            else:
                # Try more robust matching for Hebrew names with English parts
                name_clean = str(name).replace(' ', '').replace('.', '')
                for k, v in data3_prices.items():
                    k_clean = str(k).replace(' ', '').replace('.', '')
                    if k_clean and len(k_clean) > 4: # avoid matching tiny strings
                        if k_clean in name_clean or name_clean in k_clean:
                            used_price = v
                            break
                        # Check reversed words for Hebrew/English mix
                        if "S&P500" in name_clean and "אינ" in name_clean and "S&P500" in k_clean and "אינ" in k_clean:
                            used_price = v
                            break
                        if "SPX" in name_clean and "אשס" in name_clean and "SPX" in k_clean and "אשס" in k_clean:
                            used_price = v
                            break
                        if "SP500" in name_clean and "איישרס" in name_clean and "SP500" in k_clean and "איישרס" in k_clean:
                            used_price = v
                            break
                            
        if used_price is None:
            used_price = data['Last Execution Price']
            if used_price == 0:
                used_price = data['Last Non-Zero Price']
        
        curr_val_ils = 0.0
        if qty > 0:
            if (live_curr == '$') or (live_curr is None and base_curr == '$'):
                curr_val_ils = qty * used_price * current_usd_ils
            elif live_curr == 'ILA':
                curr_val_ils = qty * (used_price / 100.0)
                if used_price < 200 and data['Last Execution Price'] < 200:
                    curr_val_ils = qty * used_price
            elif base_curr == '₪' or base_curr == 'אג':
                if used_price > 2000 or base_curr == 'אג':
                    used_price = used_price / 100.0
                curr_val_ils = qty * used_price
                if "פח\"ק" in data['Name'] or "מגן מס" in data['Name']:
                    if used_price == 0: curr_val_ils = qty
            else:
                curr_val_ils = qty * used_price
                
        unrealized_pnl = curr_val_ils - hist_cost_ils if qty > 0 else 0
        
        results.append({
            "מס' נייר / סימבול": sym,
            "שם נייר": data['Name'],
            "סטטוס": status,
            "כמות נוכחית": round(qty, 4),
            "שער נוכחי (מקור)": round(used_price, 4) if qty > 0 else None,
            "עלות היסטורית כוללת (שקלים)": round(hist_cost_ils, 2) if qty > 0 else 0,
            "עלות ממוצעת למניה (שקלים)": round(avg_cost_ils, 2) if qty > 0 else None,
            "שווי נוכחי כולל (שקלים)": round(curr_val_ils, 2) if qty > 0 else 0,
            "רווח/הפסד לא ממומש (שקלים)": round(unrealized_pnl, 2) if qty > 0 else 0,
            "רווח/הפסד ממומש ממימושים (שקלים)": round(realized_pnl, 2)
        })
        
        total_unrealized_portfolio += hist_cost_ils
        total_curr_portfolio += curr_val_ils
        
    results.append({
        "מס' נייר / סימבול": "CASH_ILS",
        "שם נייר": "מזומן בשקלים (עו\"ש)",
        "סטטוס": "פעיל",
        "כמות נוכחית": round(ils_cash, 2),
        "שער נוכחי (מקור)": 1.0,
        "עלות היסטורית כוללת (שקלים)": round(ils_cash, 2),
        "עלות ממוצעת למניה (שקלים)": 1.0,
        "שווי נוכחי כולל (שקלים)": round(ils_cash, 2),
        "רווח/הפסד לא ממומש (שקלים)": 0.0,
        "רווח/הפסד ממומש ממימושים (שקלים)": 0.0
    })
    total_unrealized_portfolio += ils_cash
    total_curr_portfolio += ils_cash
    
    usd_curr_val_ils = usd_cash * current_usd_ils
    results.append({
        "מס' נייר / סימבול": "CASH_USD",
        "שם נייר": "מזומן במט\"ח (מחושב)",
        "סטטוס": "פעיל",
        "כמות נוכחית": round(usd_cash, 2),
        "שער נוכחי (מקור)": round(current_usd_ils, 4),
        "עלות היסטורית כוללת (שקלים)": round(usd_curr_val_ils, 2), 
        "עלות ממוצעת למניה (שקלים)": None,
        "שווי נוכחי כולל (שקלים)": round(usd_curr_val_ils, 2),
        "רווח/הפסד לא ממומש (שקלים)": 0.0,
        "רווח/הפסד ממומש ממימושים (שקלים)": 0.0
    })
    total_unrealized_portfolio += usd_curr_val_ils
    total_curr_portfolio += usd_curr_val_ils
    
    df_out = pd.DataFrame(results)
    
    total_unrealized_pnl = df_out['רווח/הפסד לא ממומש (שקלים)'].sum()
    total_realized_pnl = df_out['רווח/הפסד ממומש ממימושים (שקלים)'].sum()
    
    total_row = pd.DataFrame([{
        "מס' נייר / סימבול": "TOTAL",
        "שם נייר": "סה\"כ שווי תיק",
        "סטטוס": "",
        "כמות נוכחית": None,
        "שער נוכחי (מקור)": None,
        "עלות היסטורית כוללת (שקלים)": round(total_unrealized_portfolio, 2),
        "עלות ממוצעת למניה (שקלים)": None,
        "שווי נוכחי כולל (שקלים)": round(total_curr_portfolio, 2),
        "רווח/הפסד לא ממומש (שקלים)": round(total_unrealized_pnl, 2),
        "רווח/הפסד ממומש ממימושים (שקלים)": round(total_realized_pnl, 2)
    }])
    df_out = pd.concat([df_out, total_row], ignore_index=True)
    
    output_path = os.path.join(folder, "historical_ledger.xlsx")
    df_out.to_excel(output_path, index=False)
    print(f"Total Portfolio Value: {total_curr_portfolio:.2f} ILS")
    print("Exported successfully to historical_ledger.xlsx")

if __name__ == "__main__":
    main()
