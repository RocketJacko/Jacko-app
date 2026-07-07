export type DrawCoverOptions = {
  fill?: string;
  /** false = canvas con canal alpha (porrista sobre backdrop). Por defecto true. */
  opaque?: boolean;
  cropSource?: { left?: number; top?: number; right?: number; bottom?: number };
  insetCssPx?: number;
  mode?: 'cover' | 'contain';
};

export function drawCover(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  options?: DrawCoverOptions,
): void {
  const opaque = options?.opaque === true;
  const ctx = canvas.getContext('2d', { alpha: !opaque });
  if (!ctx || !img.naturalWidth) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const cw = canvas.width;
  const ch = canvas.height;
  const cssW = canvas.clientWidth || cw;
  const dpr = cw / Math.max(1, cssW);

  const inset = (options?.insetCssPx ?? 0) * dpr;
  const availW = Math.max(1, cw - 2 * inset);
  const availH = Math.max(1, ch - 2 * inset);

  const cr = options?.cropSource;
  const sx = cr?.left ?? 0;
  const sy = cr?.top ?? 0;
  const sw = Math.max(1, img.naturalWidth - sx - (cr?.right ?? 0));
  const sh = Math.max(1, img.naturalHeight - sy - (cr?.bottom ?? 0));

  const mode = options?.mode ?? 'cover';
  const scale = mode === 'cover' 
    ? Math.max(availW / sw, availH / sh)
    : Math.min(availW / sw, availH / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = inset + (availW - dw) / 2;
  const dy = inset + (availH - dh) / 2;

  if (options?.fill) {
    ctx.fillStyle = options.fill;
    ctx.fillRect(0, 0, cw, ch);
  } else {
    ctx.clearRect(0, 0, cw, ch);
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
