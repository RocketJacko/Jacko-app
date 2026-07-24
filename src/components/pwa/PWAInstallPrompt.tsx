import { useState, useEffect } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { Download, X, Smartphone, Check } from 'lucide-react';
import './PWAInstallPrompt.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  useEffect(() => {
    // 1. Detectar si la app ya está instalada (standalone)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // 2. Detectar si se ha rechazado recientemente el banner (omitir en desarrollo)
    const dismissedTime = localStorage.getItem('jacko_pwa_prompt_dismissed');
    if (dismissedTime && !import.meta.env.DEV) {
      const hours = (Date.now() - parseInt(dismissedTime, 10)) / (1000 * 60 * 60);
      if (hours < 48) return; // No volver a molestar por 48 horas en producción
    }

    // 3. Detectar iOS (Safari mobile)
    const ua = window.navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice) {
      // Mostrar sugerencia de instalación para iOS tras 2 segundos
      const timer = setTimeout(() => setShowPrompt(true), 2000);
      return () => clearTimeout(timer);
    }

    // 4. Capturar evento nativo antes de la instalación en Android/Desktop Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    const handleForceShow = () => {
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('open-pwa-install', handleForceShow);

    // En desarrollo, mostrar tras 1.5s para facilitar verificación
    let devTimer: ReturnType<typeof setTimeout> | null = null;
    if (import.meta.env.DEV) {
      devTimer = setTimeout(() => {
        setShowPrompt(true);
      }, 1500);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('open-pwa-install', handleForceShow);
      if (devTimer) clearTimeout(devTimer);
    };
  }, []);

  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        // Vibrate not supported or disabled
      }
    }
  };

  const handleInstallClick = async () => {
    triggerHaptic();
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
          setInstallSuccess(true);
          setTimeout(() => {
            setShowPrompt(false);
            setIsInstalled(true);
          }, 2500);
        }
      } catch (err) {
        console.error('Error durante la instalación PWA:', err);
      }
      setDeferredPrompt(null);
    } else {
      // Si la API nativa antes de la instalación aún no se ha disparado (o en escritorio)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('show-toast', {
            detail: {
              message: 'Haz clic en el icono "Instalar" de la barra de direcciones o menú del navegador.',
              type: 'success',
            },
          })
        );
      }
    }
  };

  const handleDismiss = () => {
    triggerHaptic();
    setShowPrompt(false);
    try {
      localStorage.setItem('jacko_pwa_prompt_dismissed', Date.now().toString());
    } catch {
      // localStorage fallback
    }
  };

  if (isInstalled || !showPrompt) return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <m.div
          className="pwa-install-banner"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
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
                  <p className="pwa-desc">Accede directamente desde tu pantalla de inicio.</p>
                </>
              ) : (
                <>
                  <h4 className="pwa-title">Instala JACKO™ App</h4>
                  <p className="pwa-desc">
                    {isIOS
                      ? 'Toca Compartir en Safari y selecciona "Agregar a inicio"'
                      : 'Acceso instantáneo, más rápido y compatible sin red.'}
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
                    <Download size={15} /> Instalar
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
