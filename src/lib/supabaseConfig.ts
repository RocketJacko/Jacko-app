/**
 * supabaseConfig.ts — JACKO™
 *
 * En desarrollo (Vite dev server) lee las credenciales desde import.meta.env,
 * ya que los placeholders %VITE_*% de index.html solo se reemplazan en build.
 * En producción (build estático desplegado en Vercel) los placeholders sí
 * quedan reemplazados, por lo que window.__SUPABASE_CONFIG__ es válido.
 */

interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

function isValidUrl(value: string | undefined): boolean {
  if (!value) return false;
  // Rechazar placeholders sin reemplazar como "%VITE_SUPABASE_URL%"
  if (value.startsWith('%') && value.endsWith('%')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidKey(value: string | undefined): boolean {
  if (!value) return false;
  if (value.startsWith('%') && value.endsWith('%')) return false;
  return value.length > 0;
}

export function getSupabaseConfig(): SupabaseConfig {
  // 1. Intentar leer desde import.meta.env (dev server de Vite y builds con VITE_ vars)
  const envUrl  = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
  const envKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (isValidUrl(envUrl) && isValidKey(envKey)) {
    return { supabaseUrl: envUrl!, supabaseAnonKey: envKey! };
  }

  // 2. Fallback: window.__SUPABASE_CONFIG__ (producción — Vercel reemplaza los placeholders en build)
  const win = typeof window !== 'undefined'
    ? (window as typeof globalThis & { __SUPABASE_CONFIG__?: { supabaseUrl: string; supabaseAnonKey: string } })
    : null;
  const config = win?.__SUPABASE_CONFIG__;

  const supabaseUrl     = isValidUrl(config?.supabaseUrl)  ? config!.supabaseUrl     : '';
  const supabaseAnonKey = isValidKey(config?.supabaseAnonKey) ? config!.supabaseAnonKey : '';

  return { supabaseUrl, supabaseAnonKey };
}
