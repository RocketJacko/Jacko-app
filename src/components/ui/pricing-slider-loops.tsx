import React, { useState, useEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import { useGeoLocation } from "../../hooks/useGeoLocation";
import { catalogService } from "../../services/catalogService";
import { motion } from "motion/react";
import type { PricingSharedProps } from "./pricing/PricingSharedProps";
import { PricingDesktopView } from "./pricing/PricingDesktopView";
import { PricingMobileView } from "./pricing/PricingMobileView";
import "./pricing-slider-loops.css";

interface LoopsPricingSliderProps {
  onSelectFree: () => void;
}

const getDiscountPercentage = (qty: number): number => {
  if (qty >= 5) return 20; // 20% de descuento para 5+ cuentas
  if (qty >= 3) return 10; // 10% de descuento para 3 o 4 cuentas
  return 0;
};

export const PricingSwitch = ({
  selected,
  onSwitch,
  className,
}: {
  selected: "free" | "mensual" | "anual";
  onSwitch: (value: "free" | "mensual" | "anual") => void;
  className?: string;
}) => {
  return (
    <div className={cn("flex justify-center", className)}>
      <div className="pricing-switch-container">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSwitch("free");
          }}
          className={cn(
            "pricing-switch-btn",
            selected === "free" ? "text-white" : "switch-inactive"
          )}
        >
          {selected === "free" && (
            <motion.span
              layoutId="pricing-switch-bg"
              className="pricing-switch-active-bg"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative">Gratis</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSwitch("mensual");
          }}
          className={cn(
            "pricing-switch-btn",
            selected === "mensual" ? "text-white" : "switch-inactive"
          )}
        >
          {selected === "mensual" && (
            <motion.span
              layoutId="pricing-switch-bg"
              className="pricing-switch-active-bg"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative">Mensual</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSwitch("anual");
          }}
          className={cn(
            "pricing-switch-btn",
            selected === "anual" ? "text-white" : "switch-inactive"
          )}
        >
          {selected === "anual" && (
            <motion.span
              layoutId="pricing-switch-bg"
              className="pricing-switch-active-bg"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative flex items-center gap-1">
            Anual
            <span className="save-tag">-58%</span>
          </span>
        </button>
      </div>
    </div>
  );
};

export const LoopsPricingSlider: React.FC<LoopsPricingSliderProps> = ({ onSelectFree }) => {
  const pricingRef = useRef<HTMLDivElement>(null);
  const { userCurrency, exchangeRate } = useGeoLocation();
  const [planType, setPlanType] = useState<"free" | "mensual" | "anual">("mensual");
  const [quantity, setQuantity] = useState(1);
  const [basePrices, setBasePrices] = useState({ mensual: 8, anual: 40 });
  const [isMobileMode, setIsMobileMode] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileMode(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [activeSlug, setActiveSlug] = useState<string>("plan-anual");

  useEffect(() => {
    let active = true;
    catalogService.getCatalogData(false, false)
      .then((data) => {
        if (!active) return;
        const activeProducts = data.products.filter(p => p.is_active !== false);
        const activeProd = activeProducts[0];
        const mensualProduct = activeProducts.find((p) => p.slug === "plan-mensual");
        const anualProduct = activeProducts.find((p) => p.slug === "plan-anual");

        if (activeProd) {
          setActiveSlug(activeProd.slug);
        }

        setBasePrices({
          mensual: mensualProduct?.price_cop ?? (activeProd?.price_cop ?? 8),
          anual: anualProduct?.price_cop ?? (activeProd?.price_cop ?? 30)
        });
      })
      .catch((err) => {
        console.error("[LoopsPricingSlider] Error loading product prices from DB:", err);
      });

    return () => {
      active = false;
    };
  }, []);

  const basePriceUsd = planType === "anual" ? basePrices.anual : planType === "mensual" ? basePrices.mensual : 0;
  const basePriceLocal = basePriceUsd * exchangeRate;

  const discountPct = getDiscountPercentage(quantity);
  const rawPriceLocal = basePriceLocal * quantity;
  const discountAmountLocal = (rawPriceLocal * discountPct) / 100;
  const finalPriceLocal = rawPriceLocal - discountAmountLocal;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuantity(Number(e.target.value));
  };

  const handleProceed = (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      localStorage.removeItem("jacko_register_pending");
    } catch (err) {
      console.error(err);
    }
    if (planType === "free") {
      localStorage.removeItem("jacko_trigger_checkout_slug");
      localStorage.removeItem("jacko_trigger_checkout_qty");
    } else {
      const slug = (planType === "anual" ? "plan-anual" : "plan-mensual");
      const targetSlug = activeSlug || slug;
      localStorage.setItem("jacko_trigger_checkout_slug", targetSlug);
      localStorage.setItem("jacko_trigger_checkout_qty", quantity.toString());
    }
    onSelectFree();
  };

  // Objeto de Props Unificado para evitar inconsistencias
  const pricingViewProps: PricingSharedProps = {
    planType,
    setPlanType,
    quantity,
    handleSliderChange,
    discountPct,
    finalPriceLocal,
    discountAmountLocal,
    userCurrency,
    exchangeRate,
    handleProceed,
    pricingRef,
  };

  return (
    <div className="pricing-slider-section" ref={pricingRef}>
      {isMobileMode ? (
        <PricingMobileView {...pricingViewProps} />
      ) : (
        <PricingDesktopView {...pricingViewProps} />
      )}
    </div>
  );
};
