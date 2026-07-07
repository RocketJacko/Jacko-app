# Log de Avances y Skills — JACKO™

Este log registra cada hito técnico logrado, detallando el caso de uso, las técnicas aplicadas y cómo se resolvió.

---

## [Skill 01] Motor de Animación Scroll-Scrub con Canvas

### Caso de Uso
Crear una experiencia cinemática de entrada (Hero) donde el usuario controla el movimiento de un personaje (skater) mediante el scroll, manteniendo una fluidez de 60fps en dispositivos móviles.

### Cómo se logró (Técnicas)
1.  **Secuencia de Imágenes JPG:** Uso de frames pre-renderizados para evitar el costo de procesamiento de un modelo 3D en la web.
2.  **Canvas API + DPR:** Dibujado directo en el `context2d` del canvas, ajustando el tamaño por el `devicePixelRatio` para evitar que la imagen se vea borrosa en pantallas Retina.
3.  **Framer Motion (`useScroll`, `useSpring`):** Orquestación del progreso del scroll. Se aplicó un `useSpring` al valor del scroll para añadir inercia y suavidad (smoothing) al movimiento.
4.  **Lógica `drawCover`:** Implementación de un algoritmo de escalado (similar a `background-size: cover`) que calcula el aspect ratio de la imagen vs el canvas para asegurar que el personaje siempre llene la pantalla sin distorsionarse.
5.  **Pre-carga de Imágenes:** Hook `useImageSequence` que descarga y memoriza los elementos `HTMLImageElement` antes de iniciar la animación para evitar parpadeos (flickering).

---

## [Skill 02] Motor de Transición Cinemática Secuencial

### Caso de Uso
Transicionar suavemente de la animación principal a otras secciones visuales (como los planes de precios) sin perder el estilo de la aplicación.

### Cómo se logró (Técnicas)
1.  **Sticky Positioning:** Cada sección de animación tiene un contenedor `sticky` de `100vh` dentro de un padre con altura extendida (ej. `400vh`), permitiendo que el canvas se quede fijo mientras el usuario scrollea.
2.  **Opacidad Dinámica:** Uso de `useTransform` para mapear el progreso del scroll (0.0 a 1.0) a la opacidad (0 a 1 y luego de 1 a 0), creando efectos de *fade-in* y *fade-out* automáticos al entrar y salir de la sección.
3.  **Contain Mode & Insets:** Mejora del motor `drawCover` para soportar un modo "contain" con márgenes (`insetCssPx`), permitiendo que composiciones complejas se vean completas sin ser cortadas por los bordes de la pantalla.
4.  **Radial Masking (Feather):** Aplicación de `mask-image` con gradientes radiales en CSS para suavizar los bordes del canvas, integrándolo visualmente con el fondo beige de la marca.

---

## Próximos Objetivos
- [ ] Implementación de Pricing Cards con imágenes estáticas premium.
- [ ] Refactorización de `App.tsx` hacia una arquitectura de "View Switcher" para navegación de App Web.
- [ ] Optimización de carga selectiva de assets por vista.
