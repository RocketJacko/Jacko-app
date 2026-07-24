import { useState } from "react";
import { PriceCalculator } from "../../domain/cart/PriceCalculator";
import { useGeoLocation } from "../../hooks/useGeoLocation";
import { useOrderSubscription } from "../../hooks/useOrderSubscription";
import {
  ArrowLeft,
  ShoppingBag,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  Mail,
  User,
} from "lucide-react";
import DOMPurify from "dompurify";
import "./CheckoutView.css";

// Import subcomponents
import { PlanSelector } from './checkout/PlanSelector';
import { PaymentReceipt } from './checkout/PaymentReceipt';
import { PaymentModalDialog } from './checkout/PaymentModalDialog';
import { getAvailablePaymentMethods } from './checkout/paymentUtils';
import { PaypalLogoSVG, BinanceLogoSVG, BreBLogoSVG } from './checkout/Logos';

// Import and re-export types for backward compatibility
import type { AccordionItem, PricingPlan, Product, PaymentMethod, ReceiptData } from './checkout/types';
export type { AccordionItem, PricingPlan, Product, PaymentMethod, ReceiptData };

interface CheckoutViewProps {
  userId: string;
  product: Product;
  paymentMethods: PaymentMethod[];
  initialQuantity?: number;
  onBackToCatalog: () => void;
  onSuccess: (orderId: string) => void;
  onNavigateToDashboard?: () => void;
}

