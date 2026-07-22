# Portfolio Tracker - App Development Guide

## 1. Project Objective
The goal of this project is to build a web application that takes raw Excel exports from an Israeli bank and accurately reconstructs the user's investment portfolio. 
The app must calculate the true cost basis, realized profit/loss (PnL), current holdings, and exact cash balances (ILS and USD) by replaying historical transactions and mapping them to live market data.

## 2. Input Data Sources
The application relies on three main Excel files exported from the bank:
*   **`data.xlsx` & `data (1).xlsx`**: Historical transaction ledgers. These files contain a chronological list of every action performed in the account: buys, sells, dividends, taxes, and currency conversions.
*   **`data (3).xlsx`**: A snapshot of the user's *current* portfolio holdings. This file is critical for acting as a "fallback" truth-source for current prices, especially for local Israeli mutual funds which are difficult to fetch via standard APIs like Yahoo Finance.

## 3. Data Schema & Key Columns (Hebrew to English Mapping)
When parsing the historical data, pay close attention to these columns:
*   `תאריך` (Date): The execution date of the transaction.
*   `סוג פעולה` (Action Type): E.g., `קניה חול מטח` (Buy Foreign USD), `מכירה חול מטח` (Sell Foreign USD), `הפקדה דיבידנד מטח` (Dividend Deposit), `קניה שח` (Buy ILS), `משיכת מס חול מטח` / `מס ששולם` (Tax payments).
*   `שם נייר` (Asset Name) & `סימבול` (Symbol): Used to identify the asset. Note: `99028` is often used as a generic ID for cash/currency actions.
*   `כמות` (Quantity): Amount of shares.
*   `שער ביצוע` (Execution Price): Price per share in the original currency.
*   `מטבע` (Currency): `$` for USD, `₪` or `אג` for ILS/Agorot.
*   `תמורה במט"ח` (Proceeds in FX): The net USD impact on the account.
*   `תמורה בשקלים` (Proceeds in ILS): The net ILS impact on the account.

## 4. Critical Business Logic & Edge Cases

### A. Commissions are Embedded
Do **not** calculate commissions manually by adding flat fees. The bank embeds the commission (e.g., $8 per trade) directly into the `תמורה במט"ח` (Proceeds in FX) column. 
*   **Cost Basis Calculation**: `Cost_in_ILS = abs(Proceeds_in_FX) * Historical_FX_Rate_on_Date`. This accurately captures the true cost including all fees.

### B. Historical Exchange Rates (BOI)
All historical USD transactions must be converted to ILS (Israeli New Shekel) using the exact Bank of Israel (BOI) exchange rate for the specific day the transaction occurred. A time-series fetcher for BOI rates is mandatory.

### C. Filtering Tax "Assets"
Tax deductions appear as standard rows and must NOT be added to the user's holdings.
*   Filter out any row where the asset name contains: `"מס לשלם"`, `"זיכוי מס"`, or `"מס ששולם"`.
*   These rows still affect the cash balances, but they are not tangible equity assets.

### D. The "Agorot" (Cents) Problem
Israeli stocks and mutual funds are often quoted in Agorot (1/100 of an ILS) instead of ILS.
*   **Rule**: If the currency is ILS/Agorot and the price is unusually large (e.g., `> 2000`), divide the price by 100 to get the correct ILS value.

### E. Stock Splits & Bonuses ("הטבה")
Sometimes the bank issues bonus shares (stock splits) under the action `"הטבה"` with an execution price of `0.00`. 
*   Do not use `0.00` to calculate the current holding value.
*   If a live API (like Yahoo Finance) fails to fetch the live price, fall back to parsing `data (3).xlsx` and match the symbol/name to extract the actual current market price (`שער`).

### F. Cash Balances
You must track two separate cash balances:
1.  **ILS Cash (`מזומן בשקלים`)**: Tracked by summing the `תמורה בשקלים` column.
2.  **USD Cash (`מזומן במט"ח`)**: Tracked by summing the `תמורה במט"ח` column. To display the total portfolio value in ILS, multiply the USD Cash pool by the *current, live* USD/ILS exchange rate.

## 5. Expected Output
The final application should display a dashboard with:
*   A table of all active holdings with: Name, Total Quantity, Average Cost (ILS), Live Price (ILS), Current Value (ILS).
*   Realized PnL from closed positions.
*   Cash balances (ILS and USD).
*   **Total Portfolio Value (ILS)**: Sum of all active equity + ILS Cash + (USD Cash * Live FX Rate).
