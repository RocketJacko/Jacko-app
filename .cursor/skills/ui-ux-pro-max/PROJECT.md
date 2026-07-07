# UI/UX Pro Max — rutas en infinity-landing

Los ejemplos del `SKILL.md` usan `skills/ui-ux-pro-max/...`. **En este repo**, ejecuta desde la raíz del proyecto:

```bash
python .cursor/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --design-system -p "JACKO"
python .cursor/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain ux --stack react
```

## Contexto JACKO™ (alinear recomendaciones)

| Token existente | Valor |
|-----------------|-------|
| `--orange` / CTA | `#d4621a` |
| Fondo | `--beige` `#d4c4a8`, `--beige-light` `#e8ddc8` |
| Tipografía | Fredoka One (display), Nunito (body) |
| Archivo tema | `src/styles/jacko-theme.css` |

No reemplazar la paleta sin pedido explícito; usar el design system de la skill para **mejoras UX** (contraste, espaciado, estados), no para rebranding completo.

## Stack

- **React 19** + Vite + CSS (sin Tailwind en el proyecto actual)
- Animaciones scroll: coordinar con `@infinity-animations`
- Tras cambios UI: `@infinity-qa`
