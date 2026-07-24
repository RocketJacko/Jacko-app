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

    // 2. Limpiar bloqueo previo para asegurar visibilidad inmediata en pruebas
    localStorage.removeItem('jacko_pwa_prompt_dismissed');

    // 3. Detectar iOS (Safari mobile)
    const ua = window.navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice) {
      // Mostrar sugerencia de instalación para iOS tras 4 segundos
      const timer = setTimeout(() => setShowPrompt(true), 4000);
      return () => clearTimeout(timer);
    }

    // 4. Capturar evento nativo antes de la instalación en Android/Desktop Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    // Forzar visibilidad si el navegador permite la instalación o para pruebas
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 1500);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
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
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setInstallSuccess(true);
      setTimeout(() => {
        setShowPrompt(false);
        setIsInstalled(true);
      }, 2500);
    }
    setDeferredPrompt(null);
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
