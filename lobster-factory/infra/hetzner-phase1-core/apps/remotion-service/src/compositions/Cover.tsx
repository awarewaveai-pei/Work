/**
 * Cover (封面) -- one still (render-worker.ts renderStill, frame 0) per finished video: the workbench's best frame
 * (video-workbench backend/cover.cjs) full-bleed, a dark layer from the bottom up to the title, and the title in the
 * 片頭 look (brand.ts) placed by cover-layout.ts inside the ratio's safe area. No box behind the text: that is the
 * subtitle look this replaces.
 * Card R2: the same component is the CoverOpener video (Root.tsx): with more than one frame it animates in
 * (cover-layout.ts coverMotion) and its last frame is this still exactly.
 */
import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import {
  BACKDROP_COLOR,
  OVERLAY_COLOR,
  SUBTITLE_FONT_WEIGHT,
  TITLE_COLOR,
  TITLE_FONT_FAMILY,
  TITLE_FONT_WEIGHT,
  TITLE_LETTER_SPACING_EM,
  TITLE_LINE_HEIGHT,
  TITLE_SHADOW,
} from "../brand";
import { coverMotion, layoutCover } from "../cover-layout";

export interface CoverProps {
  /** The frame, as a data: URI (the service cannot reach the workbench's urls) */
  backgroundUrl: string;
  title: string;
  subtitle?: string;
  durationInFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
}

export const CoverDefaultProps: CoverProps = {
  backgroundUrl: "",
  title: "封面標題 Cover Title",
  subtitle: "",
  durationInFrames: 1,
  fps: 30,
  width: 1920,
  height: 1080,
};

const lineStyle = (fontSize: number): React.CSSProperties => ({
  fontFamily: TITLE_FONT_FAMILY,
  fontWeight: TITLE_FONT_WEIGHT,
  color: TITLE_COLOR,
  textShadow: TITLE_SHADOW,
  lineHeight: TITLE_LINE_HEIGHT,
  letterSpacing: `${TITLE_LETTER_SPACING_EM}em`,
  fontSize,
  whiteSpace: "pre", // cover-layout.ts already broke the lines
});

const fill: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

export const Cover: React.FC<CoverProps> = ({ backgroundUrl, title, subtitle }) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  // Card R3: no title = a ready picture (still-opener): no dark layer, no words -- the last frame is the picture itself.
  const titled = !!String(title ?? "").trim();
  const layout = titled ? layoutCover({ width, height, title, subtitle }) : null;
  const motion = coverMotion(frame, durationInFrames, height);
  if (!layout) {
    return (
      <AbsoluteFill style={{ backgroundColor: BACKDROP_COLOR }}>
        {backgroundUrl && motion.backdropVisible && (
          <AbsoluteFill style={{ filter: `blur(${Math.round(Math.min(width, height) * 0.03)}px)`, transform: "scale(1.1)" }}>
            <Img src={backgroundUrl} style={fill} />
          </AbsoluteFill>
        )}
        {backgroundUrl && (
          <AbsoluteFill style={motion.imageScale === 1 ? undefined : { transform: `scale(${motion.imageScale})` }}>
            <Img src={backgroundUrl} style={fill} />
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    );
  }
  // Solid to just above the title, then fading out: the text always sits on the dark part.
  const solid = Math.min(100, ((height - layout.blockTop) / height) * 100 + 4);
  const clear = Math.min(100, solid + 22);
  return (
    <AbsoluteFill style={{ backgroundColor: BACKDROP_COLOR }}>
      {backgroundUrl && motion.backdropVisible && (
        <AbsoluteFill style={{ filter: `blur(${Math.round(Math.min(width, height) * 0.03)}px)`, transform: "scale(1.1)" }}>
          <Img src={backgroundUrl} style={fill} />
        </AbsoluteFill>
      )}
      {backgroundUrl && (
        <AbsoluteFill style={motion.imageScale === 1 ? undefined : { transform: `scale(${motion.imageScale})` }}>
          <Img src={backgroundUrl} style={fill} />
        </AbsoluteFill>
      )}
      <AbsoluteFill
        style={{ background: `linear-gradient(to top, ${OVERLAY_COLOR} 0%, ${OVERLAY_COLOR} ${solid}%, transparent ${clear}%)` }}
      />
      <div
        style={{
          position: "absolute",
          left: layout.box.left,
          top: layout.blockTop + motion.titleOffset,
          width: layout.box.width,
          ...(motion.titleOpacity === 1 ? {} : { opacity: motion.titleOpacity }),
        }}
      >
        {layout.lines.map((line, i) => (
          <div key={i} style={lineStyle(layout.fontSize)}>
            {line}
          </div>
        ))}
        {layout.subtitle && (
          <div style={{ ...lineStyle(layout.subtitle.fontSize), fontWeight: SUBTITLE_FONT_WEIGHT, marginTop: layout.subtitle.gap }}>
            {layout.subtitle.text}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
