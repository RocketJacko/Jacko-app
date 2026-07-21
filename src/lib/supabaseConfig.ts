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
  // Lee las credenciales desde las variables de entorno de Vite (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  return {
    supabaseUrl: isValidUrl(envUrl) ? envUrl! : '',
    supabaseAnonKey: isValidKey(envKey) ? envKey! : '',
  };
}
