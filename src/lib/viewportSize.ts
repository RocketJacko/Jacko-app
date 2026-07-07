/**
 * Tamaño del viewport coherente con móvil (barra de URL): prioriza `visualViewport` si existe.
 */
export function getViewportSize(): { width: number; height: number } {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}
