import React, { useState, useEffect } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Send, CheckCircle2, AlertTriangle, Phone, Mail, HelpCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

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

    const lastSubmit = localStorage.getItem('last_support_ticket_submit');
    if (lastSubmit) {
      const timePassed = Date.now() - parseInt(lastSubmit, 10);
      const cooldownPeriod = 5 * 60 * 1000; // 5 minutes
      if (timePassed < cooldownPeriod) {
        const minutesLeft = Math.ceil((cooldownPeriod - timePassed) / 60000);
        setErrorMsg(`Has enviado un ticket recientemente. Por favor espera ${minutesLeft} minuto(s) antes de enviar otro.`);
        return;
      }
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

      // Set cooldown on successful submit
      localStorage.setItem('last_support_ticket_submit', Date.now().toString());

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
          className="custom-modal-backdrop"
          role="button"
          tabIndex={0}
          aria-label="Cerrar modal"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        >
          <m.div
            className="custom-modal-card"
            style={{ maxWidth: '460px' }}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          >
            {/* Modal Header */}
            <div className="custom-modal-header">
              <div className="support-modal-header-info" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="support-modal-icon" />
                <h4 className="custom-modal-title">Generar Ticket de Soporte</h4>
              </div>
              <button
                type="button"
                className="custom-modal-close"
                onClick={onClose}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="custom-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {successTicketNum ? (
                <div className="support-modal-success" style={{ textAlign: 'center', padding: '10px 0' }}>
                  <div className="support-modal-success-icon" style={{ color: 'var(--orange-base)', marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
                    <CheckCircle2 size={48} />
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--brown-dark)', margin: '0 0 12px 0' }}>¡Ticket Generado con Éxito!</h3>
                  <p className="support-modal-success-label" style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--beige-dark)', textTransform: 'uppercase', margin: '0 0 6px 0' }}>Tu número de ticket es:</p>
                  <div className="support-modal-ticket-number" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--orange-deep)', backgroundColor: 'var(--white-warm)', border: '2px dashed var(--orange-base)', padding: '10px 24px', borderRadius: '12px', display: 'inline-block', marginBottom: '20px' }}>{successTicketNum}</div>
                  <p className="support-modal-success-text" style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--brown-dark)', opacity: 0.9, margin: '0 0 24px 0' }}>
                    Hemos registrado tu solicitud correctamente. El administrador de la comunidad
                    revisará tus datos e inquietud y se contactará contigo por correo o celular muy
                    pronto.
                  </p>
                  <button
                    type="button"
                    className="btn-modal-action secondary"
                    style={{ width: '100%' }}
                    onClick={onClose}
                  >
                    Cerrar Ventana
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p className="support-modal-intro" style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--brown-dark)', opacity: 0.85 }}>
                    Indícanos tus datos y la inquietud detallada. Un administrador de{' '}
                    <strong>JACKO™</strong> la atenderá a la brevedad.
                  </p>

                  {/* Email Input */}
                  <div className="custom-modal-field">
                    <label htmlFor="support-email">Correo Electrónico *</label>
                    <div className="support-modal-input-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Mail size={16} style={{ position: 'absolute', left: '14px', color: 'var(--beige-dark)' }} />
                      <input
                        type="email"
                        id="support-email"
                        className="custom-modal-input"
                        style={{ paddingLeft: '40px' }}
                        placeholder="ejemplo@correo.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
                        required
                        disabled={isSubmitting || !!session?.user?.email}
                      />
                    </div>
                  </div>

                  {/* Phone Input */}
                  <div className="custom-modal-field">
                    <label htmlFor="support-phone">Número Celular *</label>
                    <div className="support-modal-input-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Phone size={16} style={{ position: 'absolute', left: '14px', color: 'var(--beige-dark)' }} />
                      <input
                        type="tel"
                        id="support-phone"
                        className="custom-modal-input"
                        style={{ paddingLeft: '40px' }}
                        placeholder="Ej. +57 300 123 4567"
                        value={phone}
                        onChange={(e) => { setPhone(e.target.value); setErrorMsg(''); }}
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  {/* Topic Select */}
                  <div className="custom-modal-field">
                    <label htmlFor="support-topic">Inquietud / Asunto *</label>
                    <div className="support-modal-input-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <HelpCircle size={16} style={{ position: 'absolute', left: '14px', color: 'var(--beige-dark)', pointerEvents: 'none', zIndex: 10 }} />
                      <select
                        id="support-topic"
                        className="custom-modal-input"
                        style={{
                          paddingLeft: '40px',
                          cursor: 'pointer',
                          appearance: 'none',
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%232A1A0A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 14px center',
                        }}
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
                  <div className="custom-modal-field">
                    <label htmlFor="support-message">Comentario / Detalles *</label>
                    <textarea
                      id="support-message"
                      className="custom-modal-input"
                      style={{ resize: 'vertical', minHeight: '100px' }}
                      rows={4}
                      placeholder="Cuéntanos con detalle tu inquietud o novedad para poder asistirte mejor..."
                      value={message}
                      onChange={(e) => { setMessage(e.target.value); setErrorMsg(''); }}
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  {errorMsg && (
                    <div className="support-modal-error" style={{ padding: '12px 14px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 700, backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1.5px solid rgba(239, 68, 68, 0.3)', color: '#ef4444' }}>
                      <AlertTriangle size={16} />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn-modal-action primary"
                    style={{ width: '100%', marginTop: '8px' }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="spinner-mini" style={{ borderLeftColor: 'var(--white-warm)', width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '50%', animation: 'spin-anim 1s linear infinite' }} />
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