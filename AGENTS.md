# Agentes — infinity-landing

Landing **JACKO™** (Vite + React 19 + TypeScript). Experiencia principal: **scroll-scrub** en canvas con secuencias JPG (`MI_PERSONAJE_FRAME_URLS`), overlays con **Motion** (`motion/react`), pricing, registro y navegación dock.

## Visión Global
El proyecto no es solo una landing page; es el portal de entrada a una **Web App** completa. Actualmente estamos en la fase de organización visual y experiencia de aterrizaje. La arquitectura debe ser modular para permitir la transición fluida de una landing cinemática a una aplicación funcional.

## Cuándo usar cada agente

### Agentes del proyecto (infinity)

| Agente | Skill | Uso |
|--------|-------|-----|
| **Animaciones** | `@infinity-animations` | Scroll-scrub, canvas, frames, Motion, CSS sticky, rendimiento |
| **Seguridad** | `@infinity-security` | Formularios, XSS, validación, datos personales, deploy estático |
| **QA / Funcionamiento** | `@infinity-qa` | `npm run verify`, build, lint, checklist móvil |

### UI/UX Pro Max (paquete integrado)

Origen: `../ui-ux-pro-max-skill` → instalado en `.cursor/skills/`.

| Skill | Invocar | Uso |
|-------|---------|-----|
| **UI/UX Pro Max** | `@ui-ux-pro-max` | Design system, paletas, tipografía, UX guidelines, búsqueda CSV |
| **Design system** | `@design-system` | Tokens, componentes, sistemas de diseño |
| **Design** | `@design` | Iconos, logos, assets visuales |
| **Brand** | `@brand` | Identidad de marca |
| **UI Styling** | `@ui-styling` | Tailwind / shadcn (referencia; este repo usa CSS custom) |
| **Banner** | `@banner-design` | Banners y hero gráficos |
| **Slides** | `@slides` | Presentaciones / decks |

> Los nombres `ckm:*` del paquete original corresponden a las carpetas anteriores en `.cursor/skills/`.

**Búsqueda de design system (ejemplo JACKO):**

```bash
python .cursor/skills/ui-ux-pro-max/scripts/search.py "skate lifestyle landing bold" --design-system -p "JACKO" --stack react
```

Rutas y tokens del proyecto: [`.cursor/skills/ui-ux-pro-max/PROJECT.md`](.cursor/skills/ui-ux-pro-max/PROJECT.md).

## Flujo recomendado

1. **Nueva sección o rediseño visual** → `@ui-ux-pro-max` (design system) → implementar → `@infinity-animations` si hay motion → `@infinity-qa`.
2. **Solo animación / scroll** → `@infinity-animations` → `@infinity-qa`.
3. **Formulario o datos** → `@infinity-security` → `@infinity-qa`.
4. **Antes de deploy** → `@infinity-qa` + checklist UX de `@ui-ux-pro-max`.

## Contexto técnico (resumen)

- **Stack**: Vite 8, React 19, `motion` ^12, CSS custom (`jacko-theme.css`), sin router.
- **Hero**: [`ScrollEscudoFase2Bridge`](src/components/ScrollEscudoFase2Bridge.tsx).
- **Frames**: `npm run sync:personaje` → [`miPersonajeFrameUrls.ts`](src/generated/miPersonajeFrameUrls.ts).
- **Entrada**: [`ActivateOverlay`](src/components/ActivateOverlay.tsx).
- **Fin intro**: `DockNav` + scroll a `#pricing`.

## Archivos clave

| Área | Archivos |
|------|----------|
| Scroll / canvas | `ScrollEscudoFase2Bridge.tsx`, `drawCover.ts`, hooks `useImageSequence`, `useScrollSectionProgress` |
| UI Motion | `RegisterForm.tsx`, `ActivateOverlay.tsx`, `DockNav.tsx`, `PricingCard.tsx` |
| Tema | `jacko-theme.css`, `App.css` |

## Reglas Cursor (auto)

| Regla | Alcance |
|-------|---------|
| `project-context.mdc` | Siempre |
| `animations.mdc` | Hooks / canvas / hero |
| `security-forms.mdc` | Registro |
| `ui-ux-pro-max.mdc` | `src/**/*.tsx`, `src/**/*.css` |

## Verificación

```bash
npm run verify
```

## Estado conocido

El build puede fallar por imports en `HomePage` / `DockNav` o tipos Motion en `RegisterForm`. Corregir con `@infinity-qa` antes de deploy.
