/**
 * queryCache.ts — JACKO™
 *
 * Caché de doble capa con protección completa contra datos cruzados:
 *
 *   L1 → Memoria (instantáneo, se pierde al refrescar)
 *   L2 → localStorage (persiste entre recargas, 5MB límite)
 *
 * Protecciones:
 *
 *  1. Session generation token: cada petición captura la generación al inicio.
 *     Si clearAllCache() corre antes de que resuelva, el resultado se descarta.
 *
 *  2. Owner userId en L2: cada entrada en localStorage guarda el userId que la
 *     creó. Al hidratar desde L2, se compara contra el userId actual. Si no
 *     coincide, la entrada se borra y se trata como cache miss.
 *     Esto cierra el vector: recarga de página con sesión diferente.
 *
 *  3. Circuit breaker con ventana temporal: los fallos se cuentan dentro de una
 *     ventana de CIRCUIT_WINDOW_MS (60s). Fallos fuera de la ventana no cuentan.
 *     CIRCUIT_THRESHOLD (3) fallos dentro de la ventana → abre el circuito por
 *     CIRCUIT_COOLDOWN (30s). Después del cooldown: half-open (1 intento).
 *     Un éxito resetea el estado completamente.
 *
 *  4. Clasificación de errores: 401/403/404 nunca reintentan. 5xx/red reintentan
 *     con backoff hasta MAX_RETRIES (2). Timeout (AbortError) no reintenta.
 *
 *  5. Quota exceeded: tras evictar 3 entradas viejas, reintenta la escritura
 *     exactamente 1 vez. Si falla, el dato queda solo en L1 — se logea a
 *     consola para que sea visible en debugging.
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/** Entrada en localStorage — incluye userId para validación al hidratar. */
interface L2Entry<T> {
  data: T;
  timestamp: number;
  /** userId que creó esta entrada. null = dato público (sin sesión). */
  ownerId: string | null;
}

interface CircuitState {
  /** Timestamps de cada fallo dentro de la ventana activa. */
  failureTimestamps: number[];
  /** Si el circuito está abierto, timestamp hasta el cual permanece abierto. */
  openUntil: number;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const LS_PREFIX          = 'jacko_cache_';
const DEFAULT_TTL        = import.meta.env.DEV ? 1000 : 300_000;   // 1 segundo en desarrollo, 5 minutos en producción
const MAX_RETRIES        = 2;         // 3 intentos totales (1 + 2 retries)

/**
 * Circuit breaker:
 *  - Ventana: 60 segundos. Solo se cuentan fallos dentro de esta ventana.
 *    Fallos más viejos se descartan. Esto evita que 3 errores dispersos en
 *    24h abran el circuito.
 *  - Umbral: 3 fallos dentro de la ventana → abre.
 *  - Cooldown: 30 segundos. Después de este período: half-open (permite 1 intento).
 */
const CIRCUIT_WINDOW_MS  = 60_000;
const CIRCUIT_THRESHOLD  = 3;
const CIRCUIT_COOLDOWN   = 30_000;

// ─── Estado global ───────────────────────────────────────────────────────────

const memCache: Record<string, CacheEntry<unknown>> = {};
const inFlight: Record<string, Promise<unknown>> = {};
const circuits: Record<string, CircuitState> = {};

/**
 * Generación de sesión. Se incrementa en cada clearAllCache().
 * Peticiones iniciadas bajo una generación anterior descartan su resultado.
 */
let sessionGeneration = 0;

/**
 * userId del usuario actual. Se establece con setCurrentUserId().
 * Se usa para:
 *  - Validar L2 entries al hidratar (owner check)
 *  - Etiquetar nuevas L2 entries
 */
let currentUserId: string | null = null;

// ─── API: userId management ──────────────────────────────────────────────────

/**
 * Establece el userId actual. Debe llamarse desde AuthContext cuando la
 * sesión cambia. Permite que L2 valide la propiedad de cada entrada.
 */
export function setCurrentUserId(userId: string | null): void {
  currentUserId = userId;
}

// ─── Helpers: localStorage ───────────────────────────────────────────────────

function lsRead<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as L2Entry<T>;

    // ── Owner validation ──
    //
    // Tres casos:
    //  1. ownerId === null          → dato público → aceptar siempre
    //  2. ownerId === currentUserId  → dato del usuario actual → aceptar
    //  3. ownerId === undefined      → entry legacy (pre-ownerId) → rechazar
    //     si hay un usuario logueado (no podemos verificar propiedad).
    //     Si nadie está logueado (currentUserId=null), aceptar como público.
    //  4. ownerId !== currentUserId  → dato de otro usuario → rechazar
    //
    const owner = parsed.ownerId;

