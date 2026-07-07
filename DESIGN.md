# Sistema de Diseño JACKO™

Este documento especifica los tokens de diseño, componentes UI, y patrones de experiencia visual implementados en el proyecto **JACKO™**.

---

## 1. Sistema de Colores (Tokens CSS)

La paleta está inspirada en un estilo "Skate & Streetwear" cálido, de alto contraste, premium y enérgico. Se declaran como Custom Properties en [`index.css`](file:///c:/Users/JesusAlexisCarmonaCa/Jackopage/ezgif-7820beae0816cd99-jpg/infinity-landing/src/index.css):

| Token | Valor Hex | Uso de Diseño |
| :--- | :--- | :--- |
| `--beige-base` | `#D4C4A8` | Fondo de página principal y bordes decorativos |
| `--beige-light` | `#E8DDC8` | Superficies secundarias, contenedores y modales |
| `--beige-dark` | `#B8A888` | Bordes cálidos y sombras suaves |
| `--orange-base` | `#D4621A` | Color de acento primario y botones de acción |
| `--orange-light` | `#E8762A` | Estados de hover e interactividad activa |
| `--orange-bright`| `#FF8C3A` | Resplandores y estados activos del sidebar |
| `--orange-deep` | `#B84A0A` | Títulos importantes, badges y texto de énfasis |
| `--white-warm` | `#FAF6F0` | Fondo de tarjetas y elementos interactivos |
| `--brown-dark` | `#2A1A0A` | Texto del cuerpo, footer y elementos oscuros premium |

---

## 2. Tipografía
El sistema tipográfico combina una estética lúdica y pesada ("display") con una tipografía de cuerpo altamente legible y redondeada:
* **Display (`--font-display`)**: `'Fredoka One', cursive`
  * *Uso*: Títulos grandes (H1, H2), botones principales, marcas de agua y CTAs del menú dock.
* **Cuerpo (`--font-body`)**: `'Nunito', sans-serif`
  * *Uso*: Párrafos, campos de formulario, tablas, listados y subtextos de interfaz.

---

## 3. Rejilla Base y Layout Responsivo (`.grid-base`)
La distribución en todas las pantallas se realiza mediante un grid de 12 columnas fluido, definido en [`index.css`](file:///c:/Users/JesusAlexisCarmonaCa/Jackopage/ezgif-7820beae0816cd99-jpg/infinity-landing/src/index.css). Este sistema utiliza variables CSS reactivas que cambian según los breakpoints:

### Breakpoints de Columnas:
1. **Móvil (hasta 639px)**:
   * Columnas: `2` (Gaps: `1rem`, Padding: `1rem`)
   * Tarjetas: Abarcan 2 columnas (1 tarjeta por fila).
2. **Tablet (640px a 1023px)**:
   * Columnas: `4` (Gaps: `1.5rem`, Padding: `1.5rem`)
   * Tarjetas: Abarcan 2 columnas (2 tarjetas por fila).
3. **Portátil (1024px a 1439px)**:
   * Columnas: `8` (Gaps: `1.5rem`, Padding: `2rem`)
   * Tarjetas: Abarcan 2 columnas (4 por fila) o 4 columnas (2 por fila).
4. **Escritorio (1440px o más)**:
   * Columnas: `12` (Gaps: `2rem`, Padding: `2rem`)
   * Tarjetas: Abarcan 4 columnas (3 por fila) o 3 columnas (4 por fila).

---

## 4. Componentes UI Premium

### 1. Dock Nav (Menú de Navegación Flotante)
* **Estilo**: Fondo translúcido con blur de cristal (`backdrop-filter: blur(16px)`), bordes redondeados tipo cápsula (`border-radius: 20px`), color de texto naranja profundo.
* **Interacciones**: Los botones del dock muestran un tooltip superior con un fade de `0.15s` y flotan sutilmente en hover.

### 2. Tarjetas de Producto (`.product-card`)
* **Estilo**: Fondo blanco cálido con bordes finos e iluminación suave. La imagen ocupa un contenedor centrado con fondo blanco puro para aislar el objeto.
* **Interacciones**: En hover, la tarjeta se eleva (`transform: translateY(-6px)`) con sombra profunda y la imagen del producto realiza un zoom suave de escala `1.04` en `0.6s`.

### 3. Tarjetas de Estadísticas (`.stat-card`)
* **Estilo**: Gradiente de fondo radial cálido y barra de progreso fluida de puntos con variable inline de porcentaje (`--progress`).
* **Distribución**: En pantallas grandes se dividen equitativamente en 3 partes; en móviles y tablets se apilan con simetría.

---

## 5. Sistema de Animaciones y Micro-interacciones

* **Flotación del Dock (`dock-float`)**:
  * *Efecto*: Movimiento de oscilación vertical continuo.
  * *Duración*: `4s` (curva `ease-in-out`, infinita).
* **Giro de Monedas (`coin-spin`)**:
  * *Efecto*: Giro continuo sobre el eje Y con escala elástica.
  * *Duración*: `4s` (lineal, infinito).
* **Borde Giratorio (`spin-border`)**:
  * *Efecto*: Rotación de 360 grados en el borde del CTA del Hero.
  * *Duración*: `8s` (lineal, infinito).
* **Transición de Vistas (`view-slot`)**:
  * *Efecto*: Control por slots keep-alive mediante clases `.view-slot--active` y `.view-slot--hidden` con manipulación de opacidad.
