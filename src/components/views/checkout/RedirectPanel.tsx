import { PaypalLogoSVG, MercadopagoLogoSVG } from './Logos';
import type { PaymentMethod, PricingPlan, ReceiptData } from './types';
import { PaymentHandlerFactory } from '../../../lib/payments/PaymentHandlerFactory';

interface RedirectPanelProps {
  selectedMethod: PaymentMethod;
  productId: string;
  productTitle: string;
  quantity: number;
  userId: string;
  selectedPlan: PricingPlan | null;
  totalPrice: number;
  formatMoney: (amount: number) => string;
  isProcessing: boolean;
  onProcessingChange: (processing: boolean) => void;
  onPaymentSuccess: (orderId: string, receipt: ReceiptData) => void;
  onPaymentError: (error: string) => void;
}

export function RedirectPanel({
  selectedMethod,
  productId,
  productTitle,
  quantity,
  userId,
  selectedPlan,
  totalPrice,
  formatMoney,
  isProcessing,
  onProcessingChange,
  onPaymentSuccess,
  onPaymentError,
}: RedirectPanelProps) {
  const isPaypal = selectedMethod.type === 'paypal';
  const isMercadopago = selectedMethod.type === 'mercadopago';

  if (!isPaypal && !isMercadopago) return null;

  const handleRedirectPayment = async () => {
    onProcessingChange(true);
    onPaymentError('');
    try {
      const type = selectedMethod.type as 'paypal' | 'mercadopago';
      const handler = PaymentHandlerFactory.getHandler(type);
      const response = await handler.initiate({
        productId,
        paymentMethodType: selectedMethod.type,
        quantity,
        userId,
        planId: selectedPlan?.id,
      });

      if (!response.success || !response.approveUrl) {
        throw new Error(response.error || `Error al iniciar la orden con ${selectedMethod.name}.`);
      }

      // Redirección directa sin popup bloqueado para que el navegador y SO invoquen la App nativa de PayPal si está instalada
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        // Redireccionar en la misma ventana para activar Deep Links a la app de PayPal
        window.location.href = response.approveUrl;
      } else {
        // En desktop abrir ventana emergente o redireccionar directamente
        const win = window.open(response.approveUrl, '_blank');
        if (!win || win.closed || typeof win.closed === 'undefined') {
          window.location.href = response.approveUrl;
        }
      }

      /* Estructura de recibo pendiente */
      const receipt: ReceiptData = {
        title: `Redirección a ${selectedMethod.name}`,
        subtitle: `Te hemos redireccionado al portal seguro de ${selectedMethod.name}. Si tienes la App instalada, se abrirá automáticamente. Al completar el pago, tu cuenta se activará de inmediato.`,
        amount: formatMoney(totalPrice),
        statusLabel: 'PENDIENTE',
        statusType: 'pending',
        date: new Date().toLocaleDateString('es-CO', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        method: selectedMethod.name,
        referenceId: response.orderId || `${selectedMethod.name} Checkout`,
        productTitle,
      };

      onPaymentSuccess(response.orderId || '', receipt);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error al redireccionar al portal de pago.';
      onPaymentError(msg);
    } finally {
      onProcessingChange(false);
    }
  };

  return (
    <div className="payment-redirect-box">
      <div className="redirect-logo-wrapper" style={{ marginBottom: '8px' }}>
        {selectedMethod.qr_image_url ? (
          <img src={selectedMethod.qr_image_url} alt={selectedMethod.name} />
        ) : isPaypal ? (
          <PaypalLogoSVG />
        ) : (
          <MercadopagoLogoSVG />
        )}
      </div>
      <h4>Pago Seguro</h4>
      <p className="redirect-description">
        {isPaypal
          ? 'Paga de manera segura con tu cuenta PayPal.'
          : 'Paga de manera segura a través de PSE, tarjetas de crédito/débito o efectivo con Mercado Pago.'}
      </p>
      <button
        type="button"
        className="btn-modal-action primary"
        disabled={isProcessing}
        onClick={handleRedirectPayment}
        style={{ width: '100%', padding: '14px 20px', display: 'flex', boxSizing: 'border-box' }}
      >
        {isProcessing ? 'Procesando...' : `Pagar con ${selectedMethod.name}`}
      </button>
    </div>
  );
}