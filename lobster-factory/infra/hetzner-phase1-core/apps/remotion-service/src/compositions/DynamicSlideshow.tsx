import React from "react";
import {
  SceneSeries,
  SceneItem,
  calculateSceneSeriesDuration,
} from "./SceneSeries";

export interface DynamicSlideshowProps {
  scenes: SceneItem[];
  backgroundColor?: string;
  audioUrl?: string;
  /** Global logo applied to all scenes; per-scene logoUrl overrides this. */
  logoUrl?: string;
  transitionDurationSeconds?: number;
  fps?: number;
  width?: number;
  height?: number;
  captions?: Array<{ startFrame: number; endFrame: number; text: string }>;
}

const DEFAULT_SCENES: SceneItem[] = [
  { imageUrl: "", text: "Scene 1", durationInSeconds: 6 },
  { imageUrl: "", text: "Scene 2", durationInSeconds: 6 },
  { imageUrl: "", text: "Scene 3", durationInSeconds: 6 },
];

export const DynamicSlideshowDefaultProps: DynamicSlideshowProps = {
  scenes: DEFAULT_SCENES,
  backgroundColor: "#0ebba2",
  audioUrl: "",
  transitionDurationSeconds: 1.0,
  fps: 30,
  width: 1920,
  height: 1080,
  captions: [],
};

export const DynamicSlideshow: React.FC<DynamicSlideshowProps> = ({
  scenes,
  backgroundColor = "#0ebba2",
  audioUrl,
  logoUrl,
  transitionDurationSeconds = 1.0,
  captions = [],
}) => {
  // Merge global logoUrl as fallback for scenes that don't specify one.
  const scenesWithLogo: SceneItem[] = logoUrl
    ? scenes.map((s) => ({ ...s, logoUrl: s.logoUrl ?? logoUrl }))
    : scenes;

  return (
    <SceneSeries
      scenes={scenesWithLogo}
      backgroundColor={backgroundColor}
      audioUrl={audioUrl}
      transitionDurationSeconds={transitionDurationSeconds}
      captions={captions}
    />
  );
};

export { calculateSceneSeriesDuration };
