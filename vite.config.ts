import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
          if (id.includes('@supabase')) {
            return 'supabase-lib';
          }
          if (id.includes('supabaseConfig')) {
            return 'supabase-config';
          }
          if (id.includes('supabaseClient')) {
            return 'supabase-client';
          }
        }
      },
    },
  },
})
