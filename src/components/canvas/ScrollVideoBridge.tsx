import { useState, useRef, useEffect, useCallback } from 'react';
import { m, useScroll, useSpring, useTransform, useMotionValueEvent } from 'motion/react';
import { RegisterPage } from '../../pages/RegisterPage';
import VaporizeTextCycle, { Tag } from '../ui/vapour-text-effect';
import './ScrollEscudoFase2Bridge.css';

type Props = {
  id?: string;
  videoUrl: string;
  ariaLabel?: string;
  onComplete?: (completed: boolean) => void;
};

export function ScrollVideoBridge({
  id,
  videoUrl,
  ariaLabel = 'Secuencia del Skater (Video)',
  onComplete,
}: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  const [ready, setReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

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

  /* 3. Video del Skater (se desvanece de 0.70 a 0.75) */
  const videoOpacity = useTransform(smoothProgress, [0.7, 0.75], [1, 0]);

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

  /* Bloquear scroll en desktop hasta que el video esté listo */
  useEffect(() => {
    if (!ready && !isMobileMode) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
    return () => {
      document.body.classList.remove('no-scroll');
    };
  }, [ready, isMobileMode]);

  /* En mobile-register: el body scrollea normalmente (sin overflow bloqueado) */
  const isMobileRegister = isMobileMode && activeOverlay === 'register';

  useEffect(() => {
    if (isMobileRegister) {
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

  /* ── Mobile tap-to-advance: en mobile NO usamos scroll-drive.
     El usuario ve la animación de video y hace tap para avanzar. ── */
  const [mobileTapPhase, setMobileTapPhase] = useState<'idle' | 'animating' | 'done'>('idle');
  const [mobileAnimProgress, setMobileAnimProgress] = useState(0);

  const runMobileAnimation = useCallback(() => {
    const video = videoRef.current;
    if (!video || !ready) {
      setActiveOverlay('register');
      return;
    }
    setMobileTapPhase('animating');
    video.currentTime = 0;
    video.play().catch(() => {
      // Si falla play por autoplay policy, avanzar directo
      setMobileTapPhase('done');
      setActiveOverlay('register');
      onComplete?.(true);
    });

    const onTimeUpdate = () => {
      if (video.duration) {
        setMobileAnimProgress(video.currentTime / video.duration);
      }
    };
    video.addEventListener('timeupdate', onTimeUpdate);

    video.onended = () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      setMobileTapPhase('done');
      setActiveOverlay('register');
      onComplete?.(true);
    };
  }, [ready, onComplete]);

  /* Escuchar el evento del ActivateOverlay para iniciar la animación mobile */
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

    if (latest < 0.1) {
      isTransitioningToInicio.current = false;
    }

    if (latest < 0.69) {
      isTransitioningToSkater.current = false;
    }

    if (latest >= 0.7 && activeOverlay === 'skater' && !isTransitioningToInicio.current && !isTransitioningToSkater.current) {
      setActiveOverlay('register');
    }
  });

  /* Sincronización del Video currentTime con scroll en Escritorio */
  useMotionValueEvent(smoothProgress, 'change', (latest) => {
    if (isMobileMode || !ready || !videoRef.current) return;
    const video = videoRef.current;
    if (video.duration) {
      const videoProgress = Math.min(1, Math.max(0, latest / 0.7));
      video.currentTime = videoProgress * video.duration;
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

  /* Carga del video y porcentaje de buffering */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleProgress = () => {
      if (video.buffered.length > 0 && video.duration) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const percent = bufferedEnd / video.duration;
        setLoadProgress(percent);
        if (percent >= 0.99) {
          setReady(true);
        }
      }
    };

    const handleCanPlay = () => {
      setLoadProgress(1);
      setReady(true);
    };

    video.addEventListener('progress', handleProgress);
    video.addEventListener('canplaythrough', handleCanPlay);
    return () => {
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('canplaythrough', handleCanPlay);
    };
  }, []);

  const getLoaderText = () => {
    const pct = Math.round(loadProgress * 100);
    if (pct < 35) return `Descargando video: ${pct}%`;
    if (pct < 75) return `Preparando streaming: ${pct}%`;
    return `Listo para reproducir: ${pct}%`;
  };

  if (isMobileMode) {
    if (isMobileRegister) {
      return (
        <section id={id} className="scroll-ef2-section--mobile-register" aria-label={ariaLabel}>
          <RegisterPage />
        </section>
      );
    }

    return (
      <section id={id} className="scroll-ef2-mobile-canvas-section" aria-label={ariaLabel}>
        <video
          ref={videoRef}
          src={videoUrl}
          className="mobile-canvas-fullscreen"
          style={{ objectFit: 'cover' }}
          playsInline
          muted
          preload="auto"
        />

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

        {mobileTapPhase === 'idle' && (
          <button
            className="mobile-tap-advance-btn"
            disabled={!ready}
            onClick={runMobileAnimation}
            aria-label="Ver video y continuar al registro"
          >
            <span>{ready ? 'Continuar' : getLoaderText()}</span>
            {ready && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            )}
          </button>
        )}

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
              <div className="loader-text">
                {getLoaderText()}
              </div>
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${loadProgress * 100}%` }} />
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

        <m.div className="skater-canvas-wrap" style={{ opacity: videoOpacity }}>
          <video
            ref={videoRef}
            src={videoUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            playsInline
            muted
            preload="auto"
          />
        </m.div>

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
