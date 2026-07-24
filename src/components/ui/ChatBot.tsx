import { useState, useEffect, useRef } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, HelpCircle, ExternalLink } from 'lucide-react';
import DOMPurify from 'dompurify';
import './ChatBot.css';

interface QuickReply {
  label: string;
  action: string;
  value?: string;
}

interface Message {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  buttons?: QuickReply[];
}

import type { AppView } from '../../App';

interface ChatBotProps {
  currentView: string;
  onViewChange: (view: AppView) => void;
}

// ========== FAQ DATA ==========
const faqData = [
  {
    id: 'oferta-duracion-2026',
    question: '¿Cuál es la duración de la oferta y su precio?',
    answer: 'La oferta cubre todos los meses restantes hasta el **31/12/2026** (5 meses en total) por un valor único de **$40 USD** (promedio de solo $8 USD/mes). Si contratas únicamente por un solo mes individual, el costo es de **$56 USD**.'
  },
  {
    id: 'duracion-beneficio',
    question: '¿Cuál es la duración total del beneficio de acceso?',
    answer: 'El acceso otorgado cubre la totalidad de lo que resta del año 2026 finalizando el **31/12/2026**. Las licencias están diseñadas para que los usuarios no tengan que realizar ningún pago adicional durante toda la vigencia mencionada.'
  },
  {
    id: 'acceso-inmediato',
    question: '¿El acceso es inmediato tras la compra?',
    answer: 'Sí, una vez que solicitas tus credenciales, las recibes en menos de un minuto, lo que te permite aprovechar de inmediato todo el ciclo restante de 2026.'
  },
  {
    id: 'costos-ocultos',
    question: '¿Existe algún costo oculto después de cierto tiempo?',
    answer: 'No, el acceso es totalmente transparente durante todo el periodo estipulado que finaliza al terminar el año 2026. No existen cargos sorpresa ni letras pequeñas.'
  },
  {
    id: 'precio-economico',
    question: '¿Por qué este precio es tan económico?',
    answer: 'Ofrecemos una alternativa comunitaria para que más personas puedan acceder al contenido oficial de aprendizaje sin tener que pagar el costo completo de una suscripción tradicional.'
  },
  {
    id: 'precio-final',
    question: '¿El precio publicado es el valor final?',
    answer: 'Sí. El precio que ves (**$40 USD** por los 5 meses restantes) es el valor final del plan, sin cargos ni impuestos ocultos.'
  },
  {
    id: 'que-incluye-precio',
    question: '¿Qué incluye el precio?',
    answer: 'El precio incluye el acceso completo al plan seleccionado durante todo el período contratado sin interrupciones.'
  },
  {
    id: 'costos-adicionales',
    question: '¿Hay costos adicionales después de comprar?',
    answer: 'No. Solo pagarás nuevamente si decides renovar tu acceso al finalizar el período contratado en diciembre de 2026.'
  },
  {
    id: 'comparativa-mensual',
    question: '¿Por qué pagar $56 USD al mes si puedes pagar solo $8 USD al mes?',
    answer: 'Con nuestro plan pagas **$40 USD por 5 meses** (lo que equivale a solo **$8 USD al mes**). Comparado con el plan individual oficial mensual de **$56 USD**, ahorras **$48 USD cada mes**.'
  },
  {
    id: 'comparativa-duo',
    question: '¿Nuestro plan sigue siendo más económico que el Plan Duo?',
    answer: 'Sí. En el Plan Expert Duo oficial, cada estudiante paga aproximadamente **$13 USD al mes**. Con nosotros pagas solo **$8 USD al mes** ($40 USD total por 5 meses), ahorrando **$5 USD mensuales** por persona.'
  },
  {
    id: 'comparativa-groups',
    question: '¿Nuestro plan sigue siendo más económico que el Plan Groups?',
    answer: 'Sí. Incluso en el Plan Expert Groups, donde cada persona paga aprox. **$9 USD al mes**, con nuestro plan pagas solo **$8 USD al mes** ($40 USD total por 5 meses), ahorrando en cada mes por estudiante.'
  },
  {
    id: 'que-es-codificando-ando',
    question: '¿Qué es Codificando Ando?',
    answer: 'Codificando Ando es una comunidad para personas interesadas en tecnología, desarrollo de software y automatización. Al unirte a la comunidad obtienes acceso a una membresía con diferentes beneficios, entre ellos acceso oficial a Platzi, recursos para desarrolladores y cupones.'
  },
  {
    id: 'platzi-oficial',
    question: '¿El acceso a Platzi es oficial?',
    answer: 'Sí. Todos los accesos a Platzi incluidos en nuestras membresías son 100% oficiales.'
  }
];

