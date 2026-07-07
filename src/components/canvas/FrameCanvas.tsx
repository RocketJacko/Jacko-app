import { useRef, useEffect } from "react";
import { getCanvasBackingDpr } from "../../lib/canvasDpr";
import { drawCover, type DrawCoverOptions } from "../../lib/drawCover";

interface Props {
  image: HTMLImageElement | undefined;
  options?: DrawCoverOptions;
  className?: string;
}

export function FrameCanvas({ image, options, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !image) return;

    const canvas = canvasRef.current;
    const dpr = getCanvasBackingDpr();

    // Ajustar tamaño del canvas al contenedor
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    drawCover(canvas, image, {
      ...options,
      opaque: false,
    });
  }, [image, options]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
