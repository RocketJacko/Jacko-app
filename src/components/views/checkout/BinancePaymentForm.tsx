import React, { useState } from "react";
import { BinanceLogoSVG } from "./Logos";
import type { PaymentMethod, PricingPlan, ReceiptData } from "./types";
import { PaymentHandlerFactory } from "../../../lib/payments/PaymentHandlerFactory";

interface BinancePaymentFormProps {
  selectedMethod: PaymentMethod;
  productId: string;
  productTitle: string;
  quantity: number;
  userId: string;
  guestEmail?: string;
  guestName?: string;
  selectedPlan: PricingPlan | null;
  totalPrice: number;
  formatMoney: (amount: number) => string;
  isProcessing: boolean;
  onProcessingChange: (processing: boolean) => void;
  onPaymentSuccess: (orderId: string, receipt: ReceiptData) => void;
  onPaymentError: (error: string) => void;
}
export function BinancePaymentForm({
  selectedMethod,
  productId,
  productTitle,
  quantity,
  userId,
  guestEmail,
  guestName,
  selectedPlan,
  totalPrice,
  formatMoney,
  isProcessing,
  onProcessingChange,
  onPaymentSuccess,
  onPaymentError,
}: BinancePaymentFormProps) {
  const [binanceOrderId, setBinanceOrderId] = useState("");
  const [copied, setCopied] = useState(false);
  /*  Use metadata or default value for Destination Pay ID  */ const payId =
    selectedMethod.account_value || "0092019956";
  const handleCopyPayId = () => {
    navigator.clipboard.writeText(payId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!binanceOrderId.trim()) {
      onPaymentError("Por favor ingresa el ID de Orden o Transacción de Binance.");
      return;
    }
    onProcessingChange(true);
    onPaymentError("");
    try {
      const handler = PaymentHandlerFactory.getHandler("binance");
      const response = await handler.initiate({
        productId,
        paymentMethodId: selectedMethod.id,
        paymentMethodType: selectedMethod.type,
        quantity,
        userId,
        planId: selectedPlan?.id,
        binanceOrderId: binanceOrderId.trim(),
        guestEmail,
        guestName,
      });
      if (!response.success) {
        throw new Error(
          response.error || "Error al verificar el pago con Binance.",
        );
      }
      /*  Invalidate query caches invalidateCacheByPrefix('catalog_products'); invalidateCache('dashboard_data_' + userId); /*  Build receipt  */ const receipt: ReceiptData =
        {
          title: "¡Pago Confirmado!",
          subtitle:
            "Tu pago fue verificado y aprobado automáticamente por Binance.",
          amount: formatMoney(totalPrice),
          statusLabel: "APROBADO",
          statusType: "success",
          date: new Date().toLocaleDateString("es-CO", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          method: "Binance Pay",
          referenceId: response.orderId || binanceOrderId,
          productTitle,
        };
      onPaymentSuccess(response.orderId || "", receipt);
    } catch (err: unknown) {
      console.error(err);
      const msg =
        err instanceof Error
          ? err.message
          : "Error al procesar el pago con Binance.";
      onPaymentError(msg);
    } finally {
      onProcessingChange(false);
    }
  };
  return (
    <div className="nequi-flow-container">
      <div className="nequi-info-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
          {selectedMethod.qr_image_url ? (
            <img
              src={selectedMethod.qr_image_url}
              alt={selectedMethod.name}
              style={{ height: '70px', objectFit: 'contain' }}
            />
          ) : (
            <div style={{ height: '70px', display: 'flex', alignItems: 'center' }}>
              <BinanceLogoSVG />
            </div>
          )}
        </div>
        <p style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600, color: 'var(--brown-dark)', opacity: 0.8, lineHeight: 1.4 }}>
          Realiza tu envío a través de Binance Pay para activar tu producto al instante.
        </p>

        {/* Binance Pay ID Copy Box */}
        <div className="nequi-copy-key-wrapper" style={{ marginTop: '0.25rem' }}>
          <div className="nequi-copy-box" style={{ borderColor: 'rgba(243, 186, 47, 0.4)', background: 'rgba(243, 186, 47, 0.05)' }}>
            <span className="nequi-copy-value" style={{ color: '#e5b12a', fontSize: '1.05rem', fontWeight: 800 }}>
              ID: {payId}
            </span>
            <button
              type="button"
              className="nequi-copy-btn"
              onClick={handleCopyPayId}
              style={{ background: '#f3ba2f', color: '#000000' }}
            >
              {copied ? '¡Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="nequi-form" style={{ marginTop: '1.5rem' }}>
        <div className="nequi-field">
          <label htmlFor="binance-order-id-input" className="nequi-label">
            ID de la Orden Binance (18 dígitos) *
          </label>
          <input
            id="binance-order-id-input"
            type="text"
            className="nequi-input"
            placeholder="Ej. 434719397079719936"
            value={binanceOrderId}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              setBinanceOrderId(val);
            }}
            disabled={isProcessing}
            required
          />
          <span className="nequi-hint">
            Ingresa el ID de la orden (18 dígitos) que aparece en el detalle de tu pago de Binance Pay.
          </span>
        </div>

        <button
          type="submit"
          className="nequi-btn-primary"
          disabled={isProcessing || binanceOrderId.trim().length < 10}
          style={{
            marginTop: '1.25rem',
            background: '#f3ba2f',
            color: '#000000',
            fontWeight: 800,
            boxShadow: '0 6px 20px rgba(243, 186, 47, 0.25)',
          }}
        >
          {isProcessing ? 'Verificando con Binance...' : 'Confirmar y Verificar Pago'}
        </button>
      </form>
    </div>
  );
}
