import { useState, useEffect } from 'react';
import { ExchangeRateService } from '../services/exchangeRateService';

const EXCHANGE_RATE_FALLBACK = Number(import.meta.env.VITE_EXCHANGE_RATE_COP) || 3700;

export interface GeoLocationState {
  userCurrency: string;
  exchangeRate: number;
  isColombia: boolean;
  isLoading: boolean;
  localCurrency: string;
  detectedIsColombia: boolean;
  detectedCountryCode: string;
  detectedCity: string;
  setIsColombia: React.Dispatch<React.SetStateAction<boolean>>;
  setUserCurrency: React.Dispatch<React.SetStateAction<string>>;
}

export function useGeoLocation(): GeoLocationState {
  const [userCurrency, setUserCurrency] = useState<string>('COP');
  const [exchangeRate, setExchangeRate] = useState<number>(EXCHANGE_RATE_FALLBACK);
  const [isColombia, setIsColombia] = useState<boolean>(true);
  const [localCurrency, setLocalCurrency] = useState<string>('COP');
  const [detectedIsColombia, setDetectedIsColombia] = useState<boolean>(true);
  const [detectedCountryCode, setDetectedCountryCode] = useState<string>('CO');
  const [detectedCity, setDetectedCity] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;

    const detectCountry = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const countryParam = params.get('country');
        if (countryParam) {
          const countryCodeUpper = countryParam.toUpperCase();
          if (active) {
            const isCo = countryCodeUpper === 'CO';
            const currency = isCo ? 'COP' : 'USD';
            setIsColombia(isCo);
            setDetectedIsColombia(isCo);
            setDetectedCountryCode(countryCodeUpper);
            setUserCurrency(currency);
            setLocalCurrency(currency);
            setIsLoading(false);
          }
          return;
        }
      } catch (e) {
        console.warn('Error reading URL params:', e);
      }

      // 1. Try ip-api.com using client's IP address
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        if (ipRes.ok) {
          const { ip } = await ipRes.json();
          const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,currency,city`);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData && geoData.status === 'success' && active) {
              const detected = geoData.currency || 'COP';
              const isCo = geoData.countryCode === 'CO';
              setUserCurrency(detected);
              setLocalCurrency(detected);
              setIsColombia(isCo);
              setDetectedIsColombia(isCo);
              setDetectedCountryCode(geoData.countryCode || 'CO');
              setDetectedCity(geoData.city || '');
              setIsLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Error detecting country with ip-api.com, trying fallback:', err);
      }

      // 2. Fallback to HTTPS-friendly ipapi.co
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
          const data = await res.json();
          if (data && active) {
            const detected = data.currency || 'COP';
            const isCo = data.country_code === 'CO';
            setUserCurrency(detected);
            setLocalCurrency(detected);
            setIsColombia(isCo);
            setDetectedIsColombia(isCo);
            setDetectedCountryCode(data.country_code || 'CO');
            setDetectedCity(data.city || '');
            setIsLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to fetch country from ipapi.co fallback:', e);
      }

      if (active) {
        setIsLoading(false);
      }
    };

    detectCountry();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    ExchangeRateService.getRate(userCurrency)
      .then((rate) => {
        if (active) {
          setExchangeRate(rate);
        }
      })
      .catch((err) => {
        console.error(`Error fetching exchange rate for ${userCurrency}:`, err);
      });
    return () => {
      active = false;
    };
  }, [userCurrency]);

  return {
    userCurrency,
    exchangeRate,
    isColombia,
    isLoading,
    localCurrency,
    detectedIsColombia,
    detectedCountryCode,
    detectedCity,
    setIsColombia,
    setUserCurrency,
  };
}
