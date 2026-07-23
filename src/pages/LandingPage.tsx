import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { HomePage } from "./HomePage";
import { ActivateOverlay } from "../components/canvas/ActivateOverlay";
import { PWAInstallPrompt } from "../components/pwa/PWAInstallPrompt";
import { OfflineIndicator } from "../components/pwa/OfflineIndicator";

export function LandingPage() {
  const { session } = useAuth();
  const [isIntroFinished, setIsIntroFinished] = useState(false);

  // Propagar el estado de la animación globalmente para otros componentes (como ChatBot)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('skater-intro-status', { detail: { finished: isIntroFinished } }));
  }, [isIntroFinished]);

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <OfflineIndicator />
      <HomePage onComplete={(completed) => setIsIntroFinished(completed)} />
      {!session && (
        <ActivateOverlay />
      )}
      <PWAInstallPrompt />
    </div>
  );
}

export default LandingPage;
