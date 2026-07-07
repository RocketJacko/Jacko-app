async function test() {
  const ip = '152.203.120.208'; // Colombian IP
  const url = `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,currency`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log('ip-api response:', data);
  } catch (err) {
    console.error('Error:', err);
  }
}
test();
