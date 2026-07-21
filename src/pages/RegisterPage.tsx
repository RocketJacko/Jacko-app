import { useState, useEffect } from "react";
import { RegisterForm } from "../components/auth/RegisterForm";
import { LoopsPricingSlider } from "../components/ui/pricing-slider-loops";
import { Footer } from "../components/layout/Footer";
import { ArrowLeft } from "lucide-react";
import "./RegisterPage.css";

export function RegisterPage() {
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  useEffect(() => {
    const handleOpenForm = () => {
      setShowRegisterForm(true);
    };

    window.addEventListener("open-login-form", handleOpenForm);
    return () => {
      window.removeEventListener("open-login-form", handleOpenForm);
    };
  }, []);

  return (
    <section id="register" className="register-section">
      <div className="register-container">
        {showRegisterForm ? (
          <div className="register-form-wrapper" style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowRegisterForm(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "transparent",
                border: "none",
                color: "var(--brown-dark)",
                fontFamily: "var(--font-body)",
                fontSize: "0.88rem",
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: "20px",
                opacity: 0.7,
                transition: "opacity 0.2s"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
            >
              <ArrowLeft size={16} /> Volver a los planes
            </button>
            <RegisterForm />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
            <LoopsPricingSlider onSelectFree={() => setShowRegisterForm(true)} />
            <button
              type="button"
              className="btn-link-login-direct"
              onClick={() => {
                setShowRegisterForm(true);
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--brown-dark)",
                textDecoration: "underline",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                fontSize: "0.95rem",
                fontWeight: 700,
                opacity: 0.8,
                transition: "opacity 0.2s"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
            >
              ¿Ya tienes una cuenta activa? Inicia sesión aquí
            </button>
          </div>
        )}
      </div>
      <Footer />
    </section>
  );
}
