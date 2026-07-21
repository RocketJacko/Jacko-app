import { Check } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import type { PricingPlan, ReceiptData } from "./types";
interface PayLaterPaymentFormProps {
  productId: string;
  productTitle: string;
  quantity: number;
  totalPrice: number;
  selectedPlan: PricingPlan | null;
  formatMoney: (amount: number) => string;
  isProcessing: boolean;
  onProcessingChange: (processing: boolean) => void;
  onPaymentSuccess: (orderId: string, receipt: ReceiptData) => void;
  onPaymentError: (error: string) => void;
}
export function PayLaterPaymentForm({
  productId,
  productTitle,
  quantity,
  totalPrice,
  selectedPlan,
  formatMoney,
  isProcessing,
  onProcessingChange,
  onPaymentSuccess,
  onPaymentError,
}: PayLaterPaymentFormProps) {
  const handlePayLater = async () => {
    onProcessingChange(true);
    onPaymentError("");
    try {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          product_id: productId,
          amount_cop: totalPrice,
          points_used: 0,
          status: "pending",
          payment_type: "money",
          payment_method_id: null,
          reference_note: selectedPlan
            ? `Pagas Después - Plan: ${selectedPlan.name}`
            : "Pagas Después (Cuenta Nueva)",
          quantity: quantity,
          plan_id: selectedPlan?.id || null,
        })
        .select("id")
        .single();
      if (orderError || !order) {
        throw new Error(
          orderError?.message ||
            "Error al solicitar tu cuenta nueva pre-inscrita.",
        );
      }
      /*  Invalidate frontend cache invalidateCacheByPrefix('catalog_products'); invalidateCache('dashboard_data_' + userId); /*  Build the receipt  */ const receipt: ReceiptData =
        {
          title: "¡Solicitud Recibida!",
          subtitle:
            "Tu solicitud de Cuenta Nueva (Pagas Después) ha sido registrada. Nuestro equipo preparará tu cuenta y te enviará las credenciales a tu correo/WhatsApp para que puedas verificarla antes de pagar.",
          amount: formatMoney(totalPrice),
          statusLabel: "PENDIENTE",
          statusType: "pending",
          date: new Date().toLocaleDateString("es-CO", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          method: "Pagas Después (Cuenta Nueva)",
          referenceId: order.id,
          productTitle,
        };
      onPaymentSuccess(order.id, receipt);
    } catch (err: unknown) {
      console.error(err);
      const msg =
        err instanceof Error
          ? err.message
          : "Error al registrar la solicitud de pago posterior.";
      onPaymentError(msg);
    } finally {
      onProcessingChange(false);
    }
  };
  return (
    <div>
      {" "}
      <h4> ⚙️ Modalidad: Cuenta Nueva Pre-inscrita </h4>{" "}
      <p>
        {" "}
        Te entregamos una cuenta totalmente nueva pre-inscrita. Inicias sesión
        con las credenciales asignadas, cambias la clave,{" "}
        <strong>
          verificas que está activa y funcionando, y realizas tu pago
        </strong>{" "}
        por Nequi o tu medio preferido.{" "}
      </p>{" "}
      <ul>
        {" "}
        <li>
          Pagas únicamente tras verificar el correcto funcionamiento.
        </li>{" "}
        <li>Ideal si prefieres probar el servicio antes de transferir.</li>{" "}
        <li>
          Una vez habilitada la cuenta, recibirás las instrucciones de pago.
        </li>{" "}
      </ul>{" "}
      <div style={WARNING_BANNER_STYLE}>
        {" "}
        ⚠️ <strong>Nota:</strong> Esta opción solo aplica para la entrega de
        cuentas nuevas pre-inscritas. Si prefieres activar tu cuenta personal
        existente, debes realizar el pago anticipado.{" "}
      </div>{" "}
      <button type="button" disabled={isProcessing} onClick={handlePayLater}>
        {" "}
        <Check size={18} />{" "}
        {isProcessing
          ? "Solicitando..."
          : "Solicitar Cuenta Nueva (Pagar Después)"}{" "}
      </button>{" "}
    </div>
  );
}

const WARNING_BANNER_STYLE: React.CSSProperties = {
  padding: "10px 12px",
  background: "rgba(212, 98, 26, 0.08)",
  borderLeft: "4px solid #d4621a",
  borderRadius: "8px",
  fontSize: "0.85rem",
  color: "#b24f11",
  fontWeight: 500,
  marginBottom: "20px",
};
