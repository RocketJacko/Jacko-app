import { useEffect, useState } from "react";
import "./Footer.css";

export function Footer() {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
  }, []);

  // En modo PWA (standalone) no se muestra el footer de la web
  if (isStandalone) return null;

  return (
    <footer className="jacko-footer">
      <div className="footer-content">
        <div className="footer-brand">
          <span className="logo-text">JACKO™</span>
          <p className="tagline">Ideas en movimiento, estilo en acción</p>
        </div>
        <div className="footer-copyright">
          © {new Date().getFullYear()} JACKO. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
