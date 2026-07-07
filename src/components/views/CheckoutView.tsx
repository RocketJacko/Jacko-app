import { useState, useRef } from "react";
import { PriceCalculator } from "../../domain/cart/PriceCalculator";
import { useGeoLocation } from "../../hooks/useGeoLocation";
import { useOrderSubscription } from "../../hooks/useOrderSubscription";
import {
  ArrowLeft,
  ShoppingBag,
  X,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import DOMPurify from "dompurify";
import "./CheckoutView.css";

// Import subcomponents
import { PlanSelector } from './checkout/PlanSelector';
import { PaymentReceipt } from './checkout/PaymentReceipt';
import { NequiPaymentForm } from './checkout/NequiPaymentForm';
import { BinancePaymentForm } from './checkout/BinancePaymentForm';
import { RedirectPanel } from './checkout/RedirectPanel';
import { PayLaterPaymentForm } from './checkout/PayLaterPaymentForm';
import { PaypalLogoSVG, BinanceLogoSVG, BreBLogoSVG } from './checkout/Logos';

// Import and re-export types for backward compatibility
import type { AccordionItem, PricingPlan, Product, PaymentMethod, ReceiptData } from './checkout/types';
export type { AccordionItem, PricingPlan, Product, PaymentMethod, ReceiptData };

interface CheckoutViewProps {
  userId: string;
  product: Product;
  paymentMethods: PaymentMethod[];
  onBackToCatalog: () => void;
  onSuccess: (orderId: string) => void;
  onNavigateToDashboard?: () => void;
}

export function CheckoutView({
  userId,
  product,
  paymentMethods,
  onBackToCatalog,
  onSuccess,
  onNavigateToDashboard,
}: CheckoutViewProps) {
  const [quantity, setQuantity] = useState(1);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Pricing plans state
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(
    product.plans && product.plans.length > 0 ? product.plans[0] : null
  );

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

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [openAccordion, setOpenAccordion] = useState<string | null>('accordion-0');

  // Modal Flow Step
  const [checkoutStep, setCheckoutStep] = useState<'select_method' | 'fill_form'>('select_method');

  // Guest Checkout fields
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  const handleBackClick = () => {
    onBackToCatalog();
  };

  // Flow states
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const formContainerRef = useRef<HTMLDivElement>(null);

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

  const filteredPaymentMethods = paymentMethods.filter((method) => {
    const isLocal =
      method.type === 'bre_b' || method.type === 'nequi' || method.type === 'mercadopago';
    const isIntl = method.type === 'paypal' || method.type === 'binance';
    if (!isColombia) {
      return isIntl && (method.type === 'paypal' || method.type === 'binance');
    }
    return isLocal || isIntl;
  });

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
    <div className="checkout-view-wrapper">
      {/* Mobile Sticky Header */}
      <div className="checkout-mobile-header">
        <button type="button" className="btn-back" onClick={handleBackClick}>
          <ArrowLeft size={18} />
          <span>Volver</span>
        </button>
        <span className="product-title-header">{product.title}</span>
      </div>

      <div className="checkout-layout-grid">
        {receiptData ? (
          <PaymentReceipt
            receiptData={receiptData}
            quantity={quantity}
            onBackToCatalog={onBackToCatalog}
            onNavigateToDashboard={onNavigateToDashboard}
          />
        ) : (
          <>
            {/* Columna Izquierda - Detalles del Producto y Oferta */}
            <div className="checkout-col-details">
              <div className="product-details-card">
                <button type="button" className="btn-back-desktop" onClick={handleBackClick}>
                  <ArrowLeft size={16} /> Volver a la Tienda
                </button>
                <div className="product-details-header">
                  <span className="category-label">
                    {product.categories?.name || 'Producto'}
                  </span>
                  <h2>{product.title}</h2>

                  {/* Selector de Planes */}
                  <PlanSelector
                    plans={product.plans || []}
                    selectedPlan={selectedPlan}
                    onSelectPlan={(plan) => {
                      setSelectedPlan(plan);
                      setErrorMsg('');
                      setOpenAccordion('accordion-0');
                    }}
                  />

                  {/* Descripción */}
                  <p className="product-description-text">
                    {showFullDesc
                      ? currentDescription || currentShortDescription
                      : currentShortDescription || currentDescription?.substring(0, 150) + '...'}
                    {currentDescription && currentDescription.length > 150 && (
                      <button
                        type="button"
                        className="btn-toggle-desc"
                        onClick={() => setShowFullDesc(!showFullDesc)}
                      >
                        {showFullDesc ? 'Ver menos' : 'Ver más'}
                      </button>
                    )}
                  </p>

                  {/* Miniatura */}
                  {product.thumbnail_url && (
                    <div className="checkout-product-thumbnail">
                      <img src={product.thumbnail_url} alt={product.title} />
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
            <div className="checkout-col-summary">
              {/* Selector de cantidad */}
              <div className="checkout-quantity-selector">
                <span className="selector-label">Cantidad</span>
                <div className="qty-controls">
                  <button
                    type="button"
                    onClick={() => handleQtyChange(quantity - 1)}
                    disabled={quantity <= 1 || isProcessing}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    aria-label="Cantidad"
                    type="number"
                    value={quantity}
                    onChange={(e) => handleQtyChange(parseInt(e.target.value) || 1)}
                    disabled={isProcessing}
                  />
                  <button
                    type="button"
                    onClick={() => handleQtyChange(quantity + 1)}
                    disabled={isProcessing}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {selectedPlan?.id === 'pago-unico' && quantity === 3 && (
                <div
                  style={{
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
                  }}
                >
                  🎉 ¡Lleva 4 unidades por el mismo precio de 3! Sube la cantidad a 4.
                </div>
              )}

              {/* Resumen de Precios */}
              <div className="checkout-prices-card">
                <div className="price-row">
                  <span>Precio Unitario</span>
                  <span>{unitPriceFormatted}</span>
                </div>
                <div className="price-row">
                  <span>Subtotal</span>
                  <span>{regularPriceFormatted}</span>
                </div>
                {savings > 0 && (
                  <div className="price-row" style={{ color: '#2b8a3e', fontWeight: 700 }}>
                    <span>Ahorro por Volumen</span>
                    <span>-{savingsFormatted}</span>
                  </div>
                )}
                <div className="price-row">
                  <span>Impuestos</span>
                  <span>{taxesFormatted}</span>
                </div>
                <div className="price-row total">
                  <span>Total</span>
                  <span>{totalPriceFormatted}</span>
                </div>
                <div className="approximate-usd-label">{approxSubtitle}</div>
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
                      setSelectedMethod(null);
                      setCheckoutStep('select_method');
                    }}
                  >
                    {userCurrency === 'USD'
                      ? `${getCurrencyFlag(localCurrency)} Ver total en (${localCurrency})`
                      : `💵 Ver total en (USD)`}
                  </button>
                </div>
              </div>

              {/* Método de pago preview */}
              <div className="payment-security-card">
                <h3 className="card-title">Completar Pedido</h3>
                <p className="card-description">
                  Revisa los detalles a la izquierda y presiona continuar para elegir el método de pago.
                </p>
                <div style={{ borderTop: 'none', paddingTop: 0, marginTop: '1rem' }}>
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
                <div className="security-badges" style={{ marginTop: '2rem' }}>
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

                {userId === 'guest' && (
                  <div
                    style={{
                      marginTop: '1.5rem',
                      background: 'rgba(0,0,0,0.02)',
                      padding: '15px',
                      borderRadius: '12px',
                    }}
                  >
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem' }}>Datos del Comprador</h4>
                    <div style={{ marginBottom: '10px' }}>
                      <input
                        aria-label="Nombre Completo"
                        type="text"
                        placeholder="Nombre Completo"
                        value={guestName}
                        onChange={(e) => {
                          setGuestName(e.target.value);
                          setErrorMsg('');
                        }}
                        style={{ width: '100%', padding: '8px', border: '1px solid var(--beige-dark)', borderRadius: '6px' }}
                      />
                    </div>
                    <div style={{ marginBottom: '0' }}>
                      <input
                        aria-label="Correo Electrónico"
                        type="email"
                        placeholder="Correo Electrónico"
                        value={guestEmail}
                        onChange={(e) => {
                          setGuestEmail(e.target.value);
                          setErrorMsg('');
                        }}
                        style={{ width: '100%', padding: '8px', border: '1px solid var(--beige-dark)', borderRadius: '6px' }}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="btn-add-plan"
                  style={{ marginTop: '2.5rem', width: '100%' }}
                  onClick={() => {
                    if (userId === 'guest') {
                      if (!guestName.trim() || !guestEmail.trim()) {
                        setErrorMsg(
                          'Por favor ingresa tu Nombre Completo y Correo Electrónico para continuar.'
                        );
                        return;
                      }
                      if (!guestEmail.includes('@')) {
                        setErrorMsg('Por favor ingresa un correo electrónico válido.');
                        return;
                      }
                    }
                    setCheckoutStep('select_method');
                    setShowPaymentModal(true);
                  }}
                >
                  <ShoppingBag size={18} /> Continuar con el Pago
                </button>
              </div>

              {/* Modal de Opciones de Pago */}
              {showPaymentModal && (
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.currentTarget.click();
                    }
                  }}
                  className="modal-backdrop"
                  onClick={() => !isProcessing && setShowPaymentModal(false)}
                >
                  <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                      <h3>Pago Seguro</h3>
                      <button
                        type="button"
                        className="close-btn"
                        onClick={() => !isProcessing && setShowPaymentModal(false)}
                        disabled={isProcessing}
                        aria-label="Cerrar modal"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    <div className="order-summary-mini">
                      <div className="summary-row">
                        <span>Concepto:</span>
                        <strong>
                          {quantity > 1 ? `${quantity}x ` : ''}
                          {product.title}
                        </strong>
                      </div>
                      <div className="summary-row">
                        <span>Total a pagar:</span>
                        <strong>{totalPriceFormatted}</strong>
                      </div>
                    </div>

                    <div className="modal-body">
                      {checkoutStep === 'select_method' ? (
                        <>
                          <div className="form-group">
                            <label
                              htmlFor="payment-select"
                              style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}
                            >
                              Selecciona tu método de pago:
                            </label>
                            <select
                              id="payment-select"
                              value={selectedMethod?.type || ''}
                              onChange={(e) => {
                                if (e.target.value === 'other') {
                                  setSelectedMethod({
                                    name: 'Pagas Después (Cuenta Nueva)',
                                    type: 'other',
                                    account_value: null,
                                    instructions: null,
                                    qr_image_url: null,
                                    is_active: true,
                                  });
                                } else {
                                  const found = filteredPaymentMethods.find(
                                    (m) => m.type === e.target.value
                                  );
                                  setSelectedMethod(found || null);
                                }
                                setErrorMsg('');
                              }}
                              disabled={isProcessing}
                              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--beige-dark)' }}
                            >
                              <option value="" disabled>
                                -- Selecciona una opción --
                              </option>
                              {hasMoneyPrice
                                ? filteredPaymentMethods.map((method) => (
                                    <option key={method.type} value={method.type}>
                                      {method.name}
                                    </option>
                                  ))
                                : null}
                              {selectedPlan?.require_new_account && (
                                <option value="other">Pagas Después (Cuenta Nueva Pre-inscrita)</option>
                              )}
                            </select>
                          </div>
                          <div style={{ marginTop: '2rem' }}>
                            <button
                              type="button"
                              className="btn-add-plan"
                              style={{ width: '100%', margin: 0 }}
                              disabled={selectedMethod === null || isProcessing}
                              onClick={() => {
                                setErrorMsg('');
                                setCheckoutStep('fill_form');
                              }}
                            >
                              Continuar con {selectedMethod?.name || 'el Pago'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div ref={formContainerRef} className="payment-form-container">
                          <div style={{ marginBottom: '1.5rem' }}>
                            <button
                              type="button"
                              className="btn-back-step"
                              onClick={() => setCheckoutStep('select_method')}
                              disabled={isProcessing}
                              style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 700 }}
                            >
                              <ArrowLeft size={16} /> Cambiar método de pago
                            </button>
                          </div>
                          {selectedMethod !== null &&
                            (selectedMethod.type === 'nequi' || selectedMethod.type === 'bre_b') && (
                              <NequiPaymentForm
                                selectedMethod={selectedMethod}
                                productId={product.id}
                                productTitle={product.title}
                                quantity={quantity}
                                userId={userId}
                                selectedPlan={selectedPlan}
                                totalPrice={totalPrice}
                                formatMoney={formatMoney}
                                isProcessing={isProcessing}
                                onProcessingChange={setIsProcessing}
                                onPaymentSuccess={(_, receipt) => {
                                  setReceiptData(receipt);
                                }}
                                onPaymentError={setErrorMsg}
                                onBackToCatalog={onBackToCatalog}
                                guestEmail={userId === 'guest' ? guestEmail : undefined}
                                guestName={userId === 'guest' ? guestName : undefined}
                                exchangeRate={exchangeRate}
                              />
                            )}
                          {selectedMethod !== null &&
                            (selectedMethod.type === 'paypal' ||
                              selectedMethod.type === 'mercadopago') && (
                              <RedirectPanel
                                selectedMethod={selectedMethod}
                                productId={product.id}
                                productTitle={product.title}
                                quantity={quantity}
                                userId={userId}
                                selectedPlan={selectedPlan}
                                totalPrice={totalPrice}
                                formatMoney={formatMoney}
                                isProcessing={isProcessing}
                                onProcessingChange={setIsProcessing}
                                onPaymentSuccess={(_, receipt) => {
                                  setReceiptData(receipt);
                                }}
                                onPaymentError={setErrorMsg}
                                guestEmail={userId === 'guest' ? guestEmail : undefined}
                                guestName={userId === 'guest' ? guestName : undefined}
                              />
                            )}
                          {selectedMethod !== null && selectedMethod.type === 'other' && (
                            <PayLaterPaymentForm
                              userId={userId}
                              productId={product.id}
                              productTitle={product.title}
                              quantity={quantity}
                              totalPrice={totalPrice}
                              selectedPlan={selectedPlan}
                              formatMoney={formatMoney}
                              isProcessing={isProcessing}
                              onProcessingChange={setIsProcessing}
                              onPaymentSuccess={(_, receipt) => {
                                setReceiptData(receipt);
                              }}
                              onPaymentError={setErrorMsg}
                            />
                          )}
                          {selectedMethod !== null && selectedMethod.type === 'binance' && (
                            <BinancePaymentForm
                              selectedMethod={selectedMethod}
                              productId={product.id}
                              productTitle={product.title}
                              quantity={quantity}
                              userId={userId}
                              selectedPlan={selectedPlan}
                              totalPrice={totalPrice}
                              formatMoney={formatMoney}
                              isProcessing={isProcessing}
                              onProcessingChange={setIsProcessing}
                              onPaymentSuccess={(_, receipt) => {
                                setReceiptData(receipt);
                              }}
                              onPaymentError={setErrorMsg}
                              guestEmail={userId === 'guest' ? guestEmail : undefined}
                              guestName={userId === 'guest' ? guestName : undefined}
                            />
                          )}
                        </div>
                      )}
                      {errorMsg && (
                        <div className="admin-error-banner" style={{ marginTop: '15px' }}>
                          <X size={16} />
                          <span>{errorMsg}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
