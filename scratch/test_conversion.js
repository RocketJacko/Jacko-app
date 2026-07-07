async function test() {
  const baseUsd = 8.00;
  console.log(`Base Price: $${baseUsd.toFixed(2)} USD`);

  try {
    const res = await fetch('https://v6.exchangerate-api.com/v6/21378afd98e8b0ad85068412/latest/USD');
    if (!res.ok) throw new Error('API response was not ok');
    const data = await res.json();
    
    if (data.result === 'success' && data.conversion_rates) {
      const rates = data.conversion_rates;
      const targetCurrencies = ['ARS', 'COP', 'MXN', 'CLP'];
      
      console.log('\n--- Live Conversion Rates ---');
      targetCurrencies.forEach(curr => {
        const rate = rates[curr];
        if (rate) {
          const converted = baseUsd * rate;
          const formatted = converted.toLocaleString(curr === 'COP' ? 'es-CO' : 'en-US', {
            minimumFractionDigits: curr === 'COP' || curr === 'CLP' ? 0 : 2,
            maximumFractionDigits: curr === 'COP' || curr === 'CLP' ? 0 : 2,
          });
          console.log(`${curr}: 1 USD = ${rate.toFixed(4)} ${curr} | $8.00 USD = $${formatted} ${curr}`);
        } else {
          console.log(`${curr}: Rate not found`);
        }
      });
    } else {
      console.error('API Error:', data);
    }
  } catch (err) {
    console.error('Fetch Error:', err);
  }
}

test();