export function ChatBot({ currentView, onViewChange: _onViewChange }: ChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLandingIntroFinished, setIsLandingIntroFinished] = useState(true);
  const [showTeaser, setShowTeaser] = useState(false);
  const hasPlayedChimeRef = useRef(false);

  // Escuchar el estado de la animación de la landing page
  useEffect(() => {
    const handleIntroStatus = (e: Event) => {
      const customEvent = e as CustomEvent<{ finished: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.finished === 'boolean') {
        setIsLandingIntroFinished(customEvent.detail.finished);
      }
    };
    window.addEventListener('skater-intro-status', handleIntroStatus);
    return () => {
      window.removeEventListener('skater-intro-status', handleIntroStatus);
    };
  }, []);

  // Función para reproducir un chime sutil y agradable con Web Audio API (100% nativo)
  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Nota 1 (D5 - 587.33 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.05, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Nota 2 (A5 - 880 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.12);
      gain2.gain.setValueAtTime(0.07, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.45);
    } catch {
      // Ignorar de forma segura en políticas estrictas de autoplay
    }
  };

  // Timer proactivo para mostrar el teaser tras 3.5 segundos
  useEffect(() => {
    if (isOpen || hasPlayedChimeRef.current) return;

    const timer = setTimeout(() => {
      if (!isOpen && !hasPlayedChimeRef.current) {
        setShowTeaser(true);
        hasPlayedChimeRef.current = true;
        playChime();
      }
    }, 3500);

    return () => clearTimeout(timer);
  }, [isOpen]);

  // Ref tracking total messages sent for ID purity
  const messageIdCounter = useRef(1);
  const getNextId = () => {
    messageIdCounter.current += 1;
    return `msg-${messageIdCounter.current}`;
  };

  const welcomeMessage: Message = {
    id: 'welcome',
    sender: 'bot',
    text: '¡Hola! 🛹 Bienvenido a **JACKO™**. Soy tu asistente virtual de servicio. ¿En qué te puedo colaborar hoy?',
    buttons: [
      { label: '❓ Preguntas Frecuentes', action: 'show_faq' },
      { label: '📞 Soporte', action: 'show_support' },
    ],
  };

  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  const simulateBotResponse = (
    userText: string,
    botResponseText: string,
    buttons?: QuickReply[]
  ) => {
    // 1. Add user message
    const userMsg: Message = {
      id: getNextId(),
      sender: 'user',
      text: userText,
    };
    setMessages((prev) => [...prev, userMsg]);

    // 2. Start typing animation
    setIsTyping(true);

    // 3. Complete bot message after 750ms
    setTimeout(() => {
      setIsTyping(false);
      const botMsg: Message = {
        id: getNextId(),
        sender: 'bot',
        text: botResponseText,
        buttons,
      };
      setMessages((prev) => [...prev, botMsg]);
    }, 750);
  };

  const handleAction = (button: QuickReply) => {
    const { action, label, value } = button;
    switch (action) {
      case 'main_menu':
        simulateBotResponse(
          label,
          'Entendido. ¿Hay algo más en lo que te pueda ayudar del menú principal?',
          welcomeMessage.buttons
        );
        break;

      case 'show_faq':
        // Mostrar lista de preguntas (hasta 5 para no saturar)
        const faqButtons: QuickReply[] = faqData.slice(0, 5).map(faq => ({
          label: faq.question.length > 40 ? faq.question.substring(0, 37) + '...' : faq.question,
          action: 'faq_detail',
          value: faq.id
        }));

        faqButtons.push({ label: '📚 Ver todas las FAQs', action: 'show_all_faqs' });
        faqButtons.push({ label: '⬅️ Volver al Menú', action: 'main_menu' });

        simulateBotResponse(
          label,
          '📖 Aquí tienes algunas de las preguntas más frecuentes sobre la comunidad:',
          faqButtons
        );
        break;

      case 'faq_ans': {
        let answerText = '';
        if (value === 'guest_buy') {
          answerText =
            'Para comprar sin registro: entra a "Servicios", elige tu producto y dale a "Continuar con el Pago". En la siguiente pantalla introduce tu nombre y correo, y selecciona tu método de pago preferido. El servicio te llegará directamente al correo especificado.';
        } else if (value === 'payment_methods') {
          answerText =
            'Aceptamos transferencias locales por **Nequi** y **Bre-B** en Colombia, y métodos globales como **Binance Pay** (cripto) y **PayPal** para el resto de Latinoamérica y el mundo.';
        } else if (value === 'points_how') {
          answerText =
            'Los puntos se acumulan realizando actividades comunitarias desde tu panel privado (se requiere registro). Una vez acumulados suficientes puntos, puedes usarlos en el catálogo para canjear productos 100% gratis.';
        }
        simulateBotResponse(label, answerText, [
          { label: '❓ Ver otras FAQs', action: 'show_faq' },
          { label: '⬅️ Volver al Menú', action: 'main_menu' },
        ]);
        break;
      }

      case 'faq_detail': {
        // Buscar la FAQ por ID
        const faqFound = faqData.find(f => f.id === value);
        if (faqFound) {
          const answerText = faqFound.answer;
          simulateBotResponse(
            label,
            `<strong>${faqFound.question}</strong><br/><br/>${answerText}`,
            [
              { label: '❓ Otra pregunta', action: 'show_faq' },
              { label: '📚 Ver todas las FAQs', action: 'show_all_faqs' },
              { label: '⬅️ Volver al Menú', action: 'main_menu' },
            ]
          );
        } else {
          // Fallback si no se encuentra
          simulateBotResponse(
            label,
            'Lo siento, no pude encontrar esa pregunta específica. ¿Te gustaría ver otras opciones?',
            [
              { label: '❓ Ver FAQs', action: 'show_faq' },
              { label: '⬅️ Volver al Menú', action: 'main_menu' },
            ]
          );
        }
        break;
      }

      case 'show_all_faqs': {
        // Generar botones para TODAS las FAQs
        const allFaqButtons: QuickReply[] = faqData.map(faq => ({
          label: faq.question.length > 35 ? faq.question.substring(0, 32) + '...' : faq.question,
          action: 'faq_detail',
          value: faq.id
        }));

        // Agregar opción para volver
        allFaqButtons.push({ label: '⬅️ Volver al Menú', action: 'main_menu' });

        simulateBotResponse(
          label,
          `📚 Aquí tienes todas las preguntas frecuentes disponibles (${faqData.length}):`,
          allFaqButtons
        );
        break;
      }

      case 'show_support':
        simulateBotResponse(
          label,
          '¿Cómo prefieres recibir soporte? Puedes abrir un chat directo de WhatsApp o generar un ticket de soporte interno en la plataforma.',
          [
            { label: '🟢 Ir a WhatsApp de Soporte', action: 'whatsapp_redirect' },
            { label: '📝 Generar Ticket de Soporte', action: 'trigger_ticket_modal' },
            { label: '⬅️ Volver al Menú', action: 'main_menu' },
          ]
        );
        break;

      case 'trigger_ticket_modal':
        simulateBotResponse(
          label,
          'Abriendo el formulario de tickets de soporte... Por favor complétalo para registrar tu consulta.',
          [{ label: '⬅️ Volver al Menú', action: 'main_menu' }]
        );
        setTimeout(() => {
          setIsOpen(false);
          window.dispatchEvent(new CustomEvent('open-support-modal'));
        }, 800);
        break;

      case 'whatsapp_redirect':
        window.open(
          'https://wa.me/573000000000?text=Hola%20JACKO,%20necesito%20soporte%20técnico%20con%20los%20servicios',
          '_blank'
        );
        break;

      default:
        break;
    }
  };

  // Ocultar chat únicamente si la animación intro de la Landing Page aún se está ejecutando
  const isHidden = (
    currentView === '/' || currentView === 'landing' || currentView === ''
      ? !isLandingIntroFinished
      : false
  );

  if (isHidden) {
    return null;
  }

  return (
    <div className="jacko-chatbot-wrapper">
      {/* Globo Proactivo de Bienvenida / Teaser */}
      <AnimatePresence>
        {showTeaser && !isOpen && (
          <m.div
            className="chatbot-teaser-bubble"
            initial={{ opacity: 0, y: 15, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={() => {
              setIsOpen(true);
              setShowTeaser(false);
            }}
          >
            <div className="chatbot-teaser-content">
              <span className="chatbot-teaser-title">Soporte JACKO™ 👋</span>
              <p className="chatbot-teaser-text">¿Tienes alguna duda o consulta? ¡Puedo ayudarte!</p>
            </div>
            <button
              type="button"
              className="chatbot-teaser-close"
              onClick={(e) => {
                e.stopPropagation();
                setShowTeaser(false);
              }}
              aria-label="Cerrar mensaje"
            >
              <X size={12} />
            </button>
          </m.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button con animación de entrada suave */}
      <m.button
        className="chatbot-fab"
        onClick={() => {
          setIsOpen(!isOpen);
          if (showTeaser) setShowTeaser(false);
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        aria-label="Abrir chat de servicio"
      >
        <img src="/chatbot-avatar.png" alt="Soporte JACKO Bot" className="chatbot-fab-img" />
        {isOpen ? (
          <span className="chatbot-close-badge">
            <X size={14} />
          </span>
        ) : (
          <span className="chatbot-pulse-dot" />
        )}
      </m.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <m.div
            className="chatbot-window"
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            {/* Header */}
            <div className="chatbot-header">
              <div className="chatbot-header-info">
                <img src="/chatbot-avatar.png" alt="Soporte JACKO Bot" className="chatbot-header-avatar-img" />
                <h3>Soporte JACKO™</h3>
              </div>
              <button
                type="button"
                className="chatbot-close-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Cerrar chat"
              >
                <X size={18} />
              </button>
            </div>

            {/* Chat Area */}
            <div className="chatbot-body">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`chatbot-msg-row ${msg.sender === 'user' ? 'msg-user' : 'msg-bot'}`}
                >
                  {msg.sender === 'bot' && (
                    <div className="chatbot-avatar">
                      <img src="/chatbot-avatar.png" alt="Soporte JACKO Bot" className="chatbot-avatar-img" />
                    </div>
                  )}
                  <div className="chatbot-bubble-wrapper">
                    <div
                      className={`chatbot-bubble ${msg.sender === 'user' ? 'user-bubble' : 'bot-bubble'}`}
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(
                          msg.text
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\*(.*?)\*/g, '<em>$1</em>')
                            .replace(/\n/g, '<br />')
                        ),
                      }}
                    />
                    {/* Render Quick Replies inside/under the bubble */}
                    {msg.buttons && msg.buttons.length > 0 && (
                      <div className="chatbot-replies-list">
                        {msg.buttons.map((btn, index) => {
                          const isExternal = btn.action === 'whatsapp_redirect';
                          return (
                            <button
                              type="button"
                              key={index}
                              className={`chatbot-reply-btn ${isExternal ? 'external' : ''}`}
                              onClick={() => handleAction(btn)}
                            >
                              {btn.label}
                              {isExternal && (
                                <ExternalLink size={12} style={{ marginLeft: '4px' }} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Typing Loader */}
              {isTyping && (
                <div className="chatbot-msg-row msg-bot">
                  <div className="chatbot-avatar">
                    <img src="/chatbot-avatar.png" alt="Soporte JACKO Bot" className="chatbot-avatar-img" />
                  </div>
                  <div className="typing-bubble">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Footer / Input (Locked for menu options only) */}
            <div className="chatbot-footer-locked">
              <HelpCircle size={14} />
              <span>Haz clic en las opciones para interactuar.</span>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}