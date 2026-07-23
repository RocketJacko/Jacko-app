import { useState, useEffect } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { WifiOff, Wifi } from 'lucide-react';
import './OfflineIndicator.css';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      setShowRestored(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setShowRestored(true);
      const timer = setTimeout(() => setShowRestored(false), 3500);
      return () => clearTimeout(timer);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline && !showRestored) return null;

  return (
    <AnimatePresence>
      <m.div
        className={`offline-toast-bar ${isOffline ? 'is-offline' : 'is-online'}`}
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        <div className="offline-toast-content">
          {isOffline ? (
            <>
              <WifiOff size={16} className="offline-icon" />
              <span>Modo Sin Conexión — Navegando en Caché PWA</span>
            </>
          ) : (
            <>
              <Wifi size={16} className="online-icon" />
              <span>Conexión Restaurada</span>
            </>
          )}
        </div>
      </m.div>
    </AnimatePresence>
  );
}
