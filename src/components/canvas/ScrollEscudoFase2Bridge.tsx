import { useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { m, useScroll, useSpring, useTransform, useMotionValueEvent } from 'motion/react';
import { useImageSequence } from '../../hooks/useImageSequence';
import { getCanvasBackingDpr } from '../../lib/canvasDpr';
import { drawCover, type DrawCoverOptions } from '../../lib/drawCover';
import { RegisterPage } from '../../pages/RegisterPage';
import { Footer } from '../layout/Footer';
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

  /* Bloquear scroll de la página una vez terminada la animación 3D */
  useEffect(() => {
    if (activeOverlay !== 'skater') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeOverlay]);

  /* Notificar al App.tsx para mostrar el DockNav y activar la sección de registro al terminar */
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

    /* Si pasamos del skater y seguimos en vista skater, saltar automáticamente a registro */
    /* Pero NO si estamos transicionando programáticamente a inicio */
    if (latest >= 0.7 && activeOverlay === 'skater' && !isTransitioningToInicio.current) {
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
        const latest = smoothProgress.get();
        const skaterProgress = Math.min(1, Math.max(0, latest / 0.7));
        const frameIndex = Math.min(n - 1, Math.max(0, Math.floor(skaterProgress * n)));
        const img = images[frameIndex];
        if (img) drawCover(canvas, img, { ...escudoDraw, opaque: false });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [ready, images, n, escudoDraw, smoothProgress]);

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
            <span className="step-num-thin">01.</span>
            <h1>Registrate</h1>
          </m.div>
          <m.div className="step-item-large is-bottom col-span-12" style={{ opacity: step2Opacity }}>
            <span className="step-num-thin">02.</span>
            <h1>Disfruta</h1>
          </m.div>
        </m.div>

        <m.div className="skater-canvas-wrap" style={{ opacity: canvasOpacity }}>
          <canvas ref={canvasRef} aria-hidden />
        </m.div>

        {/* SECCIÓN DE REGISTRO */}
        <m.div
          initial={{ opacity: 0 }}
          animate={{
            opacity: activeOverlay === 'register' ? 1 : 0,
            pointerEvents: activeOverlay === 'register' ? 'auto' : 'none',
          }}
          transition={{ duration: 0.4 }}
          style={{ position: 'absolute', inset: 0, zIndex: 51, overflow: 'hidden' }}
        >
          <RegisterPage />
        </m.div>

        {/* FOOTER GLOBAL PERMANENTE */}
        <m.div
          initial={{ opacity: 0 }}
          animate={{
            opacity: activeOverlay !== 'skater' ? 1 : 0,
            pointerEvents: activeOverlay !== 'skater' ? 'auto' : 'none',
          }}
          transition={{ duration: 0.4 }}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100 }}
        >
          <Footer />
        </m.div>
      </div>
    </section>
  );
}