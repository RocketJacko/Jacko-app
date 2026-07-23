import { useEffect, useState } from "react";
import { m, AnimatePresence } from "motion/react";
import { TextType } from "../ui/TextType";
import "./ActivateOverlay.css";

const STEPS = [
  {
    id: 0,
    title: undefined,
    desc: "Descubre los beneficios exclusivos de ser parte de nuestra élite.",
  },
  {
    id: 1,
    title: "1 AÑO DE PLATZI",
    desc: "Beneficios premium diseñados para la élite del desarrollo en Latinoamérica.",
  },
  {
    id: 2,
    title: "REFERIDOS",
    desc: "Tu influencia tiene valor. Gana comisiones reales hoy mismo.",
  },
  {
    id: 3,
    title: "N8N POWER",
    desc: "Puntos exclusivos para potenciar tus flujos de trabajo automatizados.",
  },
  {
    id: 4,
    title: "BIBLIO DEV",
    desc: "Libros de software exclusivos para tu formación profesional.",
  },
  {
    id: 5,
    title: "COMUNIDAD",
    desc: "Únete al ecosistema más exclusivo y comienza tu viaje hoy.",
  },
];

export function ActivateOverlay({ onStart }: { onStart?: () => void }) {
  const [show, setShow] = useState(true);
  const [ready, setReady] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const totalSteps = STEPS.length;
  const isLastStep = currentStep === totalSteps - 1;

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

  useEffect(() => {
    const handleProgress = (e: Event) => {
      const { ready: r } = (e as CustomEvent).detail;
      setReady(r);
    };
    window.addEventListener('jacko-loading-progress', handleProgress);
    return () => {
      window.removeEventListener('jacko-loading-progress', handleProgress);
    };
  }, []);

  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        // Haptic feedback not supported
      }
    }
  };

  const handleNext = () => {
    triggerHaptic();
    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    triggerHaptic();
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const activeStepData = STEPS[currentStep];

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
              <h2>
                <TextType
                  text="¡Actívate Ya!"
                  as="span"
                  typingSpeed={120}
                  loop={false}
                  showCursor={false}
                />
              </h2>

              {/* Dynamic Content Area */}
              <div className="activate-step-container">
                <AnimatePresence mode="wait">
                  <m.div
                    key={currentStep}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="activate-step-content"
                  >
                    {activeStepData.title && (
                      <h3 className="activate-step-title">{activeStepData.title}</h3>
                    )}
                    <p className="activate-step-desc">{activeStepData.desc}</p>
                  </m.div>
                </AnimatePresence>
              </div>

              {/* Footer Controls */}
              <div className="activate-controls">
                <div className="activate-nav">
                  <button
                    type="button"
                    className={`activate-nav-arrow ${currentStep === 0 ? "hidden-arrow" : ""}`}
                    onClick={handlePrev}
                    aria-label="Paso anterior"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  </button>

                  {!isLastStep ? (
                    <button
                      type="button"
                      className="activate-nav-arrow"
                      onClick={handleNext}
                      aria-label="Paso siguiente"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                  ) : (
                    <div className="activate-nav-arrow-placeholder" />
                  )}
                </div>

                {/* Final Action Button */}
                <div className="activate-action-wrapper">
                  {isLastStep && (
                    <m.button
                      className="activate-btn"
                      disabled={!ready}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={ready ? { scale: 1.05 } : undefined}
                      whileTap={ready ? { scale: 0.95 } : undefined}
                      style={!ready ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                      onClick={() => {
                        setShow(false);
                        onStart?.();
                      }}
                    >
                      {ready ? "Comenzar" : "Cargando..."}
                    </m.button>
                  )}
                </div>
              </div>

            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

