import type { PaymentMethod } from './types';
import { PaypalLogoSVG, BinanceLogoSVG, BreBLogoSVG, NequiLogoSVG, MercadopagoLogoSVG } from './Logos';
import './PaymentMethodSelectorCard.css';

interface PaymentMethodSelectorCardProps {
  methods: PaymentMethod[];
  selectedMethod: PaymentMethod | null;
  onSelectMethod: (method: PaymentMethod) => void;
  disabled?: boolean;
}

export function PaymentMethodSelectorCard({
  methods,
  selectedMethod,
  onSelectMethod,
  disabled = false,
}: PaymentMethodSelectorCardProps) {
  const getMethodBadge = (type: PaymentMethod['type']) => {
    switch (type) {
      case 'paypal':
        return { tag: 'INTERNACIONAL', desc: 'Tarjetas, Saldo PayPal y FaceID' };
      case 'binance':
        return { tag: 'CRYPTO', desc: 'USDT, Pay ID y Código QR' };
      case 'bre_b':
        return { tag: 'COLOMBIA', desc: 'Transferencia directa a Llave Bre-B' };
      case 'nequi':
        return { tag: 'COLOMBIA', desc: 'Banca Móvil Nequi al instante' };
      case 'mercadopago':
        return { tag: 'LATAM', desc: 'PSE, Crédito / Débito y Efectivo' };
      default:
        return { tag: 'DIRECTO', desc: 'Pago contra inscripción de cuenta' };
    }
  };

  const renderLogo = (method: PaymentMethod) => {
    if (method.qr_image_url) {
      return <img src={method.qr_image_url} alt={method.name} className="payment-card-logo-img" />;
    }
    switch (method.type) {
      case 'paypal':
        return <PaypalLogoSVG />;
      case 'binance':
        return <BinanceLogoSVG />;
      case 'bre_b':
        return <BreBLogoSVG />;
      case 'nequi':
        return <NequiLogoSVG />;
      case 'mercadopago':
        return <MercadopagoLogoSVG />;
      default:
        return <span className="payment-card-icon-fallback">💳</span>;
    }
  };

  return (
    <div className="payment-method-selector-grid">
      {methods.map((method) => {
        const isSelected = selectedMethod?.type === method.type;
        const meta = getMethodBadge(method.type);

        return (
          <button
            key={method.type}
            type="button"
            className={`payment-option-card ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelectMethod(method)}
            disabled={disabled}
          >
            <div className="payment-card-header">
              <div className="payment-card-logo-container">{renderLogo(method)}</div>
              <span className={`payment-card-tag ${method.type}`}>{meta.tag}</span>
            </div>

            <div className="payment-card-body">
              <h4 className="payment-card-name">{method.name}</h4>
              <p className="payment-card-desc">{meta.desc}</p>
            </div>

            <div className="payment-card-radio-indicator">
              <div className="radio-circle" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
