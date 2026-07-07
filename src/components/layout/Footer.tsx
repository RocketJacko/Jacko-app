import "./Footer.css";

export function Footer() {
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
