/**
 * supabaseClient.ts — JACKO™
 *
 * Técnicas aplicadas:
 *  1. Timeout selectivo: auth sin timeout, datos con 15s timeout
 *  2. Retry con clasificación HTTP:
 *     - 401/403 → NO reintentar (error de auth)
 *     - 404     → NO reintentar (recurso no existe)
 *     - 429     → reintentar con delay largo (rate limited)
 *     - 5xx     → reintentar con backoff
 *     - Red     → reintentar con backoff
 *  3. Max retries estricto (2 reintentos = 3 intentos totales)
 *  4. Warmup al arrancar (despierta Supabase free-tier)
 *  5. Fast-fail cuando navigator.onLine === false
 */
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './supabaseConfig';

const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isConfigured) {
  console.warn('[Supabase] URL o Anon Key faltante o inválida. El cliente no estará disponible hasta que se configuren VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const MAX_RETRIES  = 2;         // 3 intentos totales
const DATA_TIMEOUT = 15_000;    // 15s para queries de datos
const FUNC_TIMEOUT = 90_000;    // 90s para Edge Functions (n8n puede tardar hasta ~45s)
const RETRY_BASE   = 1_000;     // 1s → 2s backoff
const RATE_LIMIT_DELAY = 5_000; // 5s si recibimos 429

// ─── Helpers ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Clasifica si una response HTTP es reintentable.
 * Retorna:
 *  - 'no-retry':  error permanente — no reintentar
 *  - 'retry':     error transitorio — reintentar con backoff
 *  - 'rate-limited': 429 — reintentar con delay largo
 *  - 'ok':        respuesta exitosa
 */
function classifyResponse(response: Response): 'ok' | 'retry' | 'rate-limited' | 'no-retry' {
  if (response.ok) return 'ok';

  switch (response.status) {
    case 401:
    case 403:
    case 404:
    case 409:
    case 422:
      return 'no-retry';
    case 429:
      return 'rate-limited';
    default:
      // 500, 502, 503, 504, etc.
      return response.status >= 500 ? 'retry' : 'no-retry';
  }
}

// ─── Fetch resiliente ────────────────────────────────────────────────────────

const fetchWithResiliency = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  attempt = 0
): Promise<Response> => {
  const url = input.toString();
  const isAuth     = url.includes('/auth/');
  const isFunction = url.includes('/functions/v1/');

  // Fast-fail sin red (excepto auth — deja que el SDK maneje su propio retry)
  if (!navigator.onLine && !isAuth) {
    throw new TypeError('[Supabase] Sin conexión a internet.');
  }

  // Auth endpoints: sin timeout, sin retry — el SDK de Supabase los maneja
  if (isAuth) {
    return fetch(input, init);
  }

  // Edge Functions: timeout largo (50s) — operaciones como activate-order pueden tardar ~45s
  // Queries de datos normales: timeout corto (15s)
  const timeout = isFunction ? FUNC_TIMEOUT : DATA_TIMEOUT;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });

    const classification = classifyResponse(response);

    switch (classification) {
      case 'ok':
        return response;

      case 'no-retry':
        // Devolver la response tal cual — Supabase client la interpreta como error
        return response;

      case 'rate-limited':
        if (attempt < MAX_RETRIES) {
          console.warn(`[Supabase] 429 Rate limited — esperando ${RATE_LIMIT_DELAY / 1000}s...`);
          await sleep(RATE_LIMIT_DELAY);
          return fetchWithResiliency(input, init, attempt + 1);
        }
        return response;

      case 'retry':
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE * 2 ** attempt;
          console.warn(`[Supabase] ${response.status} — reintento ${attempt + 1}/${MAX_RETRIES} en ${delay}ms...`);
          await sleep(delay);
          return fetchWithResiliency(input, init, attempt + 1);
        }
        return response;
    }
  } catch (err) {
    // Errores de red (fetch failed, DNS error, etc.) — reintentar
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';

    // Timeout: NO reintentar — si es una Edge Function esperamos hasta 50s,
    // si son datos esperamos 15s. Reintentar duplicaría la espera sin beneficio.
    if (isTimeout) {
      const timeoutUsed = url.includes('/functions/v1/') ? FUNC_TIMEOUT / 1000 : DATA_TIMEOUT / 1000;
      console.error(`[Supabase] Timeout (${timeoutUsed}s) en: ${url}`);
      throw err;
    }

    // Error de red: reintentar con backoff
    if (err instanceof TypeError && attempt < MAX_RETRIES) {
      const delay = RETRY_BASE * 2 ** attempt;
      console.warn(`[Supabase] Error de red — reintento ${attempt + 1}/${MAX_RETRIES} en ${delay}ms...`);
      await sleep(delay);
      return fetchWithResiliency(input, init, attempt + 1);
    }

    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

// ─── Cliente Supabase ────────────────────────────────────────────────────────

// Use placeholder values when not configured so createClient doesn't throw at startup
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    global: {
      fetch: fetchWithResiliency,
    },
    auth: {
      persistSession:     true,
      autoRefreshToken:   true,
      detectSessionInUrl: true,
    },
  },
);

// ─── Warmup ──────────────────────────────────────────────────────────────────

export const warmupConnection = (): void => {
  if (!isConfigured) return;
  const pingUrl = `${supabaseUrl}/rest/v1/?apikey=${supabaseAnonKey}`;
  fetch(pingUrl, { method: 'HEAD', cache: 'no-store' }).catch(() => {
    // Silencioso — es solo un calentamiento
  });
};
