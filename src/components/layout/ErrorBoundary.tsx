import { Component, type ErrorInfo, type ReactNode } from "react";
interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}
export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };
  public static getDerivedStateFromError(error: Error): State {
    /*  Actualizar el estado para que el siguiente renderizado muestre la interfaz de repuesto  */ return {
      hasError: true,
      error,
    };
  }
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Error capturado:", error, errorInfo);
  }
  private handleReload = () => {
    window.location.reload();
  };
  public render() {
    if (this.state.hasError) {
      return (
        <div style={ERROR_CONTAINER_STYLE}>
          {" "}
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>
            {" "}
            ⚠️{" "}
          </div>{" "}
          <h3
            style={{
              fontFamily: "var(--font-display), cursive",
              color: "var(--orange-deep, #b84a0a)",
              fontSize: "1.4rem",
              margin: "0 0 1rem 0",
              fontWeight: 800,
            }}
          >
            {" "}
            Algo salió mal al cargar esta sección{" "}
          </h3>{" "}
          <p>
            {" "}
            Hubo un error inesperado al renderizar el componente. Por favor,
            intenta recargar la página para reestablecer la vista.{" "}
          </p>{" "}
          <button
            type="button"
            onClick={this.handleReload}
            style={RELOAD_BUTTON_STYLE}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor =
                "var(--orange-light, #e8762a)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor =
                "var(--orange-base, #d4621a)";
              e.currentTarget.style.transform = "none";
            }}
          >
            {" "}
            Recargar Página{" "}
          </button>{" "}
        </div>
      );
    }
    return this.props.children;
  }
}

const ERROR_CONTAINER_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "3rem 2rem",
  margin: "2rem auto",
  maxWidth: "500px",
  backgroundColor: "var(--beige-light, #e8ddc8)",
  border: "2px solid var(--beige-dark, #b8a888)",
  borderRadius: "24px",
  textAlign: "center",
  boxShadow: "0 10px 30px rgba(42, 26, 10, 0.05)",
  fontFamily: "var(--font-body), sans-serif",
  color: "var(--brown-dark, #2a1a0a)",
};

const RELOAD_BUTTON_STYLE: React.CSSProperties = {
  backgroundColor: "var(--orange-base, #d4621a)",
  color: "#ffffff",
  border: "none",
  fontFamily: "var(--font-display), cursive",
  fontSize: "0.95rem",
  fontWeight: 800,
  padding: "12px 28px",
  borderRadius: "12px",
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(212, 98, 26, 0.2)",
  transition: "all 0.2s ease",
};