export function CheckoutView({
  userId,
  product,
  paymentMethods,
  initialQuantity = 1,
  onBackToCatalog,
  onSuccess,
  onNavigateToDashboard,
}: CheckoutViewProps) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Pricing plans state
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(
    product.plans && product.plans.length > 0 ? product.plans[0] : null
  );

  // Guest checkout state
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestError, setGuestError] = useState('');

  const {
    userCurrency,
    exchangeRate,
    isColombia,
    setIsColombia,
    setUserCurrency,
    localCurrency,
    detectedIsColombia,
  } = useGeoLocation();

  const getCurrencyFlag = (currency: string) => {
    switch (currency) {
      case 'COP':
        return '🇨🇴';
      case 'MXN':
        return '🇲🇽';
      case 'CLP':
        return '🇨🇱';
      case 'ARS':
        return '🇦🇷';
      case 'PEN':
        return '🇵🇪';
      case 'EUR':
        return '🇪🇺';
      case 'USD':
        return '💵';
      default:
        return '🌎';
    }
  };

  const [openAccordion, setOpenAccordion] = useState<string | null>('accordion-0');

  const handleBackClick = () => {
    onBackToCatalog();
  };

  // Flow states
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Total Calculations
  const isIncludedInSubscription = false;

  // Use price and description from active plan if plans exist
  const currentShortDescription = selectedPlan
    ? selectedPlan.short_description
    : product.short_description;
  const currentDescription = selectedPlan ? selectedPlan.description : product.description;
  const currentAccordions =
    selectedPlan && selectedPlan.accordions ? selectedPlan.accordions : product.accordions;

  const basePriceUsd = PriceCalculator.getBasePriceUsd(product, selectedPlan);
  const totalPriceUsd = isIncludedInSubscription
    ? 0
    : PriceCalculator.calculateTotalPriceUsd({
        product,
        selectedPlan,
        quantity,
        exchangeRate,
      });
  const totalPrice = totalPriceUsd * exchangeRate;

  const regularPriceUsd = PriceCalculator.calculateRegularPriceUsd(
    product,
    selectedPlan,
    quantity
  );
  const regularPrice = regularPriceUsd * exchangeRate;

  const savingsUsd = PriceCalculator.calculateSavingsUsd({
    product,
    selectedPlan,
    quantity,
    exchangeRate,
  });
  const savings = savingsUsd * exchangeRate;

  const hasMoneyPrice = basePriceUsd > 0;
  const filteredPaymentMethods = getAvailablePaymentMethods(paymentMethods, isColombia);

  const formatMoney = (amountLocal: number) => {
    const hasDecimals = userCurrency !== 'COP';
    return `$${amountLocal.toLocaleString(userCurrency === 'COP' ? 'es-CO' : 'en-US', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0,
    })} ${userCurrency}`;
  };

  const approxSubtitle =
    userCurrency !== 'USD'
      ? `~ $${totalPriceUsd.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} USD`
      : ``;

  const unitPriceFormatted = formatMoney(basePriceUsd * exchangeRate);
  const regularPriceFormatted = formatMoney(regularPrice);
  const savingsFormatted = formatMoney(savings);
  const taxesFormatted = formatMoney(0);
  const totalPriceFormatted = formatMoney(totalPrice);

  useOrderSubscription({
    orderId: receiptData?.referenceId,
    userId,
    onApproved: () => {
      const orderId = receiptData?.referenceId;
      if (orderId) {
        onSuccess(orderId);
      }
      setReceiptData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          title: '¡Pago Confirmado!',
          subtitle: 'Tu pago fue verificado exitosamente por el sistema.',
          statusLabel: 'APROBADO',
          statusType: 'success',
        };
      });
    },
  });

  const handleQtyChange = (val: number) => {
    const nextVal = Math.max(1, val);
    setQuantity(nextVal);
  };

  return (
    <div className="checkout-container">
      {/* Mobile Sticky Header */}
      <div className="checkout-mobile-header">
        <button type="button" className="btn-back" onClick={handleBackClick}>
          <ArrowLeft size={18} />
          <span>Volver</span>
        </button>
        <span className="product-title-header">{product.title}</span>
      </div>

      <div className="checkout-card">
        {receiptData ? (
          <PaymentReceipt
            key={receiptData.referenceId}
            receiptData={receiptData}
            quantity={quantity}
            onBackToCatalog={onBackToCatalog}
            onNavigateToDashboard={onNavigateToDashboard}
          />
        ) : (
          <>
            {/* Columna Izquierda - Detalles del Producto y Oferta */}
            <div className="checkout-summary-col">
              <div className="checkout-product-details">
                <button type="button" className="checkout-back-link" onClick={handleBackClick}>
                  <ArrowLeft size={16} /> Volver a la Tienda
                </button>
                <div className="product-details-header">
                  <span className="checkout-product-tag">
                    {product.categories?.name || 'Producto'}
                  </span>
                  <h2 className="checkout-product-title">{product.title}</h2>

                  {/* Selector de Planes */}
                  <PlanSelector
                    plans={product.plans || []}
                    selectedPlan={selectedPlan}
                    onSelectPlan={(plan) => {
                      setSelectedPlan(plan);
                      setOpenAccordion('accordion-0');
                    }}
                  />

                  {/* Descripción */}
                  <p className="checkout-product-desc">
                    {showFullDesc
                      ? currentDescription || currentShortDescription
                      : currentShortDescription || currentDescription?.substring(0, 150) + '...'}
                    {currentDescription && currentDescription.length > 150 && (
                      <button
                        type="button"
                        className="toggle-desc-btn"
                        onClick={() => setShowFullDesc(!showFullDesc)}
                      >
                        {showFullDesc ? 'Ver menos' : 'Ver más'}
                      </button>
                    )}
                  </p>

                  {/* Miniatura */}
                  {product.thumbnail_url && (
                    <div className="checkout-thumbnail-wrapper">
                      <img className="checkout-thumbnail" src={product.thumbnail_url} alt={product.title} />
                    </div>
                  )}

                  {/* Garantías y Acordeones */}
                  {currentAccordions && currentAccordions.length > 0 && (
                    <div className="product-accordions-section">
                      <h4 className="accordion-section-title">⚙️ Modalidades y Garantías</h4>
                      <div className="accordions-container">
                        {currentAccordions.map((acc: AccordionItem, index: number) => {
                          const accordionKey = `accordion-${index}`;
                          const isOpen = openAccordion === accordionKey;
                          return (
                            <div key={index} className={`accordion-item-card${isOpen ? ' open' : ''}`}>
                              <button
                                type="button"
                                className="accordion-trigger-btn"
                                onClick={() => setOpenAccordion(isOpen ? null : accordionKey)}
                              >
                                <span className="accordion-title">{acc.title}</span>
                                <span className="accordion-icon">
                                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </span>
                              </button>
                              <div className="accordion-content-wrapper">
                                <div className="accordion-content-inner">
                                  {acc.content && (
                                    <p
                                      style={{
                                        marginBottom: acc.items && acc.items.length > 0 ? '10px' : '0',
                                      }}
                                      dangerouslySetInnerHTML={{
                                        __html: DOMPurify.sanitize(acc.content),
                                      }}
                                    />
                                  )}
                                  {acc.items && acc.items.length > 0 && (
                                    <ul style={{ marginBottom: '0' }}>
                                      {acc.items.map((item: string, itemIdx: number) => (
                                        <li
                                          key={itemIdx}
                                          dangerouslySetInnerHTML={{
                                            __html: DOMPurify.sanitize(item),
                                          }}
                                        />
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Columna Derecha - Resumen y Acción */}
            <div className="checkout-payment-col">
              {/* Selector de cantidad */}
              <div className="checkout-qty-selector">
                <span className="qty-label">Cantidad</span>
                <div className="qty-controls">
                  <button
                    type="button"
                    className="qty-btn"
                    onClick={() => handleQtyChange(quantity - 1)}
                    disabled={quantity <= 1 || isProcessing}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    aria-label="Cantidad"
                    className="qty-input"
                    type="number"
                    value={quantity}
                    onChange={(e) => handleQtyChange(parseInt(e.target.value) || 1)}
                    disabled={isProcessing}
                  />
                  <button
                    type="button"
                    className="qty-btn"
                    onClick={() => handleQtyChange(quantity + 1)}
                    disabled={isProcessing}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {selectedPlan?.id === 'pago-unico' && quantity === 3 && (
                <div style={PROMO_BANNER_STYLE}>
                  🎉 ¡Lleva 4 unidades por el mismo precio de 3! Sube la cantidad a 4.
                </div>
              )}

              {/* Resumen de Precios */}
              <div className="checkout-pricing-summary">
                <div className="checkout-summary-lines">
                  <div className="summary-line">
                    <span>Precio Unitario</span>
                    <span>{unitPriceFormatted}</span>
                  </div>
                  <div className="summary-line">
                    <span>Subtotal</span>
                    <span>{regularPriceFormatted}</span>
                  </div>
                  {savings > 0 && (
                    <div className="summary-line" style={{ color: '#2b8a3e', fontWeight: 700 }}>
                      <span>Ahorro por Volumen</span>
                      <span>-{savingsFormatted}</span>
                    </div>
                  )}
                  <div className="summary-line">
                    <span>Impuestos</span>
                    <span>{taxesFormatted}</span>
                  </div>
                  <div className="summary-line total">
                    <span>Total</span>
                    <span>{totalPriceFormatted}</span>
                  </div>
                </div>
                <div className="total-usd-approx">{approxSubtitle}</div>
                <div style={{ marginTop: '8px', textAlign: 'right' }}>
                  <button
                    type="button"
                    className="currency-toggle-btn"
                    onClick={() => {
                      const isCurrentUsd = userCurrency === 'USD';
                      if (isCurrentUsd) {
                        setUserCurrency(localCurrency);
                        setIsColombia(detectedIsColombia);
                      } else {
                        setUserCurrency('USD');
                        setIsColombia(false);
                      }
                      setShowPaymentModal(false);
                    }}
                  >
                    {userCurrency === 'USD'
                      ? `${getCurrencyFlag(localCurrency)} Ver total en (${localCurrency})`
                      : `💵 Ver total en (USD)`}
                  </button>
                </div>
              </div>

              {/* Método de pago preview */}
              <div className="payment-security-card-wrapper" style={{ marginTop: '2rem' }}>
                <h3 className="checkout-payment-title">Completar Pedido</h3>
                <p className="checkout-payment-subtitle">
                  {!userId
                    ? 'Ingresa el correo electrónico donde recibirás los datos de acceso y confirmación.'
                    : 'Revisa los detalles a la izquierda y presiona continuar para elegir el método de pago.'}
                </p>

                {/* Formulario de Datos de Activación para Invitados (Sin Login) */}
                {!userId && (
                  <div className="guest-info-form" style={{ marginTop: '1rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="guest-input-group">
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-dark, #3f2d1b)', marginBottom: '6px' }}>
                        Correo Electrónico de Activación *
                      </label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Mail size={18} style={{ position: 'absolute', left: '12px', color: 'var(--orange-base, #d4621a)' }} />
                        <input
                          type="email"
                          placeholder="tu-correo@ejemplo.com"
                          value={guestEmail}
                          onChange={(e) => {
                            setGuestEmail(e.target.value);
                            if (guestError) setGuestError('');
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 12px 10px 38px',
                            borderRadius: '12px',
                            border: guestError ? '1.5px solid #ef4444' : '1.5px solid rgba(212, 98, 26, 0.3)',
                            background: '#ffffff',
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.9rem',
                            outline: 'none',
                            color: '#3f2d1b',
                          }}
                        />
                      </div>
                    </div>

                    <div className="guest-input-group">
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-dark, #3f2d1b)', marginBottom: '6px' }}>
                        Nombre Completo (Opcional)
                      </label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <User size={18} style={{ position: 'absolute', left: '12px', color: 'var(--orange-base, #d4621a)' }} />
                        <input
                          type="text"
                          placeholder="Tu nombre"
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '10px 12px 10px 38px',
                            borderRadius: '12px',
                            border: '1.5px solid rgba(212, 98, 26, 0.3)',
                            background: '#ffffff',
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.9rem',
                            outline: 'none',
                            color: '#3f2d1b',
                          }}
                        />
                      </div>
                    </div>

                    {guestError && (
                      <span style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 600 }}>
                        ⚠️ {guestError}
                      </span>
                    )}
                  </div>
                )}

                <div style={{ borderTop: 'none', paddingTop: 0, marginTop: '0.5rem' }}>
                  <div className="payment-logos-preview" style={{ display: 'flex', gap: '8px' }}>
                    {hasMoneyPrice &&
                      filteredPaymentMethods.some((m) => m.type === 'bre_b' || m.type === 'nequi') && (
                        <div title="Bre-B / Nequi">
                          <BreBLogoSVG />
                        </div>
                      )}
                    {hasMoneyPrice &&
                      filteredPaymentMethods.some((m) => m.type === 'paypal') && (
                        <div title="PayPal">
                          <PaypalLogoSVG />
                        </div>
                      )}
                    {hasMoneyPrice &&
                      filteredPaymentMethods.some((m) => m.type === 'binance') && (
                        <div title="Binance Pay">
                          <BinanceLogoSVG />
                        </div>
                      )}
                  </div>
                </div>
                <div className="security-badges" style={{ marginTop: '1.5rem' }}>
                  <div className="badge-item">
                    <span>🛡️</span>
                    <span>Transacción 100% segura y encriptada SSL</span>
                  </div>
                  <div className="badge-item">
                    <span>⚡</span>
                    <span>Activación garantizada e inmediata</span>
                  </div>
                  <div className="badge-item">
                    <span>💬</span>
                    <span>Soporte post-venta prioritario</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="checkout-action-button"
                  disabled={isProcessing}
                  onClick={() => {
                    if (!userId && (!guestEmail || !guestEmail.includes('@'))) {
                      setGuestError('Ingresa un correo electrónico válido para enviarte el acceso a tu cuenta.');
                      return;
                    }
                    setGuestError('');
                    setShowPaymentModal(true);
                  }}
                >
                  <ShoppingBag size={18} /> Continuar con el Pago
                </button>
              </div>

              {/* Modal de Opciones de Pago Desacoplado */}
              <PaymentModalDialog
                isOpen={showPaymentModal}
                isProcessing={isProcessing}
                product={product}
                quantity={quantity}
                userId={userId}
                guestEmail={guestEmail}
                guestName={guestName}
                selectedPlan={selectedPlan}
                totalPrice={totalPrice}
                totalPriceFormatted={totalPriceFormatted}
                hasMoneyPrice={hasMoneyPrice}
                filteredPaymentMethods={filteredPaymentMethods}
                exchangeRate={exchangeRate}
                formatMoney={formatMoney}
                onClose={() => setShowPaymentModal(false)}
                onProcessingChange={setIsProcessing}
                onPaymentSuccess={(_, receipt) => {
                  setReceiptData(receipt);
                  setShowPaymentModal(false);
                }}
                onPaymentError={() => {}}
                onBackToCatalog={onBackToCatalog}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const PROMO_BANNER_STYLE: React.CSSProperties = {
  marginTop: '-4px',
  marginBottom: '16px',
  padding: '10px 12px',
  background: 'rgba(43, 138, 62, 0.08)',
  border: '1.5px dashed rgba(43, 138, 62, 0.4)',
  color: '#2b8a3e',
  borderRadius: '12px',
  fontSize: '0.85rem',
  fontWeight: 700,
  textAlign: 'center',
};
