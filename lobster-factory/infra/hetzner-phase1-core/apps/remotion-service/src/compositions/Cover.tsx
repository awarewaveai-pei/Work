/**
 * Cover (封面) -- one still (render-worker.ts renderStill, frame 0) per finished video: the workbench's best frame
 * (video-workbench backend/cover.cjs) full-bleed, a dark layer from the bottom up to the title, and the title in the
 * 片頭 look (brand.ts) placed by cover-layout.ts inside the ratio's safe area. No box behind the text: that is the
 * subtitle look this replaces.
 * Card R2: the same component is the CoverOpener video (Root.tsx): with more than one frame it animates in
 * (cover-layout.ts coverMotion) and its last frame is this still exactly.
 */
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
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

// Card R5: the blurred backdrop is made ONCE per render, not on every frame. A CSS blur on a full-frame layer is redrawn
// for each frame with software GL (swangle): on a laptop pinned to 2 cores it was ~45% of a frame (140 -> 81 ms); the
// production share is to be measured (scripts/profile-opener.mjs). Here the picture is drawn once into a small canvas
// (1/8 size, so the blur is 1/8 the radius and 1/64 the pixels) with the blur and darkening baked in, and every frame
// only scales that finished image up. null = not needed (a 1-frame cover) or not ready; a picture that does not load
// gives no backdrop (the dark colour shows), never a stuck render.
const BACKDROP_STEP = 8;
function useBackdrop(src: string, width: number, height: number, darken: number, needed: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const [handle] = useState(() => (needed && src ? delayRender("blurred backdrop") : null));
  useEffect(() => {
    if (handle === null) return;
    const img = new Image();
    const done = () => continueRender(handle);
    img.onload = () => {
      try {
        const w = Math.max(2, Math.round(width / BACKDROP_STEP)), h = Math.max(2, Math.round(height / BACKDROP_STEP));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        if (ctx) {
          // cover-fit, 1.1x (the blur's soft edge falls outside the frame), blurred by 3% of the short side like before
          const s = Math.max(w / img.width, h / img.height) * 1.1, dw = img.width * s, dh = img.height * s;
          ctx.fillStyle = BACKDROP_COLOR;
          ctx.fillRect(0, 0, w, h);
          ctx.filter = `blur(${(Math.min(width, height) * 0.03) / BACKDROP_STEP}px) brightness(${darken})`;
          ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
          setUrl(c.toDataURL("image/png"));   // lossless: JPEG blocks would show 8x enlarged in the dark gradient
        }
      } finally {
        done();
      }
    };
    img.onerror = done;
    img.src = src;
  }, [handle, src, width, height, darken]);
  return url;
}
const whole: React.CSSProperties = { width: "100%", height: "100%", objectFit: "contain" };

export const Cover: React.FC<CoverProps> = ({ backgroundUrl, title, subtitle }) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  // Card R3: no title = a ready picture (still-opener, a banner card): no words drawn, and the card is never cut -- the
  // whole picture fits the frame (contain) over the same picture enlarged, blurred and darkened, shown to the end. A card
  // of the video's shape fills the frame, so its last frame is the picture itself.
  const titled = !!String(title ?? "").trim();
  const layout = titled ? layoutCover({ width, height, title, subtitle }) : null;
  const motion = coverMotion(frame, durationInFrames, height);
  // the still opener shows its backdrop to the end (darkened); an animated cover only while it zooms in
  const backdrop = useBackdrop(backgroundUrl, width, height, layout ? 1 : 0.55, !layout || durationInFrames > 1);
  if (!layout) {
    return (
      <AbsoluteFill style={{ backgroundColor: BACKDROP_COLOR }}>
        {backdrop && <Img src={backdrop} style={fill} />}
        {backgroundUrl && (
          <AbsoluteFill style={motion.imageScale === 1 ? undefined : { transform: `scale(${motion.imageScale})` }}>
            <Img src={backgroundUrl} style={whole} />
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
      {backdrop && motion.backdropVisible && <Img src={backdrop} style={fill} />}
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
