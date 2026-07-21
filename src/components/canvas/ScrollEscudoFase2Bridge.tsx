import { useLayoutEffect, useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { m, useScroll, useSpring, useTransform, useMotionValueEvent } from 'motion/react';
import { useImageSequence } from '../../hooks/useImageSequence';
import { getCanvasBackingDpr } from '../../lib/canvasDpr';
import { drawCover, type DrawCoverOptions } from '../../lib/drawCover';
import { RegisterPage } from '../../pages/RegisterPage';
import VaporizeTextCycle, { Tag } from '../ui/vapour-text-effect';
import './ScrollEscudoFase2Bridge.css';

type Props = {
  id?: string;
  escudoFrameUrls: readonly string[];
  fase2FrameUrls: readonly string[];
  fase3FrameUrls?: readonly string[];
  escudoDraw?: DrawCoverOptions;
  fase3Draw?: DrawCoverOptions;
  ariaLabel?: string;
  onComplete?: (completed: boolean) => void;
};

export function ScrollEscudoFase2Bridge({
  id,
  escudoFrameUrls,
  fase2FrameUrls,
  fase3FrameUrls = [],
  escudoDraw,
  ariaLabel = 'Secuencia del Skater',
  onComplete,
}: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Detectar si la pantalla es móvil para adaptar el tamaño de la tipografía de Vaporize
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const vaporizeFontSize = isMobile ? "40px" : "80px";

  const allUrls = useMemo(
    () => [...escudoFrameUrls, ...fase2FrameUrls, ...fase3FrameUrls],
    [escudoFrameUrls, fase2FrameUrls, fase3FrameUrls]
  );

  const { images, status, progress: loadProgress } = useImageSequence(allUrls);
  const ready = status === 'ready';
  const n = allUrls.length;

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  /* 1. Textos iniciales y hero (fades out early) */
  const heroOpacity = useTransform(smoothProgress, [0, 0.12], [1, 0]);
  const heroY = useTransform(smoothProgress, [0, 0.12], [0, -100]);

  /* 2. Pasos del skater (completados antes de 0.70) */
  const stepsContainerOpacity = useTransform(
    smoothProgress,
    [0.1, 0.15, 0.65, 0.7],
    [0, 1, 1, 0]
  );
  const step1Opacity = useTransform(smoothProgress, [0.15, 0.3, 0.45], [0, 1, 0]);
  const step2Opacity = useTransform(smoothProgress, [0.48, 0.6, 0.7], [0, 1, 0]);

  /* 3. Canvas del Skater (se desvanece de 0.70 a 0.75) */
  const canvasOpacity = useTransform(smoothProgress, [0.7, 0.75], [1, 0]);

  const [introFinished, setIntroFinished] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<'skater' | 'pricing' | 'register'>('skater');
  const isTransitioningToInicio = useRef(false);
  const isTransitioningToSkater = useRef(false);

  /* ── Mobile detection ── */
  const [isMobileMode, setIsMobileMode] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobileMode(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* En mobile-register: el body scrollea normalmente (sin overflow bloqueado) */
  const isMobileRegister = isMobileMode && activeOverlay === 'register';

  useEffect(() => {
    if (isMobileRegister) {
      // Liberar completamente el body para scroll nativo iOS/Android
      document.body.style.overflow = '';
      document.body.style.overflowX = '';
      document.body.style.overflowY = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.overflowX = '';
      document.body.style.overflowY = '';
    };
  }, [isMobileRegister]);

  /* ── Mobile tap-to-advance: en mobile NO usamos scroll-drive de 500vh.
     El usuario ve la animación completa en un solo viewport y toca para avanzar. ── */
  const [mobileTapPhase, setMobileTapPhase] = useState<'idle' | 'animating' | 'done'>('idle');
  const [mobileAnimProgress, setMobileAnimProgress] = useState(0);
  const mobileAnimFrame = useRef<number | null>(null);

  const runMobileAnimation = useCallback(() => {
    if (!canvasRef.current || !ready || images.length === 0) {
      setActiveOverlay('register');
      return;
    }
    setMobileTapPhase('animating');
    const totalFrames = n;
    const duration = 1800; // ms
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const p = Math.min(1, elapsed / duration);
      setMobileAnimProgress(p);
      const frameIndex = Math.min(totalFrames - 1, Math.floor(p * totalFrames));
      const img = images[frameIndex];
      if (img && img.complete && canvasRef.current) {
        drawCover(canvasRef.current, img, { ...escudoDraw, opaque: false });
      }
      if (p < 1) {
        mobileAnimFrame.current = requestAnimationFrame(tick);
      } else {
        setMobileTapPhase('done');
        setActiveOverlay('register');
        onComplete?.(true);
      }
    };
    mobileAnimFrame.current = requestAnimationFrame(tick);
  }, [ready, images, n, escudoDraw, onComplete]);

  useEffect(() => {
    return () => {
      if (mobileAnimFrame.current) cancelAnimationFrame(mobileAnimFrame.current);
    };
  }, []);

  /* Escuchar el evento del ActivateOverlay para iniciar la animación mobile
     directamente al pulsar "Comenzar", sin requerir tap adicional */
  useEffect(() => {
    if (!isMobileMode) return;
    const handleMobileStart = () => {
      if (mobileTapPhase === 'idle') {
        runMobileAnimation();
      }
    };
    window.addEventListener('jacko-mobile-start', handleMobileStart);
    return () => window.removeEventListener('jacko-mobile-start', handleMobileStart);
  }, [isMobileMode, mobileTapPhase, runMobileAnimation]);

  /* Notificar al App.tsx para activar la sección de registro al terminar */
  useMotionValueEvent(smoothProgress, 'change', (latest) => {
    const completed = latest > 0.7;
    if (introFinished !== completed) {
      setIntroFinished(completed);
      onComplete?.(completed);
    }

    /* Si llegamos cerca de 0, desactivamos el flag de transición a inicio */
    if (latest < 0.1) {
      isTransitioningToInicio.current = false;
    }

    /* Desactivar el flag de transición hacia arriba si el progress baja de 0.69 */
    if (latest < 0.69) {
      isTransitioningToSkater.current = false;
    }

    /* Si pasamos del skater y seguimos en vista skater, saltar automáticamente a registro */
    /* Pero NO si estamos transicionando programáticamente a inicio o de vuelta al skater */
    if (latest >= 0.7 && activeOverlay === 'skater' && !isTransitioningToInicio.current && !isTransitioningToSkater.current) {
      setActiveOverlay('register');
    }
  });

  /* Animación del Skater Canvas (se reproduce de 0.0 a 0.70 y se detiene en el final) */
  useMotionValueEvent(smoothProgress, 'change', (latest) => {
    if (!ready || !canvasRef.current || images.length === 0) return;
    const skaterProgress = Math.min(1, Math.max(0, latest / 0.7));
    const frameIndex = Math.min(n - 1, Math.max(0, Math.floor(skaterProgress * n)));
    const img = images[frameIndex];
    if (img && img.complete) {
      drawCover(canvasRef.current, img, {
        ...escudoDraw,
        opaque: false,
      });
    }
  });

  /* Escuchador de navegación de la ventana principal */
  useEffect(() => {
    const handleScrollTo = (e: Event) => {
      const section = (e as CustomEvent).detail;
      if (section === 'inicio') {
        isTransitioningToInicio.current = true;
        setActiveOverlay('skater');
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 50);
      } else if (section === 'pricing' || section === 'register') {
        isTransitioningToInicio.current = false;
        setActiveOverlay('register');
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: maxScroll, behavior: 'instant' });
      }
    };
    window.addEventListener('scroll-to-section', handleScrollTo);
    return () => window.removeEventListener('scroll-to-section', handleScrollTo);
  }, [activeOverlay]);

  useLayoutEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const dpr = getCanvasBackingDpr();

    const handleResize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      if (ready && images.length > 0) {
        if (isMobileMode) {
          // Mobile: dibujar siempre el primer frame como estado de reposo
          const img = images[0];
          if (img) drawCover(canvas, img, { ...escudoDraw, opaque: false });
        } else {
          const latest = smoothProgress.get();
          const skaterProgress = Math.min(1, Math.max(0, latest / 0.7));
          const frameIndex = Math.min(n - 1, Math.max(0, Math.floor(skaterProgress * n)));
          const img = images[frameIndex];
          if (img) drawCover(canvas, img, { ...escudoDraw, opaque: false });
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [ready, images, n, escudoDraw, smoothProgress, isMobileMode]);

  /* ── MOBILE RENDER ──
     En mobile NO usamos el modelo de 500vh scroll-drive.
     Mostramos el canvas a pantalla completa con un tap para lanzar
     la animación. Al terminar, el registro aparece en flujo normal
     del documento para que el body scrollee con el dedo. */
  if (isMobileMode) {
    if (isMobileRegister) {
      // Fase final: registro scrolleable con body nativo
      return (
        <section
          id={id}
          className="scroll-ef2-section--mobile-register"
          aria-label={ariaLabel}
        >
          <RegisterPage />
        </section>
      );
    }

    // Fase canvas: pantalla completa, tap para avanzar
    return (
      <section
        id={id}
        className="scroll-ef2-mobile-canvas-section"
        aria-label={ariaLabel}
      >
        {/* Canvas fullscreen */}
        <canvas
          ref={canvasRef}
          className="mobile-canvas-fullscreen"
          aria-hidden
        />

        {/* Hero overlay */}
        {mobileTapPhase === 'idle' && (
          <div className="mobile-hero-overlay">
            <div className="hero-eyebrow">
              <span className="dot" />JACKO™ — Actívate Ya
            </div>
            <h1>
              Ideas en<br />
              movimiento,<br />
              <span>estilo en acción</span>
            </h1>
          </div>
        )}

        {/* Botón tap-to-advance */}
        {mobileTapPhase === 'idle' && (
          <button
            className="mobile-tap-advance-btn"
            onClick={runMobileAnimation}
            aria-label="Ver animación y continuar al registro"
          >
            <span>Continuar</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        )}

        {/* Indicador de animación en curso */}
        {mobileTapPhase === 'animating' && (
          <div className="mobile-anim-progress" aria-live="polite">
            <div className="mobile-anim-bar" style={{ width: `${mobileAnimProgress * 100}%` }} />
          </div>
        )}
      </section>
    );
  }

  return (
    <section id={id} ref={sectionRef} className="scroll-ef2-section" aria-label={ariaLabel}>
      <div className="scroll-ef2-sticky">
        {!ready && (
          <div className="jacko-loader-overlay">
            <div className="loader-content">
              <div className="jacko-logo-loader">JACKO™</div>
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${loadProgress * 100}%` }} />
              </div>
              <div className="loader-text">
                {status === 'error'
                  ? 'Error al cargar'
                  : `Cargando experiencia... ${Math.round(loadProgress * 100)}%`}
              </div>
            </div>
          </div>
        )}

        <m.div className="skater-hero-overlay grid-base" style={{ opacity: heroOpacity, y: heroY }}>
          <div className="col-span-12">
            <div className="hero-eyebrow">
              <span className="dot" />JACKO™ — Actívate Ya
            </div>
            <h1>
              Ideas en movimiento,<br />
              <span>estilo en acción</span>
            </h1>
          </div>
        </m.div>

        <m.div className="skater-steps-overlay grid-base" style={{ opacity: stepsContainerOpacity }}>
          <m.div className="step-item-large is-bottom col-span-12" style={{ opacity: step1Opacity }}>
            <div style={{ height: isMobile ? "45px" : "90px", width: "100%" }}>
              <VaporizeTextCycle
                texts={["Registrate"]}
                font={{
                  fontFamily: "'Fredoka One', cursive",
                  fontSize: vaporizeFontSize,
                  fontWeight: 400
                }}
                color="rgb(184, 74, 10)"
                spread={9}
                density={9}
                animation={{
                  vaporizeDuration: 1.6,
                  fadeInDuration: 1.0,
                  waitDuration: 0.8
                }}
                direction="left-to-right"
                alignment="left"
                tag={Tag.H1}
              />
            </div>
          </m.div>
          <m.div className="step-item-large is-bottom col-span-12" style={{ opacity: step2Opacity }}>
            <div style={{ height: isMobile ? "45px" : "90px", width: "100%" }}>
              <VaporizeTextCycle
                texts={["Disfruta"]}
                font={{
                  fontFamily: "'Fredoka One', cursive",
                  fontSize: vaporizeFontSize,
                  fontWeight: 400
                }}
                color="rgb(184, 74, 10)"
                spread={9}
                density={9}
                animation={{
                  vaporizeDuration: 1.6,
                  fadeInDuration: 1.0,
                  waitDuration: 0.8
                }}
                direction="left-to-right"
                alignment="left"
                tag={Tag.H1}
              />
            </div>
          </m.div>
        </m.div>

        <m.div className="skater-canvas-wrap" style={{ opacity: canvasOpacity }}>
          <canvas ref={canvasRef} aria-hidden />
        </m.div>

        {/* SECCIÓN DE REGISTRO — desktop/tablet: overlay dentro del sticky */}
        <m.div
          className="register-overlay-wrap"
          initial={{ opacity: 0 }}
          animate={{
            opacity: activeOverlay === 'register' ? 1 : 0,
            pointerEvents: activeOverlay === 'register' ? 'auto' : 'none',
          }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <RegisterPage />
        </m.div>
      </div>
    </section>
  );
}
