import { Loader2 } from 'lucide-react';
import type { ActivationDetail, Order } from './types';
import type { HistoryItem } from './DashboardHistory';

interface OrderExpandedDetailsProps {
  item: HistoryItem;
  formatCOP: (val: number | null) => string;
  assigningOrderId: string | null;
  verifyingOrderId: string | null;
  onUploadModal: (item: HistoryItem) => void;
  onVerifyPaypal: (referenceNote: string | null, itemId: string) => void;
  onAssignPoolEmail: (order: Order) => void;
  onActivatingOrder: (order: Order) => void;
}

export function OrderExpandedDetails({
  item,
  formatCOP,
  assigningOrderId,
  verifyingOrderId,
  onUploadModal,
  onVerifyPaypal,
  onAssignPoolEmail,
  onActivatingOrder,
}: OrderExpandedDetailsProps) {
  const o = item.order;
  if (!item.isOrder || !o) return null;

  const isPending = item.status === 'pending' || item.status === 'pending_nequi';
  const activations = Array.isArray(o.activation_details) ? o.activation_details : [];

  // Categorías con activación instantánea por Pool
  const poolCategoryIds = [
    '507119f4-63c8-47bc-8cd3-caaeefcbfeea',
    '3305ffec-7bc1-44cd-9e66-6bf49e29a997',
  ];
  const prodExt = o.products as { category_id?: string; require_new_account?: boolean } | undefined;
  const isPoolProduct =
    (prodExt?.category_id && poolCategoryIds.includes(prodExt.category_id)) ||
    Boolean(prodExt?.require_new_account);

  const cleanNote = o.admin_note
    ? o.admin_note.replace(/\[ADVERTENCIA:[^\]]*\]/gi, '').trim()
    : '';

  return (
    <div className="dt-details-card" onClick={(e) => e.stopPropagation()}>
      {/* Header Grid: Ref & Amount */}
      <div className="dt-details-grid">
        <div className="dt-details-stat">
          <span className="dt-details-stat-label">Referencia</span>
          <span className="dt-details-stat-value text-mono">
            {o.reference_note || item.id.substring(0, 8)}
          </span>
        </div>
        <div className="dt-details-stat">
          <span className="dt-details-stat-label">Monto</span>
          <span className="dt-details-stat-value font-bold">
            {item.amount_cop !== null ? formatCOP(item.amount_cop) : `${item.points_used} pts`}
          </span>
        </div>
      </div>

      {/* Slots & Activations block */}
      {o.status === 'approved' || o.status === 'procesando' ? (
        <div className="dt-details-section">
          <span className="dt-details-stat-label">Cuentas Registradas y Activadas</span>
          <div className="dt-slots-container">
            {activations.map((act: ActivationDetail, idx: number) => (
              <div key={idx} className="dt-slot-card active">
                <div>
                  <span className="dt-slot-title">
                    Slot #{idx + 1}: {act.first_name} {act.last_name}
                  </span>
                  <span className="dt-slot-email">{act.correo || act.email}</span>
                </div>
                <span className="dt-badge dt-badge-success">Activa</span>
              </div>
            ))}
            {Array.from({
              length: Math.max(0, (o.quantity || 1) - activations.length),
            }).map((_, rIdx) => {
              const slotIndex = activations.length + rIdx + 1;
              return (
                <div key={`empty-${rIdx}`} className="dt-slot-card pending">
                  <div>
                    <span className="dt-slot-title italic">Slot #{slotIndex}: Sin registrar</span>
                    <span className="dt-slot-email opacity-70">Pendiente por activar</span>
                  </div>
                  {rIdx === 0 ? (
                    <button
                      type="button"
                      className="dt-inline-action orange no-margin"
                      disabled={assigningOrderId === o.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isPoolProduct) {
                          onAssignPoolEmail(o);
                        } else {
                          onActivatingOrder(o);
                        }
                      }}
                    >
                      {assigningOrderId === o.id ? (
                        <>
                          <Loader2 size={12} className="spin mr-2" />
                          Asignando...
                        </>
                      ) : (
                        <>🔑 Activar Cuenta</>
                      )}
                    </button>
                  ) : (
                    <span className="dt-slot-waiting">En espera</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Points pending redemption status */}
      {(o.payment_type === 'points' || (o.points_used && o.points_used > 0)) &&
      (o.status === 'approved' || o.status === 'procesando') &&
      !o.delivered_credentials ? (
        <div className="dt-details-notice">
          <span className="dt-details-stat-label">Estado del Canje</span>
          <p className="dt-details-notice-text">
            Asignando cuenta de los servidores... Por favor espera unos segundos o recarga la página.
          </p>
        </div>
      ) : null}

      {/* Proof upload link */}
      {o.receipt_url ? (
        <div className="dt-details-section border-bottom">
          <span className="dt-details-stat-label">Soporte de Pago</span>
          <a
            href={o.receipt_url.replace(
              '/object/nequi-comprobantes/',
              '/object/public/nequi-comprobantes/'
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="dt-receipt-link"
            onClick={(e) => e.stopPropagation()}
          >
            Ver imagen de comprobante ↗
          </a>
        </div>
      ) : null}

      {/* Admin Note block */}
      {cleanNote ? (
        <div className="dt-details-admin-note">
          <span className="dt-details-stat-label">Nota Administrativa</span>
          <pre className="dt-admin-note-content">{cleanNote}</pre>
        </div>
      ) : null}

      {/* Actions inline inside details panel */}
      {isPending ? (
        <div className="dt-details-actions">
          <button
            type="button"
            className="dt-inline-action orange no-margin"
            onClick={(e) => {
              e.stopPropagation();
              onUploadModal(item);
            }}
          >
            📷 Subir Soporte de Pago
          </button>
          {o.payment_methods?.type === 'paypal' && (
            <button
              type="button"
              className="dt-inline-action no-margin"
              onClick={(e) => {
                e.stopPropagation();
                onVerifyPaypal(o.reference_note ?? null, item.id);
              }}
              disabled={verifyingOrderId === item.id}
            >
              {verifyingOrderId === item.id ? 'Verificando...' : 'Verificar Pago en PayPal'}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
