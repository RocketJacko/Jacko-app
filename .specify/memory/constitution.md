# Project Constitution — JACKO™

Non-negotiable principles, technical constraints, and best practices for the **JACKO™** landing page and web application.

---

## 1. Core Technical Stack

* **Build Tooling**: Vite 8 & TypeScript.
* **Frontend Library**: React 19 (Hooks, custom modules).
* **Animations**: `motion` (`motion/react`) for overlays, dock navigation, and interactive UI micro-animations.
* **Styling**: Vanilla CSS. Styling tokens are defined in [jacko-theme.css](file:///c:/Users/JesusAlexisCarmonaCa/Jackopage/ezgif-7820beae0816cd99-jpg/infinity-landing/src/styles/jacko-theme.css) and layout utilities in [index.css](file:///c:/Users/JesusAlexisCarmonaCa/Jackopage/ezgif-7820beae0816cd99-jpg/infinity-landing/src/index.css).
  * **Rule**: Avoid adding TailwindCSS or other CSS-in-JS frameworks unless specifically requested by the user.
* **Backend**: Supabase (PostgreSQL) utilizing Realtime subscriptions, secure Row-Level Security (RLS) policies, and Remote Procedure Calls (RPC) for critical backend transactions.

---

## 2. Architectural Guidelines

### 2.1 Keep-Alive Views Layout
To prevent visual flashes, lag, and unnecessary network requests:
* App views (Dashboard, Catalog, Admin, Profile) must remain permanently mounted.
* View visibility is controlled using CSS switching (`display: none` for inactive, `display: block` or flex for active).
* The central state of session/user is maintained in [App.tsx](file:///c:/Users/JesusAlexisCarmonaCa/Jackopage/ezgif-7820beae0816cd99-jpg/infinity-landing/src/App.tsx).

### 2.2 Cinematic Scroll-Scrub & Canvas Performance
* Canvas rendering must be optimized using custom hooks (like `useImageSequence` and `useScrollSectionProgress`).
* Image sequence preloading must utilize module-level caching to prevent redundant decoding.
* Image smoothing must be set to `high` and use appropriate scaling styles (`image-rendering: auto`, and fit ratios).
* Canvas sizing must support dynamic resizing, pixel ratio scaling (DPR), and fallback handlers.

### 2.3 Mobile & Responsive Parity
* Use responsive measurements (`100dvh` for sticky layouts, dynamic viewport checks).
* Layout structures must adapt gracefully using CSS Grid and Flexbox (e.g. `.grid-base` 12-column responsive layout).
* Accessibility: Check for `prefers-reduced-motion` settings to adapt scrolling behavior and sequence height.

---

## 3. Database & Security Standards

### 3.1 Row Level Security (RLS) & RPC
* All Supabase tables must have active RLS policies to prevent users from viewing or modifying other users' records.
* Critical mutations (e.g., deducting points, processing redemptions, email validation) must be handled through RPC functions or secure Edge Functions, never directly from client-side inserts/updates on sensitive tables.

### 3.2 Product and Redemption Permissions
* **Point Redemptions**: Point-based purchases are strictly limited to verified "Invitados" (admin, super_admin, listed emails in `invitados`, or specific permission flags).
* **Product Catalog**: Regular users see public products with real currency options. Invited users can view exclusive items (`invited_only`) and use points for checkout.

### 3.3 Form & Input Validation
* Implement client-side validations with clear visual error feedback (using `zod` and helper libraries).
* Protect inputs from XSS vulnerabilities (e.g. using `DOMPurify` for custom/dynamic HTML rendering).

---

## 4. Development Best Practices

* **Documentation**: Always preserve existing file comments, docstrings, and context files. Update `CONTEXTO.md` or `AGENTS.md` if key architecture pieces change.
* **Testing & DOM Identifiers**: Interactive components must have unique, descriptive `id` attributes to facilitate automated UI and browser testing.
* **SEO Best Practices**: Maintain descriptive titles, layout headings (`h1` hierarchies), and metadata structures.
