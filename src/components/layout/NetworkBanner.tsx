/**
 * NetworkBanner.tsx — JACKO™
 * Banner global que informa al usuario sobre el estado de la conexión.
 * Aparece en la parte inferior cuando se pierde la red y desaparece al reconectarse.
 */
import { useEffect, useState } from "react";
import { m, AnimatePresence } from "motion/react";
import { WifiOff, Wifi } from "lucide-react";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import "./NetworkBanner.css";

export function NetworkBanner() {
  const { isOnline, justReconnected } = useNetworkStatus();
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (justReconnected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowReconnected(true);
      const t = setTimeout(() => setShowReconnected(false), 3_000);
      return () => clearTimeout(t);
    }
  }, [justReconnected]);

  const isVisible = !isOnline || showReconnected;

  return (
    <AnimatePresence>
      {isVisible && (
        <m.div
          key="network-banner"
          className={`network-banner ${isOnline ? "network-banner--online" : "network-banner--offline"}`}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          role="status"
          aria-live="polite"
        >
          {isOnline ? (
            <>
              <Wifi size={16} />
              <span>Conexión restaurada</span>
            </>
          ) : (
            <>
              <WifiOff size={16} />
              <span>Sin conexión — los datos pueden estar desactualizados</span>
            </>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}
