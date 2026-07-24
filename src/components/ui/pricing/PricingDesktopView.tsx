import React from "react";
import NumberFlow from "@number-flow/react";
import { ShieldCheck, CheckCircle2, Sparkles, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardContent } from "../card";
import { TimelineContent } from "../timeline-animation";
import { cn } from "@/lib/utils";
import type { PricingSharedProps } from "./PricingSharedProps";
import "./PricingDesktopView.css";

const revealVariants = {
  visible: (i: number) => ({
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: {
      delay: i * 0.15 + 0.15,
      duration: 0.5,
    },
  }),
  hidden: {
    filter: "blur(10px)",
    y: -20,
    opacity: 0,
  },
};

export const PricingDesktopView: React.FC<PricingSharedProps> = ({
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
                {planType === "free"
                  ? "Membresía Básica"
                  : activeProduct?.title || "Configura tus Cuentas"}
              </h3>
              <p className="calc-card-desc">
                {planType === "free"
                  ? "Prueba nuestros servicios e interfaz sin costo."
                  : activeProduct?.short_description || "Desliza para elegir la cantidad de licencias activas."}
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
                      background: `linear-gradient(to right, var(--orange-base) 0%, var(--orange-base) ${((quantity - 1) / 9) * 100
                        }%, rgba(212, 163, 88, 0.15) ${((quantity - 1) / 9) * 100
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
                  : activeProduct?.title || (planType === "mensual" ? "Membresía Mensual" : "Membresía Premium")}
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
                      <span>Acumular puntos</span>
                    </div>
                    <div className="benefit-item">
                      <CheckCircle2 size={16} className="check-icon" />
                      <span>Canjear productos</span>
                    </div>
                  </>
                ) : dynamicBenefits ? (
                  dynamicBenefits.slice(0, 5).map((benefit: string, idx: number) => (
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
                {planType === "free" ? "Registrarse Gratis" : "Comprar Ahora / Pagar"}{" "}
                <ArrowRight size={16} />
              </button>
            </CardContent>
          </Card>
        </TimelineContent>
      </div>
    </>
  );
};
