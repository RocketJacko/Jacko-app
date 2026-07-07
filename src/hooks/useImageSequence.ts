/**
 * useImageSequence.ts — JACKO™
 *
 * Responsabilidad única: precargar y decodificar una secuencia de URLs como
 * HTMLImageElement[], reportando progreso y estado.
 *
 * SOLID aplicado:
 *  - SRP  : sólo gestiona la carga de imágenes; no sabe nada de canvas ni scroll.
 *  - OCP  : el caché global es externo al hook (imageSequenceCache); se puede
 *           sustituir/ampliar sin modificar el hook.
 *  - DIP  : el hook recibe `urls` como dato; no crea ni conoce las rutas.
 *
 * Seguridad:
 *  - Las imágenes se cargan con `decoding='async'` para no bloquear el hilo principal.
 *  - El caché global (módulo-scope) nunca expone referencias escritas desde fuera.
 *  - La bandera `cancelled` evita setState en componentes desmontados (stale closure).
 *  - No se usa `innerHTML`, `dangerouslySetInnerHTML` ni `eval` en ningún punto.
 */

import { useEffect, useState } from 'react';

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type ImageSequenceStatus = 'loading' | 'ready' | 'error';

export interface ImageSequenceResult {
  images: readonly HTMLImageElement[];
  status: ImageSequenceStatus;
  /** Progreso de carga normalizado [0, 1] */
  progress: number;
}

// ─── Caché global de imágenes (singleton de módulo) ─────────────────────────
//
// Principio: módulo-scope → sobrevive re-mounts sin ningún estado React.
// Sólo lectura desde fuera del módulo (no se exporta la referencia al Map).
//
// Nota de seguridad: almacena únicamente HTMLImageElement; nunca datos de usuario
// ni tokens. Se limpia automáticamente con la recarga completa de la página.

const imageSequenceCache = new Map<string, HTMLImageElement>();

// ─── Helpers privados ────────────────────────────────────────────────────────

/**
 * Verifica si todas las URLs de la secuencia están en el caché global.
 * Complejidad O(n) pero n ≤ 240 en este proyecto.
 */
function allUrlsCached(urls: readonly string[]): boolean {
  return urls.every((url) => imageSequenceCache.has(url));
}

/**
 * Recupera las imágenes del caché en el mismo orden que `urls`.
 * Pre-condición: `allUrlsCached(urls) === true`.
 */
function getFromCache(urls: readonly string[]): HTMLImageElement[] {
  return urls.map((url) => imageSequenceCache.get(url)!);
}

/**
 * Carga y decodifica una imagen, almacenándola en el caché global al terminar.
 * Retorna una Promise que siempre resuelve (nunca rechaza) para simplificar el
 * manejo de errores en el sitio de llamada.
 */
function loadAndCacheImage(
  url: string,
  onProgress: () => void,
): Promise<{ url: string; img: HTMLImageElement | null }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';

    img.onload = () => {
      imageSequenceCache.set(url, img);
      onProgress();
      resolve({ url, img });
    };

    img.onerror = () => {
      onProgress();
      resolve({ url, img: null }); // fallo suave: no bloquea el resto
    };

    img.src = url;
  });
}

// ─── Hook principal ───────────────────────────────────────────────────────────

/**
 * Precarga una secuencia de URLs de imágenes.
 *
 * @param urls - Array o readonly array de URLs a precargar. Debe ser estable
 *               (memoizado en el sitio de llamada) para evitar re-cargas.
 */
export function useImageSequence(urls: readonly string[]): ImageSequenceResult {
  const [prevUrls, setPrevUrls] = useState<readonly string[]>(urls);

  const [images, setImages] = useState<HTMLImageElement[]>(() =>
    allUrlsCached(urls) ? getFromCache(urls) : []
  );
  const [status, setStatus] = useState<ImageSequenceStatus>(() =>
    allUrlsCached(urls) ? 'ready' : 'loading'
  );
  const [progress, setProgress] = useState(() =>
    allUrlsCached(urls) ? 1 : 0
  );

  // Derived state adjustment during render when urls change
  if (urls !== prevUrls) {
    setPrevUrls(urls);
    const isAllCached = allUrlsCached(urls);
    setImages(isAllCached ? getFromCache(urls) : []);
    setStatus(isAllCached ? 'ready' : 'loading');
    setProgress(isAllCached ? 1 : 0);
  }

  useEffect(() => {
    let cancelled = false;

    // ── Caso vacío ──────────────────────────────────────────────────────────
    if (urls.length === 0) {
      const tid = window.setTimeout(() => {
        if (!cancelled) {
          setImages([]);
          setStatus('ready');
          setProgress(1);
        }
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(tid);
      };
    }

    // ── Cache hit total: servir inmediatamente, sin red ─────────────────────
    if (allUrlsCached(urls)) {
      return;
    }

    // ── Carga parcial o primera carga ────────────────────────────────────────
    let loadedCount = 0;
    let hasError = false;

    const onProgress = () => {
      loadedCount++;
      if (!cancelled) {
        setProgress(loadedCount / urls.length);
      }
    };

    const loadAll = async () => {
      const promises = urls.map((url) => loadAndCacheImage(url, onProgress));
      const results = await Promise.all(promises);

      if (cancelled) return;

      // Detectar si alguna falló
      hasError = results.some((r) => r.img === null);

      // Decodificación asíncrona de las que sí cargaron
      const loaded = results
        .filter((r): r is { url: string; img: HTMLImageElement } => r.img !== null)
        .map((r) => r.img);

      await Promise.all(
        loaded.map((img) =>
          typeof img.decode === 'function'
            ? img.decode().catch(() => undefined)
            : Promise.resolve(),
        ),
      );

      if (cancelled) return;

      // Reconstruir en el orden original (algunas pueden ser null si fallaron)
      const ordered = urls.map((url) => imageSequenceCache.get(url)).filter(
        (img): img is HTMLImageElement => img !== undefined,
      );

      setImages(ordered);
      setStatus(hasError ? 'error' : 'ready');
    };

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, [urls]);

  return { images, status, progress };
}
