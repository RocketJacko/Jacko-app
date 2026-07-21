import { useState, useEffect, useRef } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { MessageCircle, X, HelpCircle, ExternalLink } from 'lucide-react';
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

export function ChatBot({ currentView, onViewChange }: ChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLandingIntroFinished, setIsLandingIntroFinished] = useState(false);

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
      { label: '🛒 Comprar Servicios', action: 'show_services' },
      { label: '🔑 Registro / Ingreso', action: 'show_register' },
      { label: '❓ Preguntas Frecuentes', action: 'show_faq' },
      { label: '📞 Soporte por WhatsApp', action: 'show_support' },
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

      case 'show_services':
        simulateBotResponse(
          label,
          '¡Excelente! Puedes adquirir nuestros servicios y membresías premium **sin registrarte**. Selecciona una opción:',
          [
            { label: '⭐️ Plan Premium ($140.000 COP/mes)', action: 'buy_now', value: 'plan-premium' },
            { label: '⚡ Plan Básico ($30.000 COP/mes)', action: 'buy_now', value: 'plan-basico' },
            { label: '🛍️ Ver Todo el Catálogo', action: 'open_catalog' },
            { label: '⬅️ Volver al Menú', action: 'main_menu' },
          ]
        );
        break;

      case 'buy_now':
        if (value) {
          localStorage.setItem('jacko_trigger_checkout_slug', value);
          simulateBotResponse(
            label,
            `¡Perfecto! Redirigiéndote a la zona de pago para el **${label.split(' ($')[0]}**... Puedes completar tu compra allí como Invitado ingresando tu correo.`,
            [{ label: '⬅️ Volver al Menú', action: 'main_menu' }]
          );
          setTimeout(() => {
            onViewChange('catalogo');
            setIsOpen(false);
          }, 1200);
        }
        break;

      case 'open_catalog':
        simulateBotResponse(
          label,
          'Abriendo catálogo público de servicios... Podrás elegir y comprar cualquier producto sin registrarte.',
          [{ label: '⬅️ Volver al Menú', action: 'main_menu' }]
        );
        setTimeout(() => {
          onViewChange('catalogo');
          setIsOpen(false);
        }, 1000);
        break;

      case 'show_register':
        simulateBotResponse(
          label,
          '¡Genial! Al registrarte en **JACKO™** podrás realizar misiones divertidas, ganar puntos de fidelidad y canjearlos por premios físicos o digitales 100% gratuitos. ¿Qué deseas hacer?',
          [
            { label: '📝 Registrarme / Iniciar Sesión', action: 'go_register_section' },
            { label: '⬅️ Volver al Menú', action: 'main_menu' },
          ]
        );
        break;

      case 'go_register_section':
        simulateBotResponse(
          label,
          'Llevándote al formulario de acceso. Desliza hacia abajo o ingresa tu correo allí.',
          [{ label: '⬅️ Volver al Menú', action: 'main_menu' }]
        );
        setTimeout(() => {
          onViewChange('landing');
          setIsOpen(false);
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('scroll-to-section', { detail: 'register' }));
          }, 100);
        }, 800);
        break;

      case 'show_faq':
        simulateBotResponse(
          label,
          '¿Qué duda tienes acerca de la plataforma? Elige un tema:',
          [
            { label: '💳 ¿Cómo compro sin registrarme?', action: 'faq_ans', value: 'guest_buy' },
            { label: '💰 ¿Qué medios de pago aceptan?', action: 'faq_ans', value: 'payment_methods' },
            { label: '🎯 ¿Cómo funcionan los Puntos?', action: 'faq_ans', value: 'points_how' },
            { label: '⬅️ Volver al Menú', action: 'main_menu' },
          ]
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

  // Ocultar chat si estamos en la Landing Page y la animación del skater aún está activa
  const isHidden = currentView === '/' || currentView === 'landing' || currentView === ''
    ? !isLandingIntroFinished
    : false;

  if (isHidden) {
    return null;
  }

  return (
    <div className="jacko-chatbot-wrapper">
      {/* Floating Action Button con animación de entrada suave */}
      <m.button
        className="chatbot-fab"
        onClick={() => setIsOpen(!isOpen)}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        aria-label="Abrir chat de servicio"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
        {!isOpen && <span className="chatbot-pulse-dot" />}
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
                <span className="chatbot-header-avatar">🤖</span>
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
                      <span>🤖</span>
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
                    <span>🤖</span>
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