import React, { useState, useEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import { ArrowRight, Sparkles, CheckCircle2, ShieldCheck } from "lucide-react";
import { useGeoLocation } from "../../hooks/useGeoLocation";
import { catalogService } from "../../services/catalogService";
import { Card, CardContent, CardHeader } from "./card";
import { TimelineContent } from "./timeline-animation";
import { VerticalCutReveal } from "./vertical-cut-reveal";
import NumberFlow from "@number-flow/react";
import { motion } from "motion/react";
import "./pricing-slider-loops.css";

interface LoopsPricingSliderProps {
  onSelectFree: () => void;
}

const getDiscountPercentage = (qty: number): number => {
  if (qty >= 5) return 20; // 20% de descuento para 5+ cuentas
  if (qty >= 3) return 10; // 10% de descuento para 3 o 4 cuentas
  return 0;
};

const PricingSwitch = ({
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

const revealVariants = {
  visible: (i: number) => ({
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: {
      delay: i * 0.15 + 0.15, // Retraso sincronizado con la detención del skater
      duration: 0.5,
    },
  }),
  hidden: {
    filter: "blur(10px)",
    y: -20,
    opacity: 0,
  },
};

const titleTransition = {
  type: "spring",
  stiffness: 250,
  damping: 40,
  delay: 0,
} as const;

export const LoopsPricingSlider: React.FC<LoopsPricingSliderProps> = ({ onSelectFree }) => {
  const pricingRef = useRef<HTMLDivElement>(null);
  const { userCurrency, exchangeRate } = useGeoLocation();
  const [planType, setPlanType] = useState<"free" | "mensual" | "anual">("mensual");
  const [quantity, setQuantity] = useState(1);
  const [basePrices, setBasePrices] = useState({ mensual: 8, anual: 40 });

  useEffect(() => {
    let active = true;
    catalogService.getCatalogData(false, false)
      .then((data) => {
        if (!active) return;
        const mensualProduct = data.products.find((p) => p.slug === "plan-mensual");
        const anualProduct = data.products.find((p) => p.slug === "plan-anual");
        
        setBasePrices({
          mensual: mensualProduct?.price_cop ?? 8,
          anual: anualProduct?.price_cop ?? 40
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
    if (planType === "free") {
      localStorage.removeItem("jacko_trigger_checkout_slug");
      localStorage.removeItem("jacko_trigger_checkout_qty");
    } else {
      const slug = planType === "anual" ? "plan-anual" : "plan-mensual";
      localStorage.setItem("jacko_trigger_checkout_slug", slug);
      localStorage.setItem("jacko_trigger_checkout_qty", quantity.toString());
    }
    onSelectFree();
  };

  return (
    <div className="pricing-slider-section" ref={pricingRef}>
      {/* Encabezado con Animaciones */}
      <article className="pricing-header-text">
        <TimelineContent
          as="div"
          animationNum={0}
          timelineRef={pricingRef}
          customVariants={revealVariants}
          style={{ width: "100%" }}
        >
          <h2 className="pricing-title">
            <VerticalCutReveal
              splitBy="words"
              staggerDuration={0.12}
              staggerFrom="first"
              reverse={true}
              containerClassName="justify-center"
              transition={titleTransition}
            >
              Tenemos un plan a tu medida
            </VerticalCutReveal>
          </h2>
        </TimelineContent>

        <TimelineContent
          as="p"
          animationNum={1}
          timelineRef={pricingRef}
          customVariants={revealVariants}
          className="pricing-subtitle"
        >
          Elige entre acceso gratuito o expande tu experiencia con nuestras membresías de volumen premium.
        </TimelineContent>

        <TimelineContent
          as="div"
          animationNum={2}
          timelineRef={pricingRef}
          customVariants={revealVariants}
          className="mt-6"
        >
          <PricingSwitch selected={planType} onSwitch={setPlanType} />
        </TimelineContent>
      </article>

      {/* Grid de Contenedor de Tarjetas */}
      <div className="pricing-slider-card-grid">
        {/* Card Izquierda: Configuración del Plan */}
        <TimelineContent
          as="div"
          animationNum={3}
          timelineRef={pricingRef}
          customVariants={revealVariants}
        >
          <Card className="pricing-calc-card">
            <CardHeader className="text-left">
              <h3 className="calc-card-title">
                {planType === "free" ? "Membresía Básica" : "Configura tus Cuentas"}
              </h3>
              <p className="calc-card-desc">
                {planType === "free"
                  ? "Prueba nuestros servicios e interfaz sin costo."
                  : "Desliza para elegir la cantidad de licencias activas."}
              </p>
            </CardHeader>

            <CardContent className="pricing-slider-body">
              {planType !== "free" ? (
                <div style={{ marginTop: "0.5rem" }}>
                  <div className="qty-display-row">
                    <span className="qty-label">Cuentas solicitadas</span>
                    <span className="qty-value">
                      {Number.isFinite(quantity) ? (
                        <NumberFlow value={quantity} />
                      ) : (
                        <span>1</span>
                      )}{" "}
                      {quantity === 1 ? "cuenta" : "cuentas"}
                    </span>
                  </div>

                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={quantity}
                    onChange={handleSliderChange}
                    className="pricing-range-input"
                    style={{
                      background: `linear-gradient(to right, var(--orange-base) 0%, var(--orange-base) ${
                        ((quantity - 1) / 9) * 100
                      }%, rgba(212, 163, 88, 0.15) ${
                        ((quantity - 1) / 9) * 100
                      }%, rgba(212, 163, 88, 0.15) 100%)`,
                    }}
                  />

                  {discountPct > 0 ? (
                    <div className="volume-discount-alert">
                      🎉 ¡Descuento por volumen aplicado! Obtienes un{" "}
                      <strong>{discountPct}% de descuento</strong>.
                    </div>
                  ) : (
                    <div className="volume-discount-tip">
                      💡 Tip: Agrega 3 o más cuentas para obtener descuentos por volumen.
                    </div>
                  )}
                </div>
              ) : (
                <div className="free-plan-desc">
                  <p>
                    Obtén acceso inicial a nuestros servicios básicos sin compromisos. Puedes actualizar a una membresía premium en cualquier momento desde tu panel de control.
                  </p>
                </div>
              )}
            </CardContent>

            <div className="calc-card-footer">
              <span className="security-icon-span">
                <ShieldCheck size={16} /> Pago seguro SSL
              </span>
              <span className="security-icon-span">
                ⚡ Activación Inmediata
              </span>
            </div>
          </Card>
        </TimelineContent>

        {/* Card Derecha: Resumen y CTA */}
        <TimelineContent
          as="div"
          animationNum={4}
          timelineRef={pricingRef}
          customVariants={revealVariants}
        >
          <Card className={cn("pricing-summary-card", planType !== "free" && "premium-active")}>
            <CardHeader className="summary-header">
              <span className="plan-eyebrow">Resumen del Plan</span>
              <h4 className="plan-name-display">
                {planType === "free"
                  ? "Plan Gratis"
                  : planType === "mensual"
                  ? "Membresía Mensual"
                  : "Membresía Anual"}
              </h4>
            </CardHeader>

            <CardContent className="pt-0">
              <div className="summary-price-box">
                {planType === "free" ? (
                  <span className="price-display-text">Gratuito</span>
                ) : (
                  <>
                    <div className="price-row">
                      <span className="price-amount-large">
                        {Number.isFinite(finalPriceLocal) ? (
                          <NumberFlow
                            format={{
                              style: "currency",
                              currency: userCurrency || "USD",
                              minimumFractionDigits: (userCurrency || "USD") === 'COP' ? 0 : 2,
                              maximumFractionDigits: (userCurrency || "USD") === 'COP' ? 0 : 2,
                            }}
                            value={finalPriceLocal}
                          />
                        ) : (
                          <span>$0.00</span>
                        )}
                      </span>
                      <span className="price-period">
                        /{planType === "anual" ? "año" : "mes"}
                      </span>
                    </div>
                    {Number.isFinite(discountAmountLocal) && discountAmountLocal > 0 && (
                      <span className="price-discount-saved">
                        Ahorraste {" "}
                        <NumberFlow
                          format={{
                            style: "currency",
                            currency: userCurrency || "USD",
                            minimumFractionDigits: (userCurrency || "USD") === 'COP' ? 0 : 2,
                            maximumFractionDigits: (userCurrency || "USD") === 'COP' ? 0 : 2,
                          }}
                          value={discountAmountLocal}
                        />
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className="summary-benefits-list">
                {planType === "free" ? (
                  <>
                    <div className="benefit-item">
                      <CheckCircle2 size={16} className="check-icon" />
                      <span>Acceso básico al catálogo</span>
                    </div>
                    <div className="benefit-item">
                      <CheckCircle2 size={16} className="check-icon" />
                      <span>Soporte de la comunidad</span>
                    </div>
                    <div className="benefit-item">
                      <CheckCircle2 size={16} className="check-icon" />
                      <span>1 cuenta personal gratis</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="benefit-item">
                      <Sparkles size={16} className="sparkle-icon" />
                      <span>Acceso premium completo e ilimitado</span>
                    </div>
                    <div className="benefit-item">
                      <CheckCircle2 size={16} className="check-icon" />
                      <span>
                        {quantity} {quantity === 1 ? "Cuenta premium activa" : "Cuentas premium activas"}
                      </span>
                    </div>
                    <div className="benefit-item">
                      <CheckCircle2 size={16} className="check-icon" />
                      <span>Descargas ilimitadas de recursos</span>
                    </div>
                    <div className="benefit-item">
                      <CheckCircle2 size={16} className="check-icon" />
                      <span>Soporte prioritario post-venta 24/7</span>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                className="summary-action-btn"
                onClick={handleProceed}
              >
                {planType === "free" ? "Registrarse Gratis" : "Comenzar / Pagar"}{" "}
                <ArrowRight size={16} />
              </button>
            </CardContent>
          </Card>
        </TimelineContent>
      </div>
    </div>
  );
};
