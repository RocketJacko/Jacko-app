---
name: infinity-animations
description: >-
  Implements and debugs scroll-scrub canvas sequences, Motion overlays, frame
  sync, and performance for the infinity-landing JACKO project. Use when editing
  ScrollEscudoFase2Bridge, useImageSequence, canvas drawing, scroll progress hooks,
  frame URLs, or motion/react animations.
---

# Agente de animaciones — infinity-landing

## Antes de cambiar código

1. Leer [`AGENTS.md`](../../../AGENTS.md) y el componente afectado.
2. Confirmar que existen frames: `public/frames/mi personaje/` y `npm run sync:personaje` si añadiste JPG.
3. No romper `onComplete` en `ScrollEscudoFase2Bridge` (umbral ~0.95 activa `DockNav`).

## Patrones obligatorios del proyecto

### Scroll-scrub + canvas (hero)

- Motor: `useScroll` → `useSpring(scrollYProgress, { stiffness: 100, damping: 30 })` → `useMotionValueEvent` para índice de frame.
- Dibujo: [`drawCover`](../../../src/lib/drawCover.ts) con `getCanvasBackingDpr()`; resize en `useLayoutEffect`.
- Precarga: [`useImageSequence`](../../../src/hooks/useImageSequence.ts) — no sustituir por `<img>` en lista larga.
- Progreso alternativo (secciones sin Motion): [`useScrollSectionProgress`](../../../src/hooks/useScrollSectionProgress.ts) + [`useFrameScrub`](../../../src/hooks/useFrameScrub.ts).

### Motion (`motion/react`)

- Import: `import { motion, useScroll, ... } from 'motion/react'`.
- Overlays: opacidad por rangos en `useTransform(smoothProgress, [in, out], [from, to])`.
- Variants TypeScript: usar `as const` en `type: 'spring'` y `ease: 'easeOut'` para evitar errores TS.

### Fases de frames en HomePage

- Dividir `MI_PERSONAJE_FRAME_URLS` en 3 partes iguales → `escudoFrameUrls`, `fase2FrameUrls`, `fase3FrameUrls`.
- Import requerido: `import { MI_PERSONAJE_FRAME_URLS } from '../generated/miPersonajeFrameUrls'`.

## Checklist al implementar

- [ ] Loader visible hasta `status === 'ready'`
- [ ] `prefers-reduced-motion`: respetar `--frame-section-h` / acortar tramos si ya existe en CSS
- [ ] Canvas no parpadea en resize (re-render frame actual)
- [ ] `aria-label` en `<section>`, canvas con `aria-hidden`
- [ ] Sin listeners de scroll sin `{ passive: true }` en nuevos código
- [ ] Ejecutar `npm run verify` al finalizar

## Rendimiento

- Comprimir JPG; evitar decenas de MB en `public/frames`.
- No duplicar `useMotionValueEvent` en el mismo valor sin necesidad (fusionar lógica canvas + callbacks).
- Cap DPR: [`canvasDpr.ts`](../../../src/lib/canvasDpr.ts).

## Referencia detallada

Ver [reference.md](reference.md) para rangos de progreso del hero y variables CSS.
