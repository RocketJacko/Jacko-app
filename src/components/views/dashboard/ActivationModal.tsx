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
      className="activation-modal-overlay"
      onClick={onClose}
    >
      <m.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="activation-modal-card"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close-btn"
          onClick={onClose}
          aria-label="Cerrar modal"
        >
          <X size={20} />
        </button>

        <div className="modal-header">
          <h3 className="modal-title">Activar cuenta</h3>
          <p className="modal-product-title">{order.products?.title || 'Producto'}</p>

          <div className="activation-slots-indicator">
            <div className="slots-label-row">
              <span>Progreso de activación</span>
              <span>
                {currentActivations.length} de {quantity} activadas
              </span>
            </div>
            <div className="slots-progress-bar">
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
                  />
                );
              })}
            </div>
          </div>
        </div>

        {remaining > 1 && (
          <div className="modal-activation-banner">
            <span>{remaining} activaciones pendientes</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="activation-form">
          <div className="form-group">
            <label htmlFor="first-name">Primer nombre</label>
            <input
              id="first-name"
              type="text"
              placeholder="Ej. Juan"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              disabled={isSubmitting}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="last-name">Apellido</label>
            <input
              id="last-name"
              type="text"
              placeholder="Ej. Pérez"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>
          <div className="form-group">
            <label htmlFor="activation-email">Correo electrónico a activar</label>
            <input
              id="activation-email"
              type="email"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isSubmitting}
            />
            <span className="field-hint">
              Las credenciales serán enviadas a este correo.
            </span>
          </div>

          {errorMsg && <div className="activation-error-msg">{errorMsg}</div>}

          <div className="modal-footer">
            <button
              type="button"
              className="btn-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="btn-spinner"></span>
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