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
  selectedPlan: PricingPlan | null;
  totalPrice: number;
  formatMoney: (amount: number) => string;
  isProcessing: boolean;
  onProcessingChange: (processing: boolean) => void;
  onPaymentSuccess: (orderId: string, receipt: ReceiptData) => void;
  onPaymentError: (error: string) => void;
  guestEmail?: string;
  guestName?: string;
}
export function BinancePaymentForm({
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
  guestEmail,
  guestName,
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
    if (binanceOrderId.trim().length < 10) {
      onPaymentError(
        "Por favor, ingresa un ID de orden de Binance de 18 dígitos válido.",
      );
      return;
    }
    onProcessingChange(true);
    onPaymentError("");
    try {
      const handler = PaymentHandlerFactory.getHandler("binance");
      const response = await handler.initiate({
        productId,
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
    <div>
      {" "}
      <div>
        {" "}
        <div>
          {" "}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: "12px",
            }}
          >
            {" "}
            {selectedMethod.qr_image_url ? (
              <img
                src={selectedMethod.qr_image_url}
                alt={selectedMethod.name}
                style={{ height: "80px", objectFit: "contain" }}
              />
            ) : (
              <BinanceLogoSVG />
            )}{" "}
          </div>{" "}
          <p>
            Realiza tu envío a través de Binance Pay para activar tu producto al
            instante.
          </p>{" "}
          <div style={{ borderLeftColor: "#F3BA2F" }}>
            {" "}
            <span style={{ color: "#F3BA2F" }}>Binance Pay ID:</span>{" "}
            <strong>{payId}</strong>{" "}
            <button
              type="button"
              onClick={handleCopyPayId}
              style={{
                backgroundColor: "rgba(243, 186, 47, 0.15)",
                color: "#F3BA2F",
              }}
            >
              {" "}
              {copied ? "¡Copiado!" : "Copiar"}{" "}
            </button>{" "}
          </div>{" "}
        </div>{" "}
        <form onSubmit={handleSubmit}>
          {" "}
          <div>
            {" "}
            <label htmlFor="binance-order-id-input">
              ID de la Orden Binance (18 dígitos) *
            </label>{" "}
            <input
              id="binance-order-id-input"
              type="text"
              placeholder="Ej. 434719397079719936"
              value={binanceOrderId}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                setBinanceOrderId(val);
              }}
              disabled={isProcessing}
              required
            />{" "}
            <span
              style={{ marginTop: "6px", fontSize: "0.8rem", opacity: 0.85 }}
            >
              {" "}
              Ingresa el ID de la orden (18 dígitos) que aparece en el detalle
              de tu pago de Binance Pay.{" "}
            </span>{" "}
          </div>{" "}
          <button
            type="submit"
            disabled={isProcessing || binanceOrderId.trim().length < 10}
            style={{
              marginTop: "15px",
              backgroundColor: "#F3BA2F",
              color: "#000000",
              fontWeight: 700,
            }}
          >
            {" "}
            {isProcessing
              ? "Verificando con Binance..."
              : "Confirmar y Verificar Pago"}{" "}
          </button>{" "}
        </form>{" "}
      </div>{" "}
    </div>
  );
}
