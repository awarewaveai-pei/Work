/**
 * Cover (封面) -- one still (render-worker.ts renderStill, frame 0) per finished video: the workbench's best frame
 * (video-workbench backend/cover.cjs) full-bleed, a dark layer from the bottom up to the title, and the title in the
 * 片頭 look (brand.ts) placed by cover-layout.ts inside the ratio's safe area. No box behind the text: that is the
 * subtitle look this replaces.
 */
import React from "react";
import { AbsoluteFill, Img, useVideoConfig } from "remotion";
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
import { layoutCover } from "../cover-layout";

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

export const Cover: React.FC<CoverProps> = ({ backgroundUrl, title, subtitle }) => {
  const { width, height } = useVideoConfig();
  const layout = layoutCover({ width, height, title, subtitle });
  // Solid to just above the title, then fading out: the text always sits on the dark part.
  const solid = Math.min(100, ((height - layout.blockTop) / height) * 100 + 4);
  const clear = Math.min(100, solid + 22);
  return (
    <AbsoluteFill style={{ backgroundColor: BACKDROP_COLOR }}>
      {backgroundUrl && (
        <Img src={backgroundUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      <AbsoluteFill
        style={{ background: `linear-gradient(to top, ${OVERLAY_COLOR} 0%, ${OVERLAY_COLOR} ${solid}%, transparent ${clear}%)` }}
      />
      <div style={{ position: "absolute", left: layout.box.left, top: layout.blockTop, width: layout.box.width }}>
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
