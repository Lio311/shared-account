import yahooFinancePkg from 'yahoo-finance2';
import { YahooFinance } from 'yahoo-finance2';

const yahooFinance = new YahooFinance();
try {
   console.log(await yahooFinance.quote('AAPL'));
} catch (e) {
   console.error(e);
}
