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
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'robots.txt'],
      manifest: false, // Usar el public/manifest.json existente
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            // Peticiones a Supabase API y Auth: NetworkOnly (Cero caché local)
            urlPattern: /^https:\/\/.*\.supabase\.co\/(rest|auth)\/v1\/.*$/,
            handler: 'NetworkOnly',
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
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 días
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true, // Permitir probar PWA en entorno de desarrollo local
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
