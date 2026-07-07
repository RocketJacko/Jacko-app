/**
 * @vitest-environment jsdom
 *
 * queryCache.test.ts — JACKO™
 *
 * Tests para los flujos críticos del caché.
 * Usa el módulo REAL de queryCache.ts — sin mocks de funciones internas.
 * Solo fetchFn es controlado. localStorage viene de jsdom (implementación real).
 *
 * Ejecutar: npx vitest run src/lib/queryCache.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedData,
  clearAllCache,
  invalidateCache,
  invalidateCacheByPrefix,
  setCurrentUserId,
} from './queryCache';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearAllCache();
  setCurrentUserId(null);
  localStorage.clear();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 1: Cambio de usuario A→B
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cambio de usuario A→B', () => {
  it('datos de A no se sirven a B tras clearAllCache', async () => {
    setCurrentUserId('user-A');

    await getCachedData(
      'dashboard_data_user-A',
      async () => ({ points: 100, name: 'Alice' }),
      60_000
    );

    // Cambio de sesión
    clearAllCache();
    setCurrentUserId('user-B');

    // B pide los datos de A → debe hacer fetch nuevo
    let fetchCalled = false;
    const result = await getCachedData(
      'dashboard_data_user-A',
      async () => {
        fetchCalled = true;
        return { points: 0, name: 'Gone' };
      },
      60_000
    );
    expect(fetchCalled).toBe(true);
    expect(result).toEqual({ points: 0, name: 'Gone' });
  });

  it('petición in-flight de A se descarta si la sesión cambia (con delay real)', async () => {
    setCurrentUserId('user-A');

    // Petición con 100ms de delay REAL — no Promise.resolve() síncrono.
    // Esto simula un server que tarda en responder.
    const fetchPromise = getCachedData(
      'slow_data',
      async () => {
        await sleep(100); // ← delay real: 100ms
        return 'data-from-user-A';
      },
      60_000,
      true // forceRefresh
    );

    // Cambiar sesión MIENTRAS la petición está en vuelo (50ms después de iniciar)
    await sleep(50);
    clearAllCache();
    setCurrentUserId('user-B');

    // La petición de A resuelve después del cambio de sesión
    const result = await fetchPromise;
    // El resultado se devuelve al caller (no se puede evitar — la promesa ya existe)
    expect(result).toBe('data-from-user-A');

    // PERO no se guardó en caché — un nuevo fetch debe llamar a fetchFn
    let fetchCalledForB = false;
    await getCachedData(
      'slow_data',
      async () => {
        fetchCalledForB = true;
        return 'data-from-user-B';
      },
      60_000,
      false
    );
    expect(fetchCalledForB).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 2: L2 owner validation (localStorage)
// ═══════════════════════════════════════════════════════════════════════════════

describe('L2 owner validation', () => {
  it('rechaza L2 entries de otro usuario', async () => {
    // Simular entry en localStorage de user-A
    localStorage.setItem('jacko_cache_private_data', JSON.stringify({
      data: { secret: 'alice-secret' },
      timestamp: Date.now(),
      ownerId: 'user-A',
    }));

    // Sesión activa: user-B
    setCurrentUserId('user-B');

    let fetchCalled = false;
    const result = await getCachedData(
      'private_data',
      async () => {
        fetchCalled = true;
        return { secret: 'bob-secret' };
      },
      60_000
    );

    expect(fetchCalled).toBe(true);
    expect(result).toEqual({ secret: 'bob-secret' });
  });

  it('acepta L2 entries públicas (ownerId=null)', async () => {
    // Entry pública en L2
    localStorage.setItem('jacko_cache_catalog', JSON.stringify({
      data: [{ id: 1, name: 'Product' }],
      timestamp: Date.now(),
      ownerId: null,
    }));

    setCurrentUserId('user-A');

    let fetchCalled = false;
    const result = await getCachedData(
      'catalog',
      async () => {
        fetchCalled = true;
        return [{ id: 2, name: 'Other' }];
      },
      60_000
    );

    // Dato público → debe servir de L2
    expect(fetchCalled).toBe(false);
    expect(result).toEqual([{ id: 1, name: 'Product' }]);
  });

  it('rechaza L2 entries legacy (sin campo ownerId) cuando hay usuario activo', async () => {
    // Entry del código viejo — no tiene ownerId
    localStorage.setItem('jacko_cache_old_data', JSON.stringify({
      data: { legacy: true },
      timestamp: Date.now(),
      // ownerId NO presente — simula código pre-upgrade
    }));

    setCurrentUserId('user-B');

    let fetchCalled = false;
    const result = await getCachedData(
      'old_data',
      async () => {
        fetchCalled = true;
        return { legacy: false, fresh: true };
      },
      60_000
    );

    // Entry legacy con usuario activo → rechazar, forzar fetch
    expect(fetchCalled).toBe(true);
    expect(result).toEqual({ legacy: false, fresh: true });
  });

  it('acepta L2 entries legacy cuando no hay usuario (datos públicos)', async () => {
    localStorage.setItem('jacko_cache_public_old', JSON.stringify({
      data: { public: true },
      timestamp: Date.now(),
      // Sin ownerId
    }));

    setCurrentUserId(null);

    let fetchCalled = false;
    const result = await getCachedData(
      'public_old',
      async () => {
        fetchCalled = true;
        return { public: false };
      },
      60_000
    );

    // Sin usuario + sin ownerId → tratar como público
    expect(fetchCalled).toBe(false);
    expect(result).toEqual({ public: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 3: Circuit breaker
// ═══════════════════════════════════════════════════════════════════════════════

describe('Circuit breaker', () => {
  it('se abre tras 3 fallos de infraestructura y sirve stale', async () => {
    setCurrentUserId('user-A');

    // Guardar datos stale primero
    await getCachedData('fragile', async () => ({ value: 'stale' }), 60_000);

    // Invalidar para forzar re-fetch
    invalidateCache('fragile');

    // 3 fallos 5xx consecutivos (errores de infraestructura)
    const make5xxError = () => {
      const err = new Error('Internal Server Error') as Error & { status: number };
      err.status = 500;
      return err;
    };

    for (let i = 0; i < 3; i++) {
      try {
        await getCachedData(
          'fragile',
          async () => { throw make5xxError(); },
          60_000, true, 0 // forceRefresh, 0 retries
        );
      } catch {
        // Esperado
      }
    }

    // Circuito abierto — el fetchFn NO debe ejecutarse
    let fetchCalled = false;

    // Poner dato stale en L2 para probar fallback
    localStorage.setItem('jacko_cache_fragile', JSON.stringify({
      data: { value: 'stale-l2' },
      timestamp: Date.now() - 120_000, // expirado pero existente
      ownerId: 'user-A',
    }));

    const result = await getCachedData(
      'fragile',
      async () => {
        fetchCalled = true;
        return { value: 'fresh' };
      },
      60_000,
      true, // forceRefresh — pero circuito está abierto
      0
    );

    // Circuito abierto → sirvió stale de L2, no llamó fetchFn
    expect(fetchCalled).toBe(false);
    expect(result).toEqual({ value: 'stale-l2' });
  });

  it('404 NO abre el circuit breaker', async () => {
    setCurrentUserId('user-A');

    const make404Error = () => {
      const err = new Error('Not Found') as Error & { status: number };
      err.status = 404;
      return err;
    };

    // 5 errores 404 consecutivos
    for (let i = 0; i < 5; i++) {
      try {
        await getCachedData(
          'missing_resource',
          async () => { throw make404Error(); },
          60_000, true, 0
        );
      } catch {
        // Esperado
      }
    }

    // El circuito NO debe estar abierto — 404 no es infraestructura
    let fetchCalled = false;
    try {
      await getCachedData(
        'missing_resource',
        async () => {
          fetchCalled = true;
          throw make404Error();
        },
        60_000, true, 0
      );
    } catch {
      // Esperado
    }

    // fetchFn SÍ fue llamado — circuito no bloqueó
    expect(fetchCalled).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 4: Clasificación de errores
// ═══════════════════════════════════════════════════════════════════════════════

describe('Error classification', () => {
  it('no reintenta errores 401', async () => {
    setCurrentUserId('user-A');
    let callCount = 0;

    try {
      await getCachedData(
        'auth_test',
        async () => {
          callCount++;
          const err = new Error('Unauthorized') as Error & { status: number };
          err.status = 401;
          throw err;
        },
        60_000, true, 2 // permitir hasta 2 retries
      );
    } catch {
      // Esperado
    }

    // Solo 1 intento — no reintentó
    expect(callCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 5: Prefix invalidation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Prefix invalidation', () => {
  it('invalida entries admin_* pero no dashboard', async () => {
    setCurrentUserId('user-A');

    await getCachedData('admin_orders', async () => ['order1'], 60_000);
    await getCachedData('admin_users', async () => ['user1'], 60_000);
    await getCachedData('dashboard_data', async () => ['dash1'], 60_000);

    invalidateCacheByPrefix('admin_');

    // admin_orders debe ser miss
    let adminFetchCalled = false;
    await getCachedData('admin_orders', async () => {
      adminFetchCalled = true;
      return ['order2'];
    }, 60_000);
    expect(adminFetchCalled).toBe(true);

    // dashboard debe seguir en caché
    let dashFetchCalled = false;
    await getCachedData('dashboard_data', async () => {
      dashFetchCalled = true;
      return ['dash2'];
    }, 60_000);
    expect(dashFetchCalled).toBe(false);
  });
});
