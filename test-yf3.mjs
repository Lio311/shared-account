import yahooFinancePkg from 'yahoo-finance2';
const yahooFinance = yahooFinancePkg.default || yahooFinancePkg;
try {
    const q1 = await yahooFinance.quote('1183441.TA');
    console.log("1183441.TA:", q1.regularMarketPrice);
} catch(e) { console.error(e) }
try {
    const q2 = await yahooFinance.quote('1183441');
    console.log("1183441:", q2.regularMarketPrice);
} catch(e) { console.error(e) }
try {
    const q3 = await yahooFinance.quote('AAPL');
    console.log("AAPL:", q3.regularMarketPrice);
} catch(e) { console.error(e) }
