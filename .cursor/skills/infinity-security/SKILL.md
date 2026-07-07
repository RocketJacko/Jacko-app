---
name: infinity-security
description: >-
  Audits and hardens forms, user input, XSS, privacy, and static deployment
  security for infinity-landing. Use when editing RegisterForm, RegisterPage,
  form submission, external APIs, environment secrets, or before production deploy.
---

# Agente de seguridad — infinity-landing

## Alcance

Landing estática sin backend propio en el repo. El riesgo principal: **datos en formularios**, **XSS**, **enlaces externos** y **configuración de deploy**.

## Checklist de auditoría

### Formulario de registro (`RegisterForm.tsx`)

- [ ] Inputs controlados con estado React (no solo DOM sin validar)
- [ ] Validación cliente: email (`type="email"` + regex), longitud nombre/ciudad, trim
- [ ] `onSubmit`: no enviar a URL arbitraria; usar endpoint HTTPS conocido o mantener `preventDefault` hasta integrar API
- [ ] Sin `dangerouslySetInnerHTML` con datos de usuario
- [ ] Mensajes de error en texto plano, no HTML interpolado
- [ ] Botón deshabilitado durante envío; rate-limit básico en cliente si hay API
- [ ] Política de privacidad: enlace real antes de recolectar datos

### XSS y React

- [ ] Escapar por defecto (React); revisar `href` dinámicos (`javascript:` prohibido)
- [ ] `target="_blank"` con `rel="noopener noreferrer"`
- [ ] No insertar respuestas de API en el DOM sin sanitizar

### Assets y frames

- [ ] URLs de frames solo desde `generated/*.ts` o rutas `/frames/...` estáticas (no query params de usuario en `img.src`)
- [ ] No exponer rutas internas del servidor en errores al usuario

### Build y deploy

- [ ] No commitear `.env`, tokens, claves API
- [ ] Headers en hosting: `X-Content-Type-Options: nosniff`, CSP si el host lo permite
- [ ] Solo subir `dist/` tras `npm run verify`
- [ ] HTTPS obligatorio en producción

### Dependencias

- [ ] Tras cambios en deps: `npm audit` (informar vulnerabilidades high/critical)

## Integración futura de API

Si conectas backend:

1. POST JSON a dominio allowlist.
2. No guardar PII en `localStorage` sin cifrado/consentimiento.
3. CORS configurado en servidor, no solo en cliente.
4. Considerar honeypot o CAPTCHA si hay spam.

## Formato de informe

```markdown
## Seguridad — infinity-landing

### Crítico
- ...

### Recomendado
- ...

### OK
- ...
```

Tras correcciones críticas, pedir verificación con `@infinity-qa`.
