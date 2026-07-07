---
name: infinity-qa
description: >-
  Verifies build, lint, TypeScript, and functional behavior of infinity-landing
  including scroll intro, navigation, pricing, and forms. Use after animation or
  security changes, before deploy, or when the user asks to verify the app works.
---

# Agente QA / funcionamiento — infinity-landing

## Verificación automática (ejecutar siempre)

```bash
npm run verify
```

Equivale a comprobaciones en [`scripts/verify-project.mjs`](../../../scripts/verify-project.mjs): TypeScript build, ESLint, frames generados.

Si falla:

1. Leer salida completa de `tsc` y `eslint`.
2. Corregir errores en orden: imports faltantes → tipos Motion → variables no usadas.
3. Re-ejecutar hasta exit code 0.

## Errores frecuentes en este repo

| Error | Acción |
|-------|--------|
| `Cannot find name 'MI_PERSONAJE_FRAME_URLS'` | Import desde `generated/miPersonajeFrameUrls` en `HomePage.tsx` |
| `Cannot find name 'ScrollEscudoFase2Bridge'` | Import del componente en `HomePage.tsx` |
| `Cannot find name 'useState'` en DockNav | Añadir imports de `react` y `motion/react` |
| Variants Motion TS | `type: 'spring' as const`, `ease: 'easeOut' as const` |

## Checklist manual (dev)

```bash
npm run dev
```

- [ ] Overlay "Comenzar" aparece; al cerrar, scroll habilitado
- [ ] Secuencia canvas avanza con scroll; loader desaparece al 100%
- [ ] Al ~fin del hero: `DockNav` visible; scroll suave a `#pricing`
- [ ] Enlaces dock: `#inicio`, `#pricing`, `#register`
- [ ] Pricing: tarjetas visibles e interactivas
- [ ] Registro: formulario visible; submit no recarga página (`preventDefault`)
- [ ] Móvil: rotar/redimensionar sin canvas roto
- [ ] `prefers-reduced-motion`: sin bloqueos de scroll

## Checklist build producción

```bash
npm run build
npm run preview
```

- [ ] `dist/` generado sin errores
- [ ] Assets en `dist/frames/` accesibles (rutas con espacio codificadas)
- [ ] Sin errores en consola del navegador en flujo completo

## Formato de informe QA

```markdown
## QA — infinity-landing

**Automático:** ✅ / ❌ (`npm run verify`)

### Bloqueantes
- ...

### Manual pendiente
- ...

### Pasó
- ...
```

## Coordinación

- Animaciones rotas → escalar a `@infinity-animations` con logs de consola.
- Formulario inseguro → `@infinity-security` antes de cerrar QA.
