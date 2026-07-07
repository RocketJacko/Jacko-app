# Referencia — rangos de scroll (ScrollEscudoFase2Bridge)

| Progreso (smooth) | Efecto |
|-------------------|--------|
| 0 → 0.15 | Hero fade + `heroY` |
| 0.15 → 0.2 | Steps container fade in |
| 0.20–0.40 | Step 01 |
| 0.45–0.65 | Step 02 |
| 0.70–0.88 | Step 03 |
| 0.88 → 0.95 | Steps fade out |
| 0.95 → 1 | Canvas fade out; `onComplete(true)` |

Frame index: `Math.min(n - 1, Math.floor(latest * n))`.

## Scripts de frames

```bash
npm run sync:personaje
```

Genera `src/generated/miPersonajeFrameUrls.ts` desde `public/frames/mi personaje/`.

## CSS sticky

Clase principal: `.scroll-ef2-section` / `.scroll-ef2-sticky` en `ScrollEscudoFase2Bridge.css`. Usar `100dvh` y variables del tema en `jacko-theme.css`.
