import { useState, useEffect } from "react";
import { RegisterForm } from "../components/auth/RegisterForm";
import { LoopsPricingSlider } from "../components/ui/pricing-slider-loops";
import { Footer } from "../components/layout/Footer";
import { ArrowLeft } from "lucide-react";
import "./RegisterPage.css";

export function RegisterPage() {
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [isFormRegisterMode, setIsFormRegisterMode] = useState(true);

  useEffect(() => {
    const handleOpenForm = () => {
      setIsFormRegisterMode(false); // Iniciar sesión directo si se gatilla desde otro botón de login
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
            <RegisterForm defaultIsRegister={isFormRegisterMode} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
            <LoopsPricingSlider
              onSelectFree={() => {
                window.location.href = "/checkout";
              }}
            />
          </div>
        )}
      </div>
      <Footer />
    </section>
  );
}
