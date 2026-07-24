import React from 'react';
import type { Product } from '../../../services/catalogService';

export interface PricingSharedProps {
  planType: "free" | "mensual" | "anual";
  setPlanType: (type: "free" | "mensual" | "anual") => void;
  quantity: number;
  handleSliderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  discountPct: number;
  finalPriceLocal: number;
  discountAmountLocal: number;
  userCurrency: string;
  exchangeRate: number;
  handleProceed: (e: React.MouseEvent) => void;
  pricingRef: React.RefObject<HTMLDivElement | null>;
  activeProduct?: Product | null;
}