    if (typeof owner === 'undefined') {
      // Legacy entry: no tiene ownerId.
      if (currentUserId !== null) {
        // Hay usuario logueado → no podemos verificar propiedad → rechazar
        try { localStorage.removeItem(LS_PREFIX + key); } catch { /* noop */ }
        return null;
      }
      // Sin usuario logueado → tratar como pública
    } else if (owner !== null && owner !== currentUserId) {
      // Entry de otro usuario → rechazar
      try { localStorage.removeItem(LS_PREFIX + key); } catch { /* noop */ }
      return null;
    }

    return { data: parsed.data, timestamp: parsed.timestamp };
  } catch {
    try { localStorage.removeItem(LS_PREFIX + key); } catch { /* noop */ }
    return null;
  }
}

function lsWrite<T>(key: string, entry: CacheEntry<T>): void {
  const l2Entry: L2Entry<T> = {
    data: entry.data,
    timestamp: entry.timestamp,
    ownerId: currentUserId,
  };
  const serialized = JSON.stringify(l2Entry);

  try {
    localStorage.setItem(LS_PREFIX + key, serialized);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      evictOldestEntries(3);
      // Reintento único después de evicción
      try {
        localStorage.setItem(LS_PREFIX + key, serialized);
      } catch {
        // Persistencia perdida para esta key — queda solo en L1.
        // Log explícito para que sea visible en debugging.
        console.warn(`[Cache] L2 escritura fallida para "${key}" tras evicción — dato solo en L1.`);
      }
    }
  }
}

function lsRemove(key: string): void {
  try { localStorage.removeItem(LS_PREFIX + key); } catch { /* noop */ }
}

function evictOldestEntries(count: number): void {
  const entries: { key: string; timestamp: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const fullKey = localStorage.key(i);
    if (!fullKey?.startsWith(LS_PREFIX)) continue;
    try {
      const raw = localStorage.getItem(fullKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as L2Entry<unknown>;
      entries.push({ key: fullKey, timestamp: parsed.timestamp });
    } catch { /* skip corrupted */ }
  }
  entries.sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 0; i < Math.min(count, entries.length); i++) {
    try { localStorage.removeItem(entries[i].key); } catch { /* noop */ }
  }
}

// ─── Circuit Breaker (con ventana temporal) ───────────────────────────────���──

/**
 * Determina si el circuito está abierto para una key.
 *
 * Lógica:
 *  1. Si no hay estado → cerrado.
 *  2. Si openUntil > ahora → abierto (en cooldown).
 *  3. Si openUntil <= ahora → half-open: borrar estado y permitir 1 intento.
 *  4. Si hay estado pero los fallos son < THRESHOLD tras limpiar la ventana → cerrado.
 */
function isCircuitOpen(key: string): boolean {
  const c = circuits[key];
  if (!c) return false;

  const now = Date.now();

  // Si está en cooldown activo → abierto
  if (c.openUntil > now) return true;

  // Si el cooldown ya pasó → half-open (borrar estado, permitir intento)
  if (c.openUntil > 0) {
    delete circuits[key];
    return false;
  }

  // Limpiar fallos fuera de la ventana temporal
  c.failureTimestamps = c.failureTimestamps.filter(t => now - t < CIRCUIT_WINDOW_MS);

  if (c.failureTimestamps.length < CIRCUIT_THRESHOLD) {
    // No alcanza umbral → cerrado
    if (c.failureTimestamps.length === 0) delete circuits[key];
    return false;
  }

  // Umbral alcanzado → debería estar abierto, pero recordFailure ya lo abrió.
  // Este path no debería ejecutarse normalmente.
  return false;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const c = circuits[key] ?? { failureTimestamps: [], openUntil: 0 };

  // Registrar fallo con timestamp
  c.failureTimestamps.push(now);

  // Limpiar fallos fuera de la ventana
  c.failureTimestamps = c.failureTimestamps.filter(t => now - t < CIRCUIT_WINDOW_MS);

  if (c.failureTimestamps.length >= CIRCUIT_THRESHOLD) {
    c.openUntil = now + CIRCUIT_COOLDOWN;
    console.warn(
      `[Cache] Circuit breaker ABIERTO para "${key}" — ` +
      `${c.failureTimestamps.length} fallos en ${CIRCUIT_WINDOW_MS / 1000}s. ` +
      `Cooldown: ${CIRCUIT_COOLDOWN / 1000}s.`
    );
  }

  circuits[key] = c;
}

function recordSuccess(key: string): void {
  delete circuits[key];
}

// ─── Clasificación de errores ────────────────────────────────────────────────

function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) return true;

  if (typeof err === 'object' && err !== null) {
    const status = (err as Record<string, unknown>).status ??
                   (err as Record<string, unknown>).statusCode;
    if (typeof status === 'number') {
      if (status === 401 || status === 403 || status === 404) return false;
      if (status >= 500) return true;
    }
    const code = (err as Record<string, unknown>).code;
    if (code === 'PGRST301' || code === '42501') return false;
  }

  if (err instanceof DOMException && err.name === 'AbortError') return false;

  return true;
}

