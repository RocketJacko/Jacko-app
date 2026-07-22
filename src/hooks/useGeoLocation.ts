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

      // 1. Try HTTPS-friendly ipapi.co directly (single request, secure)
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
      } catch (err) {
        console.warn('Error detecting country with ipapi.co:', err);
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
