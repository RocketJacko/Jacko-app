import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { HomePage } from "./HomePage";
import { ActivateOverlay } from "../components/canvas/ActivateOverlay";

export function LandingPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [isIntroFinished, setIsIntroFinished] = useState(false);

  // Redirigir al dashboard si ya hay una sesión activa
  useEffect(() => {
    if (session) {
      navigate("/dashboard", { replace: true });
    }
  }, [session, navigate]);

  // Propagar el estado de la animación globalmente para otros componentes (como ChatBot)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('skater-intro-status', { detail: { finished: isIntroFinished } }));
  }, [isIntroFinished]);

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <HomePage onComplete={(completed) => setIsIntroFinished(completed)} />
      {!session && <ActivateOverlay onStart={() => console.log("Experiencia iniciada")} />}
    </div>
  );
}

export default LandingPage;
