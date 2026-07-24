import React from "react";
import NumberFlow from "@number-flow/react";
import { ShieldCheck, CheckCircle2, Sparkles, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardContent } from "../card";
import { TimelineContent } from "../timeline-animation";
import { VerticalCutReveal } from "../vertical-cut-reveal";
import { cn } from "@/lib/utils";
import { getRemainingProjectMonths } from "@/lib/projectDuration";
import type { PricingSharedProps } from "./PricingSharedProps";
import "./PricingMobileView.css";

const revealVariants = {
  visible: (i: number) => ({
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: {
      delay: i * 0.08 + 0.1,
      duration: 0.4,
    },
  }),
  hidden: {
    filter: "blur(8px)",
    y: -15,
    opacity: 0,
  },
};

const titleTransition = {
  type: "spring",
  stiffness: 220,
  damping: 35,
  delay: 0,
} as const;

export const PricingMobileView: React.FC<PricingSharedProps> = ({
  planType,
  setPlanType: _setPlanType,
  quantity,
  handleSliderChange,
  discountPct,
  finalPriceLocal,
  discountAmountLocal,
  userCurrency,
  handleProceed,
  pricingRef,
  activeProduct,
}) => {
  const isFree = planType === "free";
  const remainingInfo = getRemainingProjectMonths();

  const dynamicBenefits = React.useMemo(() => {
    if (!activeProduct) return null;
    const rawText = activeProduct.description || activeProduct.short_description || "";
    const items = rawText
      .split(/<br\s*\/?>|\n|•/gi)
      .map((s: string) => s.replace(/<[^>]*>?/gm, "").trim())
      .filter((s: string) => s.length > 3);
    return items.length > 0 ? items : null;
  }, [activeProduct]);

  return (
    <>
      {/* Encabezado Principal */}
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
              staggerDuration={0.08}
              staggerFrom="first"
              reverse={true}
              containerClassName="justify-center"
              transition={titleTransition}
            >
              Planes a tu medida
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
          {activeProduct?.short_description || "Elige entre el acceso gratuito inicial o activa una membresía premium."}
        </TimelineContent>
      </article>

      {/* Tarjeta Única Unificada */}
      <TimelineContent
        as="div"
        animationNum={3}
        timelineRef={pricingRef}
        customVariants={revealVariants}
        className="w-full px-1 flex justify-center"
      >
        <Card
          className={cn("pricing-mobile-card", !isFree && "premium-active")}
          style={{
            height: "620px",
            minHeight: "620px",
            maxHeight: "620px",
            flexShrink: 0,
            overflow: "hidden"
          }}
        >
          <CardHeader className="text-left p-3 pb-0.5">
            <span className="mobile-plan-eyebrow">
              {isFree ? "Membresía Inicial" : "Suscripción Premium"}
            </span>
            <h3 className="mobile-plan-title">
              {isFree
                ? "Plan Gratis"
                : activeProduct?.title || (planType === "mensual" ? "Membresía Mensual" : "Membresía Premium")}
            </h3>
          </CardHeader>

          <CardContent className="pricing-mobile-body p-3 pt-0">
            {/* Flujo Premium */}
            {!isFree ? (
              <div className="mobile-premium-flow">
                {/* Selector Deslizable */}
                <div className="mobile-qty-section">
                  <div className="mobile-qty-display-row">
                    <span className="mobile-qty-label">Cuentas</span>
                    <span className="mobile-qty-value">
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
                    <div className="mobile-discount-alert">
                      🎉 ¡Ahorras un <strong>{discountPct}%</strong> por volumen!
                    </div>
                  ) : (
                    <div className="mobile-discount-tip">
                      💡 Tip: Selecciona 3 o más cuentas para obtener descuentos.
                    </div>
                  )}
                </div>

                {/* Caja de Precio Unificada */}
                <div className="mobile-price-box">
                  <div className="mobile-price-row">
                    <span className="mobile-price-amount">
                      {Number.isFinite(finalPriceLocal) ? (
                        <>
                          <span className="price-currency-symbol">$</span>
                          <NumberFlow
                            format={{
                              style: "decimal",
                              minimumFractionDigits: (userCurrency || "USD") === 'COP' ? 0 : 2,
                              maximumFractionDigits: (userCurrency || "USD") === 'COP' ? 0 : 2,
                            }}
                            value={finalPriceLocal}
                          />
                        </>
                      ) : (
                        <span>$0</span>
                      )}
                    </span>
                    <span className="mobile-price-currency">
                      {userCurrency || "USD"}
                    </span>
                    <span className="mobile-price-period">
                      / {planType === "anual" ? remainingInfo.label : "mes"}
                    </span>
                  </div>
                  {Number.isFinite(discountAmountLocal) && discountAmountLocal > 0 && (
                    <span className="mobile-price-discount-saved">
                      Ahorraste {" "}
                      <NumberFlow
                        format={{
                          style: "decimal",
                          minimumFractionDigits: (userCurrency || "USD") === 'COP' ? 0 : 2,
                          maximumFractionDigits: (userCurrency || "USD") === 'COP' ? 0 : 2,
                        }}
                        value={discountAmountLocal}
                      />
                      {" "}{userCurrency || "USD"}
                    </span>
                  )}
                </div>

                {/* Beneficios */}
                <div className="mobile-benefits-list">
                  {dynamicBenefits ? (
                    dynamicBenefits.slice(0, 3).map((benefit: string, idx: number) => (
                      <div key={idx} className="benefit-item">
                        {idx === 0 ? (
                          <Sparkles size={16} className="sparkle-icon" />
                        ) : (
                          <CheckCircle2 size={16} className="check-icon" />
                        )}
                        <span>{benefit}</span>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="benefit-item">
                        <Sparkles size={16} className="sparkle-icon" />
                        <span>Acceso premium ilimitado</span>
                      </div>
                      <div className="benefit-item">
                        <CheckCircle2 size={16} className="check-icon" />
                        <span>
                          {quantity} {quantity === 1 ? "Cuenta premium activa" : "Cuentas premium activas"}
                        </span>
                      </div>
                      <div className="benefit-item">
                        <CheckCircle2 size={16} className="check-icon" />
                        <span>Descargas y actualizaciones de recursos</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Botón Comenzar a Pagar */}
                <button
                  type="button"
                  className="mobile-action-btn premium"
                  onClick={handleProceed}
                >
                  Comprar Ahora / Pagar <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              /* Flujo Gratis */
              <div className="mobile-free-flow">
                <div className="mobile-free-content-group">
                  <p className="mobile-free-desc">
                    Accede a nuestros servicios básicos sin costos ni datos de tarjeta. Puedes escalar a un plan de volumen en cualquier momento.
                  </p>

                  {/* Beneficios Gratis */}
                  <div className="mobile-benefits-list">
                    <div className="benefit-item">
                      <CheckCircle2 size={16} className="check-icon" />
                      <span>1 cuenta gratuita de por vida</span>
                    </div>
                    <div className="benefit-item">
                      <CheckCircle2 size={16} className="check-icon" />
                      <span>Soporte básico comunitario</span>
                    </div>
                    <div className="benefit-item">
                      <CheckCircle2 size={16} className="check-icon" />
                      <span>Acceso al catálogo estándar</span>
                    </div>
                  </div>
                </div>

                {/* Botón Registrarse */}
                <button
                  type="button"
                  className="mobile-action-btn free"
                  onClick={handleProceed}
                >
                  Registrarse <ArrowRight size={16} />
                </button>
              </div>
            )}
          </CardContent>

          {/* Sellos de Seguridad en el Footer */}
          <div className="mobile-card-footer">
            <span className="mobile-security-span">
              <ShieldCheck size={14} /> Pago seguro SSL
            </span>
            <span className="mobile-security-span">
              ⚡ Activación Inmediata
            </span>
          </div>
        </Card>
      </TimelineContent>
    </>
  );
};
