import { useState, useEffect, useRef } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { Download, X, Smartphone, Check } from 'lucide-react';
import './PWAInstallPrompt.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    deferredPWAInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // 1. Detectar si la app ya está instalada (standalone)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // 2. Detectar si se ha rechazado recientemente el banner
    const dismissedTime = localStorage.getItem('jacko_pwa_prompt_dismissed');
    if (dismissedTime) {
      const hours = (Date.now() - parseInt(dismissedTime, 10)) / (1000 * 60 * 60);
      if (hours < 24) return;
    }

    // 3. Detectar iOS
    const ua = window.navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // Si el evento de instalación ya fue capturado previamente
    if (window.deferredPWAInstallPrompt) {
      setDeferredPrompt(window.deferredPWAInstallPrompt);
      deferredPromptRef.current = window.deferredPWAInstallPrompt;
      setShowPrompt(true);
    }

    // 4. Capturar evento nativo antes de la instalación en Android/Desktop Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.deferredPWAInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
      deferredPromptRef.current = promptEvent;
      setTimeout(() => setShowPrompt(true), 1500);
    };

    const handleTriggerInstall = async () => {
      if (deferredPromptRef.current) {
        try {
          await deferredPromptRef.current.prompt();
          const { outcome } = await deferredPromptRef.current.userChoice;
          if (outcome === 'accepted') {
            setInstallSuccess(true);
            setTimeout(() => {
              setShowPrompt(false);
              setIsInstalled(true);
            }, 2000);
          }
          setDeferredPrompt(null);
          deferredPromptRef.current = null;
        } catch (err) {
          console.error('[PWAInstallPrompt] Direct install error:', err);
        }
      } else {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('trigger-pwa-install', handleTriggerInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('trigger-pwa-install', handleTriggerInstall);
    };
  }, []);

  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        // Vibrate not supported
      }
    }
  };

  const handleInstallClick = async () => {
    triggerHaptic();
    const promptEvent = deferredPrompt || deferredPromptRef.current || window.deferredPWAInstallPrompt;
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;

        if (outcome === 'accepted') {
          setInstallSuccess(true);
          setTimeout(() => {
            setShowPrompt(false);
            setIsInstalled(true);
          }, 2000);
        }
        setDeferredPrompt(null);
        deferredPromptRef.current = null;
        window.deferredPWAInstallPrompt = null;
      } catch (err) {
        console.error('[PWAInstallPrompt] Prompt error:', err);
      }
    } else {
      setInstallSuccess(true);
      setTimeout(() => {
        setShowPrompt(false);
      }, 2000);
    }
  };

  const handleDismiss = () => {
    triggerHaptic();
    setShowPrompt(false);
    try {
      localStorage.setItem('jacko_pwa_prompt_dismissed', Date.now().toString());
    } catch {
      // Fallback
    }
  };

  if (isInstalled || !showPrompt) return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <m.div
          className="pwa-install-banner"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        >
          <div className="pwa-install-content">
            <div className="pwa-app-icon">
              <Smartphone className="icon-phone" />
            </div>

            <div className="pwa-text-info">
              {installSuccess ? (
                <>
                  <h4 className="pwa-title success-text">
                    <Check className="check-icon" /> ¡JACKO™ Instalado!
                  </h4>
                  <p className="pwa-desc">Accede directo desde tu pantalla de inicio.</p>
                </>
              ) : (
                <>
                  <h4 className="pwa-title">Instala JACKO™ App</h4>
                  <p className="pwa-desc">
                    {isIOS
                      ? 'Toca Compartir en Safari y selecciona "Agregar a inicio"'
                      : 'Acceso instantáneo con 1 solo clic en tu pantalla de inicio.'}
                  </p>
                </>
              )}
            </div>

            {!installSuccess && (
              <div className="pwa-actions">
                {!isIOS && (
                  <button
                    type="button"
                    className="pwa-install-btn"
                    onClick={handleInstallClick}
                  >
                    <Download size={16} /> Instalar
                  </button>
                )}
                <button
                  type="button"
                  className="pwa-close-btn"
                  onClick={handleDismiss}
                  aria-label="Cerrar aviso"
                >
                  <X size={18} />
                </button>
              </div>
            )}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
