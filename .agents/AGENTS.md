# Reglas de Desarrollo del Proyecto (Jacko App)

1. **Aislamiento de Cambios Visuales:**
   - Todas las modificaciones de UI/UX deben realizarse en componentes desacoplados de forma segura, sin alterar la configuración del Service Worker PWA ni el árbol de montaje principal.

2. **Verificación Estricta Pre y Post-Compilación:**
   - Después de cada modificación, ejecutar `npx tsc --noEmit` para verificar 0 errores de sintaxis, tipos e importaciones.

3. **Verificación de Importaciones y Librerías:**
   - Validar que todas las librerías importadas (`motion/react`, `virtual:pwa-register`, `lucide-react`, etc.) existan y tengan el alias correcto según la configuración del proyecto.

4. **Preservación del Service Worker y PWA:**
   - No romper ni remover importaciones virtuales de `virtual:pwa-register`.
