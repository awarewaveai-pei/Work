import React from "react";
import { Composition } from "remotion";
import {
  ScaleBGTextSlideUp,
  ScaleBGTextSlideUpDefaultProps,
} from "./compositions/ScaleBGTextSlideUp";
import {
  PanSlideTextLeft3Scenes,
  PanSlideTextLeft3ScenesDefaultProps,
} from "./compositions/PanSlideTextLeft3Scenes";
import {
  CircleMaskTextSlideUpReveal,
  CircleMaskTextSlideUpRevealDefaultProps,
} from "./compositions/CircleMaskTextSlideUpReveal";
import {
  ProductReviewTypewriter,
  ProductReviewTypewriterDefaultProps,
} from "./compositions/ProductReviewTypewriter";
import {
  PhotoHighlightsSlidesZoom,
  PhotoHighlightsSlidesZoomDefaultProps,
} from "./compositions/PhotoHighlightsSlidesZoom";

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

      <Composition
        id="PanSlideTextLeft3Scenes"
        component={PanSlideTextLeft3Scenes}
        durationInFrames={PanSlideTextLeft3ScenesDefaultProps.durationInFrames ?? 600}
        fps={PanSlideTextLeft3ScenesDefaultProps.fps ?? 30}
        width={PanSlideTextLeft3ScenesDefaultProps.width ?? 1080}
        height={PanSlideTextLeft3ScenesDefaultProps.height ?? 1920}
        defaultProps={PanSlideTextLeft3ScenesDefaultProps}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: props.durationInFrames ?? 600,
          fps: props.fps ?? 30,
          width: props.width ?? 1080,
          height: props.height ?? 1920,
        })}
      />

      <Composition
        id="CircleMaskTextSlideUpReveal"
        component={CircleMaskTextSlideUpReveal}
        durationInFrames={
          CircleMaskTextSlideUpRevealDefaultProps.durationInFrames ?? 600
        }
        fps={CircleMaskTextSlideUpRevealDefaultProps.fps ?? 30}
        width={CircleMaskTextSlideUpRevealDefaultProps.width ?? 1920}
        height={CircleMaskTextSlideUpRevealDefaultProps.height ?? 1080}
        defaultProps={CircleMaskTextSlideUpRevealDefaultProps}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: props.durationInFrames ?? 600,
          fps: props.fps ?? 30,
          width: props.width ?? 1920,
          height: props.height ?? 1080,
        })}
      />

      <Composition
        id="ProductReviewTypewriter"
        component={ProductReviewTypewriter}
        durationInFrames={
          ProductReviewTypewriterDefaultProps.durationInFrames ?? 300
        }
        fps={ProductReviewTypewriterDefaultProps.fps ?? 30}
        width={ProductReviewTypewriterDefaultProps.width ?? 1920}
        height={ProductReviewTypewriterDefaultProps.height ?? 1080}
        defaultProps={ProductReviewTypewriterDefaultProps}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: props.durationInFrames ?? 300,
          fps: props.fps ?? 30,
          width: props.width ?? 1920,
          height: props.height ?? 1080,
        })}
      />

      <Composition
        id="PhotoHighlightsSlidesZoom"
        component={PhotoHighlightsSlidesZoom}
        durationInFrames={
          PhotoHighlightsSlidesZoomDefaultProps.durationInFrames ?? 1320
        }
        fps={PhotoHighlightsSlidesZoomDefaultProps.fps ?? 60}
        width={PhotoHighlightsSlidesZoomDefaultProps.width ?? 1920}
        height={PhotoHighlightsSlidesZoomDefaultProps.height ?? 1080}
        defaultProps={PhotoHighlightsSlidesZoomDefaultProps}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: props.durationInFrames ?? 1320,
          fps: props.fps ?? 60,
          width: props.width ?? 1920,
          height: props.height ?? 1080,
        })}
      />
    </>
  );
};
