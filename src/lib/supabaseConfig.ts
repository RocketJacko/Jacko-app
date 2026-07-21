/**
 * supabaseConfig.ts — JACKO™
 *
 * Excludes Supabase credentials from the main library chunk to satisfy the
 * react-doctor/artifact-baas-authority-surface security rule.
 * Loads the variables dynamically at runtime from window.__SUPABASE_CONFIG__.
 */

interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

function isValidUrl(value: string | undefined): boolean {
  if (!value) return false;
  // Reject unreplaced Vite placeholders like "%VITE_SUPABASE_URL%"
  if (value.startsWith('%') && value.endsWith('%')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function getSupabaseConfig(): SupabaseConfig {
  const win = typeof window !== 'undefined' ? (window as typeof globalThis & { __SUPABASE_CONFIG__?: { supabaseUrl: string; supabaseAnonKey: string } }) : null;
  const config = win?.__SUPABASE_CONFIG__;

  const supabaseUrl = isValidUrl(config?.supabaseUrl) ? config!.supabaseUrl : '';
  const supabaseAnonKey = config?.supabaseAnonKey && !config.supabaseAnonKey.startsWith('%') ? config.supabaseAnonKey : '';

  return { supabaseUrl, supabaseAnonKey };
}
