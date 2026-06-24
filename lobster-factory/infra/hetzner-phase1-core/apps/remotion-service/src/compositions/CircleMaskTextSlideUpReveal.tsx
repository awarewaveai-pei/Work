import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface CircleMaskTextSlideUpRevealProps {
  imageUrl: string;
  headline: string;
  brand?: string;
  tagline?: string;
  logoUrl?: string;
  audioUrl?: string;
  durationInFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
}

export const CircleMaskTextSlideUpRevealDefaultProps: CircleMaskTextSlideUpRevealProps =
  {
    imageUrl: "",
    headline: "Your Headline Here",
    brand: "Brand Name",
    tagline: "Your tagline goes here",
    logoUrl: "",
    audioUrl: "",
    durationInFrames: 600,
    fps: 30,
    width: 1920,
    height: 1080,
  };

// Image with clipPath circle-reveal animation (correct CSS approach)
const CircleRevealImage: React.FC<{
  imageUrl: string;
  frame: number;
  fps: number;
  totalFrames: number;
}> = ({ imageUrl, frame, fps, totalFrames }) => {
  // Circle reveal: 0%→150% radius at 1s
  const progress = spring({
    fps,
    frame,
    config: { damping: 30, stiffness: 100 },
  });
  const radius = interpolate(progress, [0, 1], [0, 150], {
    extrapolateRight: "clamp",
  });

  // Subtle scale-pan: 100→120% over full duration (sinusoid easing)
  const bgScale = interpolate(frame, [0, totalFrames], [1.0, 1.2], {
    extrapolateRight: "clamp",
    easing: (t) => Math.sin((t * Math.PI) / 2),
  });

  // Container fades in at start
  const containerOpacity = interpolate(frame, [0, fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "52%",
        height: "100%",
        overflow: "hidden",
        opacity: containerOpacity,
        // CSS clipPath circle — correct approach (mixBlendMode destination-out is invalid CSS)
        clipPath: `circle(${radius}% at 27% 50%)`,
      }}
    >
      {imageUrl ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `scale(${bgScale})`,
            transformOrigin: "0% 50%",
          }}
        >
          <Img
            src={imageUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      ) : (
        <div style={{ position: "absolute", inset: 0, backgroundColor: "#2d4a6e" }} />
      )}
    </div>
  );
};

const TextSlideUp: React.FC<{
  text: string;
  startFrame: number;
  fps: number;
  frame: number;
  style?: React.CSSProperties;
}> = ({ text, startFrame, fps, frame, style }) => {
  const progress = spring({
    fps,
    frame: frame - startFrame,
    config: { damping: 35, stiffness: 140 },
  });
  const translateY = interpolate(progress, [0, 1], [60, 0], {
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(
    frame,
    [startFrame, startFrame + fps * 0.5],
    [0, 1],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  return (
    <div
      style={{ transform: `translateY(${translateY}px)`, opacity, overflow: "hidden", ...style }}
    >
      {text}
    </div>
  );
};

export const CircleMaskTextSlideUpReveal: React.FC<
  CircleMaskTextSlideUpRevealProps
> = ({ imageUrl, headline, brand = "", tagline = "", logoUrl, audioUrl }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const logoOpacity = interpolate(frame, [fps * 1.51, fps * 2.5], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#f5f0eb" }}>
      {/* Left: circle-reveal image via CSS clipPath */}
      <CircleRevealImage
        imageUrl={imageUrl}
        frame={frame}
        fps={fps}
        totalFrames={durationInFrames}
      />

      {/* Right: text stack */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingLeft: "56%",
          paddingRight: "4%",
          gap: 24,
        }}
      >
        {brand && (
          <TextSlideUp
            text={brand}
            startFrame={Math.round(fps * 0.5)}
            fps={fps}
            frame={frame}
            style={{
              color: "#888",
              fontSize: 28,
              fontFamily: "Noto Sans CJK SC, sans-serif",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          />
        )}

        <TextSlideUp
          text={headline}
          startFrame={fps}
          fps={fps}
          frame={frame}
          style={{
            color: "#111",
            fontSize: 72,
            fontFamily: "Noto Sans CJK SC, sans-serif",
            fontWeight: 800,
            lineHeight: 1.2,
            width: "40%",
          }}
        />

        {tagline && (
          <TextSlideUp
            text={tagline}
            startFrame={Math.round(fps * 1.5)}
            fps={fps}
            frame={frame}
            style={{
              color: "#555",
              fontSize: 32,
              fontFamily: "Noto Sans CJK SC, sans-serif",
              fontWeight: 400,
              lineHeight: 1.5,
            }}
          />
        )}
      </AbsoluteFill>

      {logoUrl && (
        <div
          style={{
            position: "absolute",
            left: "5.84%",
            top: "9.34%",
            width: "6.62%",
            opacity: logoOpacity,
          }}
        >
          <Img src={logoUrl} style={{ width: "100%", objectFit: "contain" }} />
        </div>
      )}

      {audioUrl && <Audio src={audioUrl} />}
    </AbsoluteFill>
  );
};
