/**
 * useNetworkStatus.ts — JACKO™
 *
 * Hook que expone el estado de conexión a internet del browser.
 * Cuando el usuario recupera la red, notifica para que los componentes
 * puedan recargar datos que fallaron mientras estaban offline.
 *
 * Uso:
 *   const { isOnline, justReconnected } = useNetworkStatus();
 */
import { useState, useEffect } from 'react';

interface NetworkStatus {
  /** true si el browser tiene conexión activa */
  isOnline: boolean;
  /** true durante un render después de reconectarse (para disparar recargas) */
  justReconnected: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline]             = useState(navigator.onLine);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      // Limpiar el flag de "justReconnected" después de 1 render
      reconnectTimer = setTimeout(() => setJustReconnected(false), 100);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearTimeout(reconnectTimer);
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, justReconnected };
}
