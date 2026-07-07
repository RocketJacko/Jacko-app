# Infinity landing (Vite + React + TypeScript)

Landing con **scroll-scrub** sobre canvas. Si hay fase 2, [`ScrollEscudoFase2Bridge`](src/components/ScrollEscudoFase2Bridge.tsx) une **escudo + fase 2** en **una sola sección de scroll**: primero solo el escudo (pantalla completa; canvas a viewport sin velo en sección 1; velo lateral opcional solo en paneles fase 2 en [`frameCanvasEdgeFeather.css`](src/styles/frameCanvasEdgeFeather.css) + zoom/fade final ~0.82→1 como en [`V1 infinity-final.html`](../V1%20infinity-final.html)); al **terminar** el tramo del escudo entra fase 2: la lista de JPG se **divide en dos mitades** según la cantidad ([`splitFase2Frames`](src/lib/splitFase2Frames.ts)); la **primera mitad** hace scrub en el panel **izquierdo** (como antes), en un tramo intermedio se **cruza** con la **segunda mitad** al **derecho** (misma sección sticky; en móvil ambos a ancho completo con el panel derecho alineado al flujo). Sin JPG de fase 2, solo se muestra el escudo como antes.

## Scripts

| Comando | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación producción (`dist/`) |
| `npm run preview` | Vista previa del build |
| `npm run gen:frames` | (Opcional) SVG de prueba en `public/frames/escudo/` |
| `npm run sync:escudo` | Copia JPG desde `../Frame escudo/` → `public/frames/escudo/` y regenera [`src/generated/escudoFrameUrls.ts`](src/generated/escudoFrameUrls.ts) |
| `npm run sync:fase2` | Copia JPG desde **`../frame fase 2/`** (primera: `ezgif-frame-001.jpg`) → `public/frames/fase2/`; también acepta `Frame fase 2` / `FRAME FASE 2`. Si no hay carpeta de fase 2 pero sí **`Frame escudo`**, usa escudo solo para dev. |
| `npm run sync:fase3` | (Opcional) Genera `public/frames/fase3/` — **no** se usa en la app actual; conservado por si reactivas una tercera secuencia. |
| `npm run sync:porrista` | (Opcional / legacy) `../Frame porrista/` → `public/frames/porrista/` + `porristaFrameUrls.ts` — **no** se usa en [`App.tsx`](src/App.tsx) por defecto. |

## Carpetas de frames (junto a `infinity-landing`)

| Origen | Uso |
|--------|-----|
| `Frame escudo` | Secuencia 1 (fullscreen) |
| **frame fase 2.zip** → carpeta típica **`frame fase 2`** (orden de búsqueda: `frame fase 2`, `Frame fase 2`, `FRAME FASE 2`) | Secuencia 2 |

Si no hay carpeta de fase 2, `sync:fase2` puede usar temporalmente **`Frame escudo`** (ver tabla de scripts arriba).

La detección de carpeta está en [`scripts/resolve-frame-source-dir.mjs`](scripts/resolve-frame-source-dir.mjs) y en `PHASE2_FOLDER_CANDIDATES` en [`scripts/sync-fase2-from-folder.mjs`](scripts/sync-fase2-from-folder.mjs).

**Si solo ves el escudo:** `FASE2_FRAME_URLS` está vacío. Ejecuta `npm run sync:fase2` (o deja el respaldo temporal con `Frame escudo`).

## Layout

- **Escudo** a pantalla completa; **fase 2** en dos paneles (izquierda / derecha en escritorio, `--ef2-scene-w` en [`ScrollEscudoFase2Bridge.css`](src/components/ScrollEscudoFase2Bridge.css)). Sin fase 3 en la app. [`ScrollFrameSection`](src/components/ScrollFrameSection.tsx) queda para solo escudo si no hay fase 2.

## QA móvil (checklist)

- [ ] Scrub del escudo estable.
- [ ] Zoom/fade final del escudo perceptible.
- [ ] Transición escudo → fase 2 y backdrop/canvas correctos.
- [ ] Canvas sin recortes raros al rotar o redimensionar.
- [ ] Sin overlays que bloqueen scroll; **reducir movimiento** sigue acortando `--frame-section-h`.

## Calidad de imagen

- Canvas: `image-rendering: auto` y `imageSmoothingQuality: 'high'`.
- [`drawCover.ts`](src/lib/drawCover.ts): por defecto **`fit: 'cover'`**. Ajusta `escudoDraw` en [`App.tsx`](src/App.tsx) (`cropSource`, `insetCssPx`, etc.).

## Paridad móvil

- Sticky `100dvh`, progreso con [`getViewportSize`](src/lib/viewportSize.ts), canvas con DPR cap en [`canvasDpr.ts`](src/lib/canvasDpr.ts).
## Superposición (CSS legacy)

- [`ScrollFrameSection`](src/components/ScrollFrameSection.tsx) sigue teniendo `scroll-frame-section--overlap` por si en el futuro montas otra sección tipo “porrista” encadenada.

## Frames (JPG)

1. Coloca los JPG en las carpetas indicadas arriba.
2. Ejecuta `npm run sync:escudo` y `npm run sync:fase2` según corresponda.
3. `npm run dev`. Si `FASE2_FRAME_URLS` está vacío, solo verás el escudo.

Config: [`escudoFrames.ts`](src/config/escudoFrames.ts), [`fase2Frames.ts`](src/config/fase2Frames.ts).

### Peso y rendimiento

- Comprime JPG o usa WebP/AVIF si `public/frames` crece mucho.
- Precarga: [`useImageSequence.ts`](src/hooks/useImageSequence.ts) (orden extremos + `decode()`).

## Transición (referencia)

| Parámetro | Rol |
|-----------|-----|
| Altura sección | Mucho `vh` (variables en CSS). |
| Sticky | `100dvh`. |
| Progreso | Scroll dentro de la sección → 0..1 → índice de frame. |
| Fase 2 en bridge | Backdrop + capa fase 2 al terminar el escudo. |

## Siguiente producto

Bloques estáticos adicionales, CTA final, u otra sección scroll reutilizando el mismo componente.

## Estructura relevante

- [`ScrollFrameSection.tsx`](src/components/ScrollFrameSection.tsx) — canvas fullscreen (solo escudo si no hay fase 2).
- [`InfinityIntro.tsx`](src/components/InfinityIntro.tsx) — bloque bajo las secuencias.
- Hooks: [`useFrameScrub.ts`](src/hooks/useFrameScrub.ts), [`useScrollSectionProgress.ts`](src/hooks/useScrollSectionProgress.ts), [`useImageSequence.ts`](src/hooks/useImageSequence.ts).
- [`drawCover.ts`](src/lib/drawCover.ts).

## Despliegue (Hostinger u otro hosting estático)

1. `npm run build`.
2. Sube **`dist/`** al hosting.
3. SPA: sirve `index.html` en rutas desconocidas si añades router.
4. Open Graph: cuando tengas dominio e imagen, añade `og:image` en [`index.html`](index.html).

## Referencia legacy

`../V1 infinity-final.html` — este proyecto externaliza frames en `public/`.
