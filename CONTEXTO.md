# Contexto del Proyecto — JACKO™

Este documento contiene la descripción funcional, los flujos del sistema y la arquitectura técnica de la plataforma **JACKO™** para servir de guía a desarrolladores y agentes de IA.

---

## 1. Visión General del Sistema
**JACKO™** es un portal web de comunidad y recompensas que combina una landing page cinematográfica (con animaciones de scroll-scrub en canvas) con una aplicación privada de fidelización.

### Flujo Principal de Negocio:
1. **Registro**: Los usuarios se registran en el sistema (controlado por invitación o pool de correos pre-aprobados).
2. **Actividades**: Realizan tareas de la comunidad para ganar puntos/créditos de forma instantánea.
3. **Catálogo**: Canjean sus puntos por productos físicos o digitales del catálogo, o realizan compras de productos con dinero real.
4. **Pasarelas de Pago**: Pagos con dinero real procesados a través de PayPal, Mercado Pago y Nequi.

---

## 2. Roles y Permisos en el Sistema

En el sistema existen dos capas principales de clasificación para los usuarios: los **Roles de Base de Datos** y las **Categorizaciones Especiales** (agrupaciones o accesos específicos).

### 2.1 Roles del Sistema
Están definidos en la tabla `public.role_definitions` y determinan el nivel de privilegios generales del usuario:

* **Usuario (`user`):** Es el rol por defecto asignado automáticamente a cualquier persona al registrarse.
  * *Acciones/Permisos:* Puede ver productos públicos en la tienda, comprarlos con dinero real (Nequi, Mercado Pago, PayPal) y acumular/ver puntos al realizar tareas de su panel.
