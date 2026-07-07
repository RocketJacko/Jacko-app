import { ScrollEscudoFase2Bridge } from "../components/canvas/ScrollEscudoFase2Bridge";
import { MI_PERSONAJE_FRAME_URLS } from "../generated/miPersonajeFrameUrls";

interface Props {
  onComplete?: (completed: boolean) => void;
}

export function HomePage({ onComplete }: Props) {
  // Dividimos los 240 frames en los segmentos que espera el Bridge
  const f1Urls = MI_PERSONAJE_FRAME_URLS.slice(0, 80);
  const f2Urls = MI_PERSONAJE_FRAME_URLS.slice(80, 160);
  const f3Urls = MI_PERSONAJE_FRAME_URLS.slice(160, 240);

  return (
    <ScrollEscudoFase2Bridge
      id="inicio"
      escudoFrameUrls={f1Urls}
      fase2FrameUrls={f2Urls}
      fase3FrameUrls={f3Urls}
      ariaLabel="Experiencia 3D JACKO"
      onComplete={onComplete}
    />
  );
}
