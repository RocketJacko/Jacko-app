import { useState, useEffect } from 'react';
import { Check, Copy, CheckCheck, Clock } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import type { ActivationDetail } from '../dashboard/types';
import type { ReceiptData } from './types';

interface PaymentReceiptProps {
  receiptData: ReceiptData;
  quantity: number;
  onBackToCatalog: () => void;
  onNavigateToDashboard?: () => void;
}

export function PaymentReceipt({
  receiptData,
  quantity,
  onBackToCatalog,
  onNavigateToDashboard,
}: PaymentReceiptProps) {
  const [assignedEmail, setAssignedEmail] = useState<string | null>(null);
  const [isLoadingEmail, setIsLoadingEmail] = useState(receiptData.statusType === 'success');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activationDetails, setActivationDetails] = useState<ActivationDetail[]>([]);

  const emailsList = assignedEmail
    ? assignedEmail
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
    : [];

  useEffect(() => {
    if (receiptData.statusType !== 'success') return;
    let active = true;

    async function fetchOrder() {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('delivered_credentials, activation_details, status')
          .eq('id', receiptData.referenceId)
          .maybeSingle();

        if (error || !data || !active) return;

        /* delivered_credentials: set by pool assignment (points redemption) */
        const creds = data.delivered_credentials;
        if (creds?.includes('@') || creds?.includes('Tu cuenta asignada:')) {
          const email = creds.includes('Tu cuenta asignada:')
            ? creds.replace('Tu cuenta asignada:', '').trim()
            : creds.trim();
          setAssignedEmail(email);
        }

        /* activation_details: set by n8n after account creation (money purchase) */
        if (Array.isArray(data.activation_details) && data.activation_details.length > 0) {
          setActivationDetails(data.activation_details);
        }
        setIsLoadingEmail(false);
      } catch (err) {
        console.error('Error fetching order:', err);
        setIsLoadingEmail(false);
      }
    }

    fetchOrder();

    /* Realtime: when n8n writes to the order, update UI instantly */
    const channel = supabase
      .channel(`receipt-order-${receiptData.referenceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${receiptData.referenceId}`,
        },
        (payload) => {
          if (!active) return;
          const creds = payload.new?.delivered_credentials;
          if (creds?.includes('@') || creds?.includes('Tu cuenta asignada:')) {
            const email = creds.includes('Tu cuenta asignada:')
              ? creds.replace('Tu cuenta asignada:', '').trim()
              : creds.trim();
            setAssignedEmail(email);
          }
          if (
            Array.isArray(payload.new?.activation_details) &&
            payload.new.activation_details.length > 0
          ) {
            setActivationDetails(payload.new.activation_details);
          }
          setIsLoadingEmail(false);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [receiptData.referenceId, receiptData.statusType]);

  return (
    <div className="checkout-receipt-view">
      <div className="receipt-details-card">
        <div className="receipt-header">
          <div className="receipt-success-icon-wrapper">
            <div className={`receipt-success-circle-outer ${receiptData.statusType}`}>
              <div className={`receipt-success-circle-inner ${receiptData.statusType}`}>
                {receiptData.statusType === 'success' ? (
                  <Check size={32} />
                ) : (
                  <Clock size={32} className="pulse-icon" />
                )}
              </div>
            </div>
          </div>
        </div>

        <h3 className="receipt-title">{receiptData.title}</h3>
        <p className="receipt-subtitle">{receiptData.subtitle}</p>
        <div className="receipt-amount">{receiptData.amount}</div>
        <div className="receipt-badge-container">
          <span className={`receipt-status-badge ${receiptData.statusType}`}>
            {receiptData.statusLabel}
          </span>
        </div>

        {/* Assigned email from pool (points redemption) */}
        {isLoadingEmail && (
          <div className="receipt-loader">
            <div className="loading-spinner" />
            <span>Procesando tu pedido...</span>
          </div>
        )}

        {emailsList.length > 0 && (
          <div className="receipt-accounts-box">
            <span className="accounts-box-title">
              {emailsList.length > 1
                ? `🔑 TUS CUENTAS ASIGNADAS (${emailsList.length}):`
                : '🔑 TU CUENTA ASIGNADA:'}
            </span>
            {emailsList.map((email, idx) => {
              const isCopied = copiedIndex === idx;
              return (
                <div key={idx} style={{ marginTop: idx > 0 ? '8px' : '0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <span className="assigned-email-text">{email}</span>
                  <button
                    type="button"
                    className={`btn-copy-account${isCopied ? ' copied' : ''}`}
                    onClick={() => {
                      navigator.clipboard.writeText(email);
                      setCopiedIndex(idx);
                      setTimeout(() => setCopiedIndex(null), 2000);
                    }}
                    title="Copiar cuenta"
                  >
                    {isCopied ? <CheckCheck size={16} /> : <Copy size={16} />}
                    <span>{isCopied ? '¡Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Activation details written by n8n (money purchase) */}
        {activationDetails.length > 0 && (
          <div className="receipt-accounts-box">
            <strong>🔑 CUENTAS ACTIVADAS:</strong>
            {activationDetails.map((act, idx) => (
              <div key={idx} className="activation-detail-row" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="activation-user-name">
                  #{idx + 1}: {act.first_name} {act.last_name}
                </span>
                <div className="assigned-email-text">{act.correo || act.email}</div>
              </div>
            ))}
          </div>
        )}

        <div className="receipt-details-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', margin: '1.5rem 0' }}>
          <div className="receipt-details-row">
            <span className="receipt-detail-label">Producto</span>
            <strong className="receipt-detail-value">
              {quantity > 1 ? `${quantity}x ` : ''}
              {receiptData.productTitle}
            </strong>
          </div>
          <div className="receipt-details-row">
            <span className="receipt-detail-label">Fecha</span>
            <strong className="receipt-detail-value">{receiptData.date}</strong>
          </div>
          <div className="receipt-details-row">
            <span className="receipt-detail-label">Método de pago</span>
            <strong className="receipt-detail-value">{receiptData.method}</strong>
          </div>
          {receiptData.referenceId && (
            <div className="receipt-details-row">
              <span className="receipt-detail-label">Referencia</span>
              <strong className="receipt-detail-value monospace">
                {receiptData.referenceId}
              </strong>
            </div>
          )}
        </div>

        <div className="receipt-actions">
          {onNavigateToDashboard ? (
            <button
              type="button"
              className="receipt-action-btn primary"
              onClick={onNavigateToDashboard}
            >
              Ir a Mi Panel / Resumen
            </button>
          ) : (
            <div style={{ width: '100%', marginBottom: '12px' }}>
              <div
                style={{
                  padding: '12px 14px',
                  background: 'rgba(212, 98, 26, 0.07)',
                  border: '1.5px dashed var(--orange-base)',
                  borderRadius: '12px',
                  textAlign: 'center',
                  marginBottom: '12px',
                }}
              >
                <h4 style={{ margin: '0 0 4px 0', fontFamily: 'var(--font-display)', color: 'var(--orange-deep)', fontSize: '0.9rem' }}>
                  🎉 ¡Únete a la comunidad de JACKO™!
                </h4>
                <p style={{ margin: '0', fontSize: '0.8rem', color: 'var(--brown-dark)', opacity: 0.9 }}>
                  Crea tu cuenta para realizar misiones de la comunidad, acumular puntos y canjear premios gratis.
                </p>
              </div>
              <button
                type="button"
                className="receipt-action-btn primary"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('app-navigate', { detail: { view: 'landing' } }));
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('scroll-to-section', { detail: 'register' }));
                  }, 100);
                }}
              >
                Crear Cuenta / Registrarme
              </button>
            </div>
          )}
          <button type="button" className="receipt-action-btn secondary" onClick={onBackToCatalog}>
            {onNavigateToDashboard ? 'Volver a la Tienda' : 'Volver a Servicios'}
          </button>
        </div>
      </div>
    </div>
  );
}