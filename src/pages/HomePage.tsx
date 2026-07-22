import { ScrollVideoBridge } from "../components/canvas/ScrollVideoBridge";

interface Props {
  onComplete?: (completed: boolean) => void;
}

export function HomePage({ onComplete }: Props) {
  return (
    <ScrollVideoBridge
      id="inicio"
      videoUrl="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
      ariaLabel="Experiencia Video JACKO"
      onComplete={onComplete}
    />
  );
}
