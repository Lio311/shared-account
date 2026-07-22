import YahooFinance from 'yahoo-finance2';

async function test() {
   const yf = new YahooFinance();
   try {
      console.log(await yf.quote('1183441.TA'));
   } catch (e) {
      console.error(e);
   }
}
test();