/**
 * Determina si un error es de infraestructura (debería contar para circuit breaker).
 * Solo errores 5xx y de red cuentan. Errores de negocio (401, 404) NO abren el circuito.
 *
 * Distinción clave:
 *  - 404: el recurso no existe → error de lógica, no de infraestructura
 *  - 401: token expirado → error de auth, no de infraestructura
 *  - 503: servidor caído → SÍ es infraestructura
 *  - TypeError(fetch): red caída → SÍ es infraestructura
 */
function isInfrastructureError(err: unknown): boolean {
  if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) return true;

  if (typeof err === 'object' && err !== null) {
    const status = (err as Record<string, unknown>).status ??
                   (err as Record<string, unknown>).statusCode;
    if (typeof status === 'number') return status >= 500;
  }

  return false;
}

// ─── API Principal ───────────────────────────────────────────────────────────

export async function getCachedData<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlMs = DEFAULT_TTL,
  forceRefresh = false,
  retries = MAX_RETRIES,
  persist = true
): Promise<T> {
  const now = Date.now();

  // Circuit breaker
  if (isCircuitOpen(key)) {
    const stale = memCache[key] ?? (persist ? lsRead<T>(key) : null);
    if (stale) return stale.data as T;
    throw new Error(`[Cache] Circuit breaker abierto para "${key}".`);
  }

  // L1: Memoria
  if (!forceRefresh) {
    const mem = memCache[key];
    if (mem && now - mem.timestamp < ttlMs) {
      return mem.data as T;
    }

    // L2: localStorage (con validación de userId)
    if (persist) {
      const ls = lsRead<T>(key);
      if (ls) {
        memCache[key] = ls;
        if (now - ls.timestamp < ttlMs) {
          return ls.data;
        }
        // El caché ha expirado. Procedemos a buscar datos frescos de la base de datos.
      }
    }
  }

  // Deduplicación
  if (key in inFlight) {
    return inFlight[key] as Promise<T>;
  }

  // Capturar generación
  const startGeneration = sessionGeneration;

  const fetching = (async () => {
    let lastError: unknown;
    const maxAttempts = Math.min(retries, MAX_RETRIES);

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        const data = await fetchFn();

        if (sessionGeneration !== startGeneration) {
          return data;
        }

        const entry: CacheEntry<T> = { data, timestamp: Date.now() };
        memCache[key] = entry;
        if (persist) lsWrite(key, entry);
        recordSuccess(key);
        return data;
      } catch (err) {
        lastError = err;

        if (sessionGeneration !== startGeneration) {
          throw new Error('[Cache] Sesión cambió — petición abortada.', { cause: err });
        }

        // ── No reintentar errores irrecuperables ──
        if (!isRetryableError(err)) {
          // Solo errores de infraestructura cuentan para circuit breaker.
          // Un 404 o 401 no debería abrir el circuito — no es un problema del servidor.
          if (isInfrastructureError(err)) recordFailure(key);
          throw err;
        }

        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 1_000 * 2 ** attempt));
        }
      }
    }

    // Todos los reintentos agotados → registrar como fallo de infraestructura
    recordFailure(key);
    throw lastError;
  })().finally(() => {
    delete inFlight[key];
  });

  inFlight[key] = fetching;
  return fetching as Promise<T>;
}


// ─── Invalidación ────────────────────────────────────────────────────────────

export function invalidateCache(key: string): void {
  delete memCache[key];
  delete inFlight[key];
  lsRemove(key);
}

export function invalidateCacheByPrefix(prefix: string): void {
  Object.keys(memCache).forEach(k => {
    if (k.startsWith(prefix)) delete memCache[k];
  });
  Object.keys(inFlight).forEach(k => {
    if (k.startsWith(prefix)) delete inFlight[k];
  });

  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const fullKey = localStorage.key(i);
    if (fullKey?.startsWith(LS_PREFIX + prefix)) {
      toRemove.push(fullKey);
    }
  }
  toRemove.forEach(k => {
    try { localStorage.removeItem(k); } catch { /* noop */ }
  });
}

export function clearAllCache(): void {
  sessionGeneration++;

  Object.keys(memCache).forEach(k => delete memCache[k]);
  Object.keys(inFlight).forEach(k => delete inFlight[k]);
  Object.keys(circuits).forEach(k => delete circuits[k]);

  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const fullKey = localStorage.key(i);
    if (fullKey?.startsWith(LS_PREFIX)) {
      toRemove.push(fullKey);
    }
  }
  toRemove.forEach(k => {
    try { localStorage.removeItem(k); } catch { /* noop */ }
  });
}
