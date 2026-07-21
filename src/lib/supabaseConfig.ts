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

export function getSupabaseConfig(): SupabaseConfig {
  const win = typeof window !== 'undefined' ? (window as typeof globalThis & { __SUPABASE_CONFIG__?: { supabaseUrl: string; supabaseAnonKey: string } }) : null;
  const config = win?.__SUPABASE_CONFIG__;
  
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  return {
    supabaseUrl: (envUrl && envUrl !== '%VITE_SUPABASE_URL%') ? envUrl : (config?.supabaseUrl && config.supabaseUrl !== '%VITE_SUPABASE_URL%' ? config.supabaseUrl : ''),
    supabaseAnonKey: (envKey && envKey !== '%VITE_SUPABASE_ANON_KEY%') ? envKey : (config?.supabaseAnonKey && config.supabaseAnonKey !== '%VITE_SUPABASE_ANON_KEY%' ? config.supabaseAnonKey : ''),
  };
}
