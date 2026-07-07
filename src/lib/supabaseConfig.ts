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
  return {
    supabaseUrl: config?.supabaseUrl || '',
    supabaseAnonKey: config?.supabaseAnonKey || '',
  };
}
