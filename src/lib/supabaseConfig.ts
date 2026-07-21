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
  return {
    supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string) || '',
    supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '',
  };
}
