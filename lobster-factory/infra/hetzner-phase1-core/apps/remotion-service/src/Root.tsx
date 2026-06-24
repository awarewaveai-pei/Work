import React from "react";
import { Composition } from "remotion";
import {
  ScaleBGTextSlideUp,
  ScaleBGTextSlideUpDefaultProps,
} from "./compositions/ScaleBGTextSlideUp";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ScaleBGTextSlideUp"
        component={ScaleBGTextSlideUp}
        durationInFrames={ScaleBGTextSlideUpDefaultProps.durationInFrames ?? 362}
        fps={ScaleBGTextSlideUpDefaultProps.fps ?? 30}
        width={ScaleBGTextSlideUpDefaultProps.width ?? 1920}
        height={ScaleBGTextSlideUpDefaultProps.height ?? 1080}
        defaultProps={ScaleBGTextSlideUpDefaultProps}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: props.durationInFrames ?? 362,
          fps: props.fps ?? 30,
          width: props.width ?? 1920,
          height: props.height ?? 1080,
        })}
      />
    </>
  );
};
