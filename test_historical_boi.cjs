async function testHistoricalBoi() {
  const url = 'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/?startperiod=2024-05-15&endperiod=2024-05-15&format=csv';
  try {
    const response = await fetch(url);
    const text = await response.text();
    console.log("Historical CSV:");
    console.log(text.substring(0, 500));
  } catch (err) {
    console.error(err);
  }
}
testHistoricalBoi();
