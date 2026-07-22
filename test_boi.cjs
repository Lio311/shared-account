async function testBOI() {
  const url = 'https://boi.org.il/PublicApi/GetExchangeRates?date=2024-05-15';
  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log(JSON.stringify(data.exchangeRates.slice(0, 3), null, 2));
  } catch (err) {
    console.error(err);
  }
}
testBOI();