* **Administrador (`admin`):** Es un rol del equipo de Staff.
  * *Acciones/Permisos:* Tiene permisos para ingresar al panel administrativo ([AdminDashboardView](file:///c:/Users/JesusAlexisCarmonaCa/Jackopage/ezgif-7820beae0816cd99-jpg/infinity-landing/src/components/views/AdminDashboardView.tsx)), verificar pagos y comprobantes, y actualizar estados de pedidos.
* **Super Administrador (`super_admin`):** Es el nivel más alto de control.
  * *Acciones/Permisos:* Tiene todos los privilegios del administrador, además de la capacidad exclusiva de realizar acciones críticas de base de datos, gestionar el pool de correos corporativos y eliminar registros del catálogo.

### 2.2 Estados Especiales / Categorizaciones
No son roles fijos en la tabla de roles, sino condiciones evaluadas mediante funciones y políticas:

* **Invitados (`is_current_user_invited`):** Es un estado especial que otorga el derecho de visualizar productos exclusivos de tipo `invited_only` y realizar canjes utilizando puntos. Como vimos, un usuario es considerado invitado si cumple con alguna de estas condiciones:
  * Posee el rol `admin` o `super_admin` (bypass automático).
  * Su correo electrónico está registrado en la tabla `invitados`.
  * Cuenta con el permiso individual `access_invited_products` en la tabla `user_permissions`.
* **Staff:** Es una agrupación lógica en el frontend y base de datos que engloba a los roles de Administrador y Super Administrador. Se usa para simplificar las políticas RLS y la visibilidad de los paneles de administración.

---

## 3. Canje de Puntos y Productos

### 3.1 ¿Qué tipo de usuario puede pagar/canjear con puntos?
La base de datos restringe estrictamente cualquier canje por puntos en la función `redeem_with_points`. Para poder pagar con puntos, el usuario obligatoriamente debe estar catalogado como **"Invitado"** (es decir, la función `public.is_current_user_invited()` debe retornar `true`).

Un usuario es considerado **Invitado** si cumple con al menos uno de los siguientes criterios:
* **Administradores:** Usuarios que tengan los roles `super_admin` o `admin`.
* **Lista de invitados por correo:** Su dirección de correo electrónico se encuentra registrada en la tabla `public.invitados`.
* **Permiso específico por ID:** El usuario tiene asignado el permiso `access_invited_products` en la tabla `public.user_permissions`.

*Si un usuario común (no invitado) intenta pagar con puntos, el sistema rechazará la transacción indicando que no tiene permisos.*

### 3.2 ¿Qué productos se pueden comprar con puntos y por quién?
Un producto es elegible para compra con puntos si está activo (`is_active = true`) y tiene un precio en puntos definido (`points_price` no nulo, ya sea a nivel de producto o en alguno de sus planes de pago).

Actualmente en la base de datos se encuentran los siguientes productos activos con soporte para puntos:

#### A. Platzi Premium
* **Precio en puntos por Plan:**
  * **Plan Mensual:** `100 PTS`
  * **Plan Pago Único:** `350 PTS`
* **Visibilidad:** `public` (público).
* **Quién lo puede comprar y cómo:**
  * **Usuarios Invitados / Administradores:** Pueden ver el producto y elegir si comprarlo usando dinero real o canjeándolo con puntos (`100` o `350` PTS).
  * **Usuarios Comunes (No Invitados):** Pueden ver el producto en el catálogo pero solo pueden comprarlo usando dinero real (PSE, Nequi, TC, etc.). No se les habilita la opción de canje por puntos.

#### B. Cuenta puntos
* **Precio en puntos:** `40,000 PTS` (No tiene planes ni precio en dinero real, cuesta $0 COP).
* **Visibilidad:** `invited_only` (exclusivo para invitados).
* **Quién lo puede comprar y cómo:**
  * **Usuarios Invitados / Administradores:** Son los únicos que pueden visualizar este producto en el catálogo y adquirirlo (exclusivamente canjeándolo por sus `40,000 PTS`).
  * **Usuarios Comunes (No Invitados):** No pueden ver este producto en la tienda ni intentar comprarlo de ninguna manera.


---

## 3. Arquitectura de Código (Componentes Clave)

El proyecto está construido con **Vite + React 19 + TypeScript + Supabase (PostgreSQL)**.

### A. Capa de Presentación y Vistas (Keep-Alive)
Para evitar refrescos visuales ("flashes") y recargas de red innecesarias, las vistas están montadas permanentemente en slots controlados por CSS (`display: none` / `display: block`):
* [`App.tsx`](file:///c:/Users/JesusAlexisCarmonaCa/Jackopage/ezgif-7820beae0816cd99-jpg/infinity-landing/src/App.tsx): Orquestador y gestor de estado global de sesión.
* [`DashboardView.tsx`](file:///c:/Users/JesusAlexisCarmonaCa/Jackopage/ezgif-7820beae0816cd99-jpg/infinity-landing/src/components/views/DashboardView.tsx): Panel de resumen del usuario (estadísticas, logros, tareas, transacciones).
* [`CatalogView.tsx`](file:///c:/Users/JesusAlexisCarmonaCa/Jackopage/ezgif-7820beae0816cd99-jpg/infinity-landing/src/components/views/CatalogView.tsx): Catálogo de recompensas y pasarela de checkout.
* [`AdminDashboardView.tsx`](file:///c:/Users/JesusAlexisCarmonaCa/Jackopage/ezgif-7820beae0816cd99-jpg/infinity-landing/src/components/views/AdminDashboardView.tsx): Panel de control administrativo.
* [`ProfileView.tsx`](file:///c:/Users/JesusAlexisCarmonaCa/Jackopage/ezgif-7820beae0816cd99-jpg/infinity-landing/src/components/views/ProfileView.tsx): Formulario de perfil con soporte de edición.

### B. Rendimiento e Imágenes
* [`useImageSequence.ts`](file:///c:/Users/JesusAlexisCarmonaCa/Jackopage/ezgif-7820beae0816cd99-jpg/infinity-landing/src/hooks/useImageSequence.ts): Hook de precarga de imágenes con caché en memoria a nivel de módulo (`imageSequenceCache`), permitiendo transiciones instantáneas sin recargar los 240 frames del personaje.

### C. Estilos y Distribución
* [`index.css`](file:///c:/Users/JesusAlexisCarmonaCa/Jackopage/ezgif-7820beae0816cd99-jpg/infinity-landing/src/index.css): Contiene los tokens de diseño (Paleta de colores JACKO™) y el sistema de rejilla fluida `.grid-base` de 12 columnas reactivas para un comportamiento responsivo impecable.
* Archivos `.css` específicos por componente para modularizar las vistas.

---

## 4. Flujo de Datos y Conexión de Supabase
* **Realtime**: El panel del usuario está suscrito en tiempo real a los cambios de la tabla `orders` para reflejar aprobaciones de canjes instantáneamente.
* **RPC (Remote Procedure Calls)**: Lógicas críticas (completar tareas, capturar órdenes, ajustar puntos, validar correos) se ejecutan mediante funciones seguras en base de datos.
* **RLS (Row Level Security)**: Todas las tablas tienen políticas activas para asegurar que un usuario común solo pueda consultar y modificar sus propios datos.
