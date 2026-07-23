import { useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { m, useScroll, useSpring, useTransform, useMotionValueEvent } from 'motion/react';
import { useImageSequence } from '../../hooks/useImageSequence';
import { getCanvasBackingDpr } from '../../lib/canvasDpr';
import { drawCover, type DrawCoverOptions } from '../../lib/drawCover';
import { RegisterPage } from '../../pages/RegisterPage';
import { GooeyText } from '../ui/gooey-text-morphing';
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
  ariaLabel = 'Secuencia de Animación Skater',
  onComplete,
}: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Detectar si la pantalla es móvil para adaptar el tamaño de la tipografía
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const allUrls = useMemo(
    () => [...escudoFrameUrls, ...fase2FrameUrls, ...fase3FrameUrls],
    [escudoFrameUrls, fase2FrameUrls, fase3FrameUrls]
  );

  const { images, status, progress: loadProgress } = useImageSequence(allUrls);
  const ready = status === 'ready';
  const n = allUrls.length;

  // Cargar el primer frame e iniciar la precarga prioritaria de los primeros 15 frames para fluidez PWA
  const [firstFrameImg, setFirstFrameImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (allUrls.length === 0) return;

    // 1. Cargar el primer frame con máxima prioridad
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    if ('fetchPriority' in img) {
      (img as unknown as { fetchPriority: string }).fetchPriority = 'high';
    }
    img.onload = () => {
      setFirstFrameImg(img);
    };
    img.src = allUrls[0];

    // 2. Precarga silenciosa de los primeros 15 frames para acelerar la PWA
    const preloadBatch = allUrls.slice(1, 15);
    preloadBatch.forEach((url) => {
      const pImg = new Image();
      pImg.crossOrigin = 'anonymous';
      pImg.decoding = 'async';
      pImg.src = url;
    });
  }, [allUrls]);

  // Despachar evento con el progreso y estado de carga para otros componentes (ej. ActivateOverlay)
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('jacko-loading-progress', {
        detail: { progress: loadProgress, ready },
      })
    );
  }, [loadProgress, ready]);

  // Bloquear scroll del body hasta que esté ready para evitar desincronizaciones
  useEffect(() => {
    if (!ready) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
    return () => {
      document.body.classList.remove('no-scroll');
    };
  }, [ready]);

  // Dibujar el primer frame en el canvas de inmediato al cargarse
  useEffect(() => {
    if (firstFrameImg && canvasRef.current && !ready) {
      drawCover(canvasRef.current, firstFrameImg, { ...escudoDraw, opaque: false });
    }
  }, [firstFrameImg, ready, escudoDraw]);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 32,
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

  /* 3. Canvas del Skater (se desvanece de 0.70 a 0.75) */
  const canvasOpacity = useTransform(smoothProgress, [0.7, 0.75], [1, 0]);

  const [introFinished, setIntroFinished] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<'skater' | 'pricing' | 'register'>('skater');
  const isTransitioningToInicio = useRef(false);
  const isTransitioningToSkater = useRef(false);

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
        const latest = smoothProgress.get();
        const skaterProgress = Math.min(1, Math.max(0, latest / 0.7));
        const frameIndex = Math.min(n - 1, Math.max(0, Math.floor(skaterProgress * n)));
        const img = images[frameIndex];
        if (img) drawCover(canvas, img, { ...escudoDraw, opaque: false });
      } else if (firstFrameImg) {
        drawCover(canvas, firstFrameImg, { ...escudoDraw, opaque: false });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [ready, images, n, escudoDraw, smoothProgress, firstFrameImg]);

  const getLoaderText = () => {
    if (status === 'error') return 'Error al cargar';
    const pct = Math.round(loadProgress * 100);
    if (pct < 35) return `Descargando gráficos: ${pct}%`;
    if (pct < 75) return `Optimizando texturas: ${pct}%`;
    return `Decodificando 3D: ${pct}%`;
  };

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
          <m.div className="step-item-large is-bottom col-span-12" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
            <div style={{ height: isMobile ? "70px" : "120px", width: "100%", position: 'relative' }}>
              <GooeyText
                texts={["Regístrate", "Disfruta"]}
                morphTime={1.2}
                cooldownTime={1.5}
                className="w-full"
                containerClassName="justify-start"
                textClassName="font-display font-bold text-[#b84a0a] text-6xl md:text-[60pt] left-0"
              />
            </div>
          </m.div>
        </m.div>

        <m.div className="skater-canvas-wrap" style={{ opacity: canvasOpacity }}>
          <canvas ref={canvasRef} aria-hidden />
        </m.div>

        {/* SECCIÓN DE REGISTRO */}
        <m.div
          className="register-overlay-wrap"
          style={{ overflowY: activeOverlay === 'register' ? 'auto' : 'hidden' }}
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
