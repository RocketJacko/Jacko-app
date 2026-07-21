import { m } from "motion/react";
import "./LandingHeader.css";

export function LandingHeader() {
  const handleLoginRedirect = () => {
    window.dispatchEvent(new CustomEvent('open-login-form'));
    window.dispatchEvent(new CustomEvent('scroll-to-section', { detail: 'register' }));
  };

  return (
    <m.header
      className="landing-floating-header"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className="landing-logo">JACKO™</span>
      <button
        type="button"
        className="btn-landing-login"
        onClick={handleLoginRedirect}
      >
        Ingresar
      </button>
    </m.header>
  );
}
