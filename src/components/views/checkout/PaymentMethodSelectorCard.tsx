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
  const renderLogo = (method: PaymentMethod) => {
    if (method.qr_image_url) {
      return <img src={method.qr_image_url} alt={method.name} className="payment-btn-logo-img" />;
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
        return <span className="payment-btn-text-fallback">{method.name}</span>;
    }
  };

  return (
    <div className="pwa-payment-gateways-list">
      {methods.map((method) => {
        const isSelected = selectedMethod?.type === method.type;

        return (
          <label
            key={method.type}
            className={`pwa-gateway-card-label ${isSelected ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="gateway_option"
              value={method.type}
              checked={isSelected}
              onChange={() => onSelectMethod(method)}
              disabled={disabled}
              className="pwa-gateway-radio-input"
            />
            <div className="pwa-gateway-card-content">
              <div className="pwa-gateway-logo-container">
                {renderLogo(method)}
              </div>
              <div className="pwa-gateway-spacer" />
              <div className="pwa-gateway-radio-badge">
                <div className="pwa-gateway-radio-inner" />
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
