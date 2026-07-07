import { useEffect, useState } from "react";
import { m, AnimatePresence } from "motion/react";
import "./ActivateOverlay.css";

export function ActivateOverlay({ onStart }: { onStart?: () => void }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (show) {
      document.body.classList.add("no-scroll");
    } else {
      document.body.classList.remove("no-scroll");
    }
    return () => {
      document.body.classList.remove("no-scroll");
    };
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <m.div
          className="activate-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <m.div
            className="activate-card"
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{
              scale: 1,
              opacity: 1,
              y: 0,
              transition: { type: "spring", stiffness: 300, damping: 25 },
            }}
            exit={{ scale: 0.8, opacity: 0, y: 10 }}
          >
            <div className="rotating-border"></div>
            <div className="activate-content">
              <div className="jacko-tag small">JACKO™</div>
              <h2>¡Actívate Ya!</h2>
              <p>Sigue los pasos.</p>
              <m.button
                className="activate-btn"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setShow(false);
                  onStart?.();
                }}
              >
                Comenzar
              </m.button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
