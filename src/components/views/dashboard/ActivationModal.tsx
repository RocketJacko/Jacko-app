import React, { useState, useEffect } from 'react';
import { m } from 'motion/react';
import { X } from 'lucide-react';
import type { Order, ActivationDetail } from './types';
import './ActivationModal.css';

const PHASES = [
  { delay: 0, label: '📡 Conectando con el servidor...' },
  { delay: 4000, label: '⚙️ Configurando tu nueva cuenta...' },
  { delay: 12000, label: '💾 Registrando activación en la base de datos...' },
];

interface ActivationModalProps {
  order: Order;
  onClose: () => void;
  onConfirm: (firstName: string, lastName: string, email: string) => Promise<void>;
}

export function ActivationModal({ order, onClose, onConfirm }: ActivationModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    if (!isSubmitting) return;

    /* Schedule phase transitions */
    const timers: ReturnType<typeof setTimeout>[] = [];
    PHASES.forEach((phase, idx) => {
      if (idx === 0) return;
      timers.push(setTimeout(() => setPhaseIndex(idx), phase.delay));
    });

    return () => timers.forEach(clearTimeout);
  }, [isSubmitting]);

  const currentActivations = Array.isArray(order.activation_details)
    ? order.activation_details
    : [];
  const quantity = order.quantity || 1;
  const remaining = quantity - currentActivations.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setErrorMsg('Por favor completa todos los campos.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMsg('Por favor ingresa un correo electrónico válido.');
      return;
    }

    const emailLower = email.trim().toLowerCase();
    if (
      currentActivations.some(
        (act: ActivationDetail) => act.email && act.email.trim().toLowerCase() === emailLower
      )
    ) {
      setErrorMsg('Este correo ya ha sido registrado para activación en esta orden.');
      return;
    }

    setIsSubmitting(true);
    setPhaseIndex(0);

    try {
      await onConfirm(firstName.trim(), lastName.trim(), email.trim());
      onClose();
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : 'Error al activar el servicio.');
    } finally {
      setIsSubmitting(false);
      setPhaseIndex(0);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.currentTarget.click();
        }
      }}
      className="custom-modal-backdrop"
      onClick={onClose}
    >
      <m.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="custom-modal-card"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="custom-modal-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <h4 className="custom-modal-title">Activar cuenta</h4>
            <button
              type="button"
              className="custom-modal-close"
              onClick={onClose}
              aria-label="Cerrar modal"
              style={{ position: 'static' }}
            >
              <X size={20} />
            </button>
          </div>
          <p className="modal-product-title" style={{ margin: 0, fontSize: '0.9rem', color: 'var(--brown-dark)', fontWeight: 700, opacity: 0.8 }}>{order.products?.title || 'Producto'}</p>

          <div className="activation-slots-indicator" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
            <div className="slots-label-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: 'var(--brown-dark)', opacity: 0.8 }}>
              <span>Progreso de activación</span>
              <span>
                {currentActivations.length} de {quantity} activadas
              </span>
            </div>
            <div className="slots-progress-bar" style={{ display: 'flex', gap: '6px', height: '8px', background: 'var(--beige-light)', borderRadius: '99px', padding: '2px', overflow: 'hidden' }}>
              {Array.from({ length: quantity }).map((_, idx) => {
                let slotClass = 'pending';
                let slotTitle = `Cuenta ${idx + 1}: Pendiente`;
                if (idx < currentActivations.length) {
                  slotClass = 'activated';
                  slotTitle = `Cuenta ${idx + 1}: Activada`;
                } else if (idx === currentActivations.length) {
                  slotClass = 'current';
                  slotTitle = `Cuenta ${idx + 1}: Activar ahora`;
                }
                return (
                  <div
                    key={idx}
                    className={`progress-slot-dot ${slotClass}`}
                    title={slotTitle}
                    style={{
                      flex: 1,
                      borderRadius: '99px',
                      background: slotClass === 'activated' ? 'var(--orange-base)' : slotClass === 'current' ? 'var(--orange-light)' : 'var(--beige-dark)',
                      opacity: slotClass === 'pending' ? 0.3 : 1
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {remaining > 1 && (
          <div className="modal-activation-banner" style={{ background: 'var(--beige-light)', border: '1.5px solid var(--beige-dark)', padding: '10px 14px', borderRadius: '12px', color: 'var(--orange-deep)', fontSize: '0.8rem', fontWeight: 700, textAlign: 'center' }}>
            <span>{remaining} activaciones pendientes</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="custom-modal-field">
            <label htmlFor="first-name">Primer nombre</label>
            <input
              id="first-name"
              type="text"
              className="custom-modal-input"
              placeholder="Ej. Juan"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              disabled={isSubmitting}
              autoFocus
            />
          </div>
          <div className="custom-modal-field">
            <label htmlFor="last-name">Apellido</label>
            <input
              id="last-name"
              type="text"
              className="custom-modal-input"
              placeholder="Ej. Pérez"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>
          <div className="custom-modal-field">
            <label htmlFor="activation-email">Correo electrónico a activar</label>
            <input
              id="activation-email"
              type="email"
              className="custom-modal-input"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isSubmitting}
            />
            <span className="field-hint" style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block', marginTop: '2px' }}>
              Las credenciales serán enviadas a este correo.
            </span>
          </div>

          {errorMsg && <div className="activation-error-msg" style={{ padding: '12px 14px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.08)', border: '1.5px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: '0.85rem', fontWeight: 700 }}>{errorMsg}</div>}

          <div className="custom-modal-footer">
            <button
              type="button"
              className="btn-modal-action secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-modal-action primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="spinner-mini" style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin-anim 0.6s linear infinite', display: 'inline-block', marginRight: '6px' }}></span>
                  <span>{PHASES[phaseIndex]?.label || 'Activando...'}</span>
                </>
              ) : (
                'Activar cuenta'
              )}
            </button>
          </div>
        </form>
      </m.div>
    </div>
  );
}