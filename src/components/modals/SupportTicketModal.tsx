import React, { useState, useEffect } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Send, CheckCircle2, AlertTriangle, Phone, Mail, HelpCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import './SupportTicketModal.css';

interface SupportTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TopicKey = 'pago' | 'cuentas' | 'cupon' | 'otros';

const TOPIC_LABELS: Record<TopicKey, string> = {
  pago: '💳 Novedad con método de pago',
  cuentas: '👥 Adquirir más de una cuenta',
  cupon: '🎟️ Cupón de descuento',
  otros: '⚙️ Otros temas',
};

export function SupportTicketModal({ isOpen, onClose }: SupportTicketModalProps) {
  const { session } = useAuth();

  /* Form states */
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [topic, setTopic] = useState<TopicKey>('pago');
  const [message, setMessage] = useState('');

  /* Execution states */
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successTicketNum, setSuccessTicketNum] = useState<string | null>(null);

  /* Initialize and reset form fields when modal state or session changes */
  useEffect(() => {
    let active = true;
    const initializeForm = async () => {
      await Promise.resolve();
      if (!active) return;
      setErrorMsg('');
      setSuccessTicketNum(null);
      setMessage('');
      setPhone('');
      setTopic('pago');
      if (session?.user?.email) {
        setEmail(session.user.email);
      } else {
        setEmail('');
      }
    };
    initializeForm();
    return () => {
      active = false;
    };
  }, [isOpen, session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !phone.trim() || !message.trim()) {
      setErrorMsg('Por favor completa todos los campos requeridos.');
      return;
    }
    if (!email.includes('@')) {
      setErrorMsg('Por favor ingresa un correo electrónico válido.');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          topic,
          message: message.trim(),
          status: 'open',
        })
        .select('ticket_number')
        .maybeSingle();

      if (error) throw error;

      const ticketNum = data?.ticket_number
        ? `#T-${1000 + data.ticket_number}`
        : `#T-${Math.floor(1000 + Math.random() * 9000)}`;
      setSuccessTicketNum(ticketNum);
    } catch (err: unknown) {
      console.error('Error submitting support ticket:', err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al enviar el ticket. Revisa tu conexión.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="support-modal-backdrop"
          role="button"
          tabIndex={0}
          aria-label="Cerrar modal"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        >
          <m.div
            className="support-modal-panel"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          >
            {/* Modal Header */}
            <div className="support-modal-header">
              <div className="support-modal-header-info">
                <span className="support-modal-icon" />
                <h3>Generar Ticket de Soporte</h3>
              </div>
              <button
                type="button"
                className="support-modal-close"
                onClick={onClose}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="support-modal-body">
              {successTicketNum ? (
                <div className="support-modal-success">
                  <div className="support-modal-success-icon">
                    <CheckCircle2 size={48} />
                  </div>
                  <h3>¡Ticket Generado con Éxito!</h3>
                  <p className="support-modal-success-label">Tu número de ticket es:</p>
                  <div className="support-modal-ticket-number">{successTicketNum}</div>
                  <p className="support-modal-success-text">
                    Hemos registrado tu solicitud correctamente. El administrador de la comunidad
                    revisará tus datos e inquietud y se contactará contigo por correo o celular muy
                    pronto.
                  </p>
                  <button
                    type="button"
                    className="support-modal-close-btn"
                    onClick={onClose}
                  >
                    Cerrar Ventana
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="support-modal-form">
                  <p className="support-modal-intro">
                    Indícanos tus datos y la inquietud detallada. Un administrador de{' '}
                    <strong>JACKO™</strong> la atenderá a la brevedad.
                  </p>

                  {/* Email Input */}
                  <div className="support-modal-field">
                    <label htmlFor="support-email">Correo Electrónico *</label>
                    <div className="support-modal-input-wrap">
                      <Mail size={16} />
                      <input
                        type="email"
                        id="support-email"
                        placeholder="ejemplo@correo.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
                        required
                        disabled={isSubmitting || !!session?.user?.email}
                      />
                    </div>
                  </div>

                  {/* Phone Input */}
                  <div className="support-modal-field">
                    <label htmlFor="support-phone">Número Celular *</label>
                    <div className="support-modal-input-wrap">
                      <Phone size={16} />
                      <input
                        type="tel"
                        id="support-phone"
                        placeholder="Ej. +57 300 123 4567"
                        value={phone}
                        onChange={(e) => { setPhone(e.target.value); setErrorMsg(''); }}
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  {/* Topic Select */}
                  <div className="support-modal-field">
                    <label htmlFor="support-topic">Inquietud / Asunto *</label>
                    <div className="support-modal-input-wrap">
                      <HelpCircle size={16} />
                      <select
                        id="support-topic"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value as TopicKey)}
                        disabled={isSubmitting}
                      >
                        {(Object.keys(TOPIC_LABELS) as TopicKey[]).map((key) => (
                          <option key={key} value={key}>
                            {TOPIC_LABELS[key]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Message Textarea */}
                  <div className="support-modal-field">
                    <label htmlFor="support-message">Comentario / Detalles *</label>
                    <textarea
                      id="support-message"
                      rows={4}
                      placeholder="Cuéntanos con detalle tu inquietud o novedad para poder asistirte mejor..."
                      value={message}
                      onChange={(e) => { setMessage(e.target.value); setErrorMsg(''); }}
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  {errorMsg && (
                    <div className="support-modal-error">
                      <AlertTriangle size={16} />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="support-modal-submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="support-modal-spinner" style={{ borderLeftColor: 'var(--white-warm)' }} />
                        <span>Enviando ticket...</span>
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        <span>Enviar Ticket</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}