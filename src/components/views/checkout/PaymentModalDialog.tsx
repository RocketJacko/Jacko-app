import { useState, useRef } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import type { Product, PaymentMethod, PricingPlan, ReceiptData } from './types';
import { NequiPaymentForm } from './NequiPaymentForm';
import { BinancePaymentForm } from './BinancePaymentForm';
import { RedirectPanel } from './RedirectPanel';
import { PayLaterPaymentForm } from './PayLaterPaymentForm';
import { BaseModal } from '../../ui/BaseModal';

interface PaymentModalDialogProps {
  isOpen: boolean;
  isProcessing: boolean;
  product: Product;
  quantity: number;
  userId: string;
  selectedPlan: PricingPlan | null;
  totalPrice: number;
  totalPriceFormatted: string;
  hasMoneyPrice: boolean;
  filteredPaymentMethods: PaymentMethod[];
  exchangeRate: number;
  formatMoney: (val: number) => string;
  onClose: () => void;
  onProcessingChange: (processing: boolean) => void;
  onPaymentSuccess: (orderId: string, receiptData: ReceiptData) => void;
  onPaymentError: (error: string) => void;
  onBackToCatalog: () => void;
}

export function PaymentModalDialog({
  isOpen,
  isProcessing,
  product,
  quantity,
  userId,
  selectedPlan,
  totalPrice,
  totalPriceFormatted,
  hasMoneyPrice,
  filteredPaymentMethods,
  exchangeRate,
  formatMoney,
  onClose,
  onProcessingChange,
  onPaymentSuccess,
  onPaymentError,
  onBackToCatalog,
}: PaymentModalDialogProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<'select_method' | 'fill_form'>('select_method');
  const [errorMsg, setErrorMsg] = useState('');
  const formContainerRef = useRef<HTMLDivElement>(null);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Pago Seguro"
      isProcessing={isProcessing}
      maxWidth="500px"
    >

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
                      const found = filteredPaymentMethods.find((m) => m.type === e.target.value);
                      setSelectedMethod(found || null);
                    }
                    setErrorMsg('');
                  }}
                  disabled={isProcessing}
                  className="custom-modal-input"
                  style={{ width: '100%' }}
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
                  className="btn-modal-action primary"
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
                  style={{
                    background: 'none',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
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
                    onProcessingChange={onProcessingChange}
                    onPaymentSuccess={onPaymentSuccess}
                    onPaymentError={(err) => {
                      setErrorMsg(err);
                      onPaymentError(err);
                    }}
                    onBackToCatalog={onBackToCatalog}
                    exchangeRate={exchangeRate}
                  />
                )}
              {selectedMethod !== null &&
                (selectedMethod.type === 'paypal' || selectedMethod.type === 'mercadopago') && (
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
                    onProcessingChange={onProcessingChange}
                    onPaymentSuccess={onPaymentSuccess}
                    onPaymentError={(err) => {
                      setErrorMsg(err);
                      onPaymentError(err);
                    }}
                  />
                )}
              {selectedMethod !== null && selectedMethod.type === 'other' && (
                <PayLaterPaymentForm
                  productId={product.id}
                  productTitle={product.title}
                  quantity={quantity}
                  totalPrice={totalPrice}
                  selectedPlan={selectedPlan}
                  formatMoney={formatMoney}
                  isProcessing={isProcessing}
                  onProcessingChange={onProcessingChange}
                  onPaymentSuccess={onPaymentSuccess}
                  onPaymentError={(err) => {
                    setErrorMsg(err);
                    onPaymentError(err);
                  }}
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
                  onProcessingChange={onProcessingChange}
                  onPaymentSuccess={onPaymentSuccess}
                  onPaymentError={(err) => {
                    setErrorMsg(err);
                    onPaymentError(err);
                  }}
                />
              )}
            </div>
          )}
          {errorMsg && (
            <div className="checkout-error-feedback" style={{ marginTop: '15px' }}>
              <X size={16} />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
    </BaseModal>
  );
}
