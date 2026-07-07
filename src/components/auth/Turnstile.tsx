import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileProps {
  sitekey: string;
  onSuccess: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

export function Turnstile({
  sitekey,
  onSuccess,
  onExpire,
  onError,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // 1. Guardar callbacks en refs para evitar re-creación del widget por cambios en funciones inline
  const onSuccessRef = useRef(onSuccess);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
  }, [onSuccess, onExpire, onError]);

  useEffect(() => {
    // 1. Cargar script de Turnstile si no se ha cargado previamente
    if (!document.getElementById("cloudflare-turnstile-script")) {
      const script = document.createElement("script");
      script.id = "cloudflare-turnstile-script";
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    let active = true;

    // 2. Inicializar el Widget
    const initializeWidget = () => {
      if (!active || !containerRef.current || !window.turnstile) return;

      try {
        if (widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current);
        }

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey,
          callback: (token) => {
            if (active) onSuccessRef.current(token);
          },
          "expired-callback": () => {
            if (active && onExpireRef.current) onExpireRef.current();
          },
          "error-callback": () => {
            if (active && onErrorRef.current) onErrorRef.current();
          },
          theme: "light",
        });
      } catch (err) {
        console.error("Error al renderizar Cloudflare Turnstile:", err);
      }
    };

    // 3. Esperar a que el script global esté disponible en window
    if (window.turnstile) {
      initializeWidget();
    } else {
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          initializeWidget();
        }
      }, 100);

      return () => {
        active = false;
        clearInterval(interval);
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      };
    }

    return () => {
      active = false;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [sitekey]); // IMPORTANTE: Solo re-renderizar el widget si la clave cambia!

  return <div ref={containerRef} className="turnstile-widget-container" />;
}
