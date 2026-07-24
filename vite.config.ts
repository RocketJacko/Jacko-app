import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icon.webp',
        'apple-touch-icon.png',
        'pwa-192x192.webp',
        'pwa-512x512.webp',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'favicon.png',
        'robots.txt',
        'offline.html',
      ],
      manifest: false, // Usar el public/manifest.json existente
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Incluir explicitamente html para que offline.html quede en el precache.
        // Sin esto, Workbox genera el manifest sin offline.html y el SW no puede
        // servirlo cuando no hay red, mostrando "sin conexion" en el primer cargue.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // offline.html ya queda cubierto por globPatterns, pero se agrega aqui
        // con revision estatica como respaldo para entornos donde glob falla.
        additionalManifestEntries: [
          { url: '/offline.html', revision: '2' },
        ],
        // Servir index.html para que React Router maneje las rutas SPA (/checkout, /dashboard, etc.)
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [/^\/(?!_next|api|.*\.[^/]+$).*/],
        // No interceptar rutas de admin con el fallback offline.
        navigateFallbackDenylist: [/^\/admin/],
        runtimeCaching: [
          {
            // Peticiones a Supabase API y Auth: NetworkOnly (Cero caché local)
            urlPattern: /^https:\/\/.*\.supabase\.co\/(rest|auth)\/v1\/.*$/,
            handler: 'NetworkOnly',
          },
          {
            // Frames de animación de Supabase: CacheFirst (Inmutables)
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/frames\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-frames-cache',
              expiration: {
                maxEntries: 250, // Permite guardar todos los 240 frames
                maxAgeSeconds: 60 * 60 * 24 * 90, // 90 días
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Fuentes externas de Google Fonts: CacheFirst
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 año
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Assets estáticos de imágenes del dominio: StaleWhileRevalidate
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 días
              },
            },
          },
          {
            // Unsplash images (product thumbnails)
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'unsplash-images',
              expiration: {
                maxEntries: 40,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 días
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        suppressWarnings: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    /** Necesario para abrir desde el móvil u otra PC con http://192.168.x.x:… */
    host: true,
    /** Misma convención que muchos tutoriales (CRA/Next); el default de Vite es 5173. */
    port: 3000,
    strictPort: false,
  },
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) {
              return 'supabase-client';
            }
            if (id.includes('motion') || id.includes('framer-motion')) {
              return 'motion-lib';
            }
            if (id.includes('lucide-react')) {
              return 'lucide-icons';
            }
            return 'vendor';
          }
        },
      },
    },
  },
})
