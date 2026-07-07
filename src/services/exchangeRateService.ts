interface ExchangeRateResponse {
  result: string;
  base_code: string;
  conversion_rates: Record<string, number>;
  time_last_update_unix: number;
}

const CACHE_KEY = 'jacko_exchange_rates_v1';
const CACHE_TIME_KEY = 'jacko_exchange_rates_time_v1';
const CACHE_TTL = 3600000; // 1 hour in milliseconds

const DEFAULT_RATES: Record<string, number> = {
  USD: 1,
  COP: 3700,
  MXN: 17.5,
  EUR: 0.9,
};

export class ExchangeRateService {
  private static rates: Record<string, number> | null = null;

  static async fetchRates(): Promise<Record<string, number>> {
    if (this.rates) {
      return this.rates;
    }

    // Try reading from localStorage cache
    try {
      const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
      const cachedData = localStorage.getItem(CACHE_KEY);
      
      if (cachedTime && cachedData) {
        const parsedTime = Number(cachedTime);
        if (Date.now() - parsedTime < CACHE_TTL) {
          this.rates = JSON.parse(cachedData);
          return this.rates!;
        }
      }
    } catch (e) {
      console.warn('Failed to parse cached exchange rates:', e);
    }

    // Fetch from public exchange rates API
    try {
      const res = await fetch('https://v6.exchangerate-api.com/v6/21378afd98e8b0ad85068412/latest/USD');
      if (!res.ok) throw new Error('API response was not ok');
      const data: ExchangeRateResponse = await res.json();
      
      if (data.result === 'success' && data.conversion_rates) {
        this.rates = data.conversion_rates;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(this.rates));
          localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
        } catch (e) {
          console.warn('Failed to cache exchange rates in localStorage:', e);
        }
        return this.rates;
      }
    } catch (err) {
      console.error('Error fetching live exchange rates, using fallback:', err);
    }

    // Fallback to cache (even if expired) or default rates
    try {
      const cachedData = localStorage.getItem(CACHE_KEY);
      if (cachedData) {
        this.rates = JSON.parse(cachedData);
        return this.rates!;
      }
    } catch (err) {
      console.warn('Fallback to cache failed:', err);
    }

    this.rates = DEFAULT_RATES;
    return DEFAULT_RATES;
  }

  static async getRate(currency: string = 'COP'): Promise<number> {
    const rates = await this.fetchRates();
    return rates[currency] || DEFAULT_RATES[currency] || 3700;
  }

  static convertToLocal(usdAmount: number, rate: number): number {
    return usdAmount * rate;
  }
}
