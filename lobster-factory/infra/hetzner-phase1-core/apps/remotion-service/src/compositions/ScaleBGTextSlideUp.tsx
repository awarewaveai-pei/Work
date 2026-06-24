/**
 * ScaleBGTextSlideUp
 * Remotion equivalent of Creatomate "16_9 - video - 1p1t1a ScaleBG TextSlideUp"
 *
 * Layout:
 *   - Background image: Ken Burns zoom (150% → 100% over first 2s)
 *   - Dark overlay: fades in at 3s
 *   - Title text: slides up from below at 3.8s (Oswald-style heavy uppercase)
 *   - Optional logo: top-right, fades in
 *   - Optional audio: plays from start
 */
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

export interface ScaleBGTextSlideUpProps {
  /** Background image URL */
  imageUrl: string;
  /** Main title text */
  text: string;
  /** Optional logo URL (top-right corner) */
  logoUrl?: string;
  /** Optional audio/TTS URL */
  audioUrl?: string;
  /** Background overlay color (CSS rgba) */
  overlayColor?: string;
  /** Dynamic duration override (frames) — drives calculateMetadata */
  durationInFrames?: number;
  /** Dynamic fps override */
  fps?: number;
  /** Dynamic width override */
  width?: number;
  /** Dynamic height override */
  height?: number;
}

export const ScaleBGTextSlideUpDefaultProps: ScaleBGTextSlideUpProps = {
  imageUrl:
    "https://images.pexels.com/photos/1108572/pexels-photo-1108572.jpeg?auto=compress&cs=tinysrgb&w=1920",
  text: "This is a sample title",
  logoUrl: "",
  audioUrl: "",
  overlayColor: "rgba(40, 40, 40, 0.72)",
  durationInFrames: 362,
  fps: 30,
  width: 1920,
  height: 1080,
};

export const ScaleBGTextSlideUp: React.FC<ScaleBGTextSlideUpProps> = ({
  imageUrl,
  text,
  logoUrl,
  audioUrl,
  overlayColor = "rgba(40, 40, 40, 0.72)",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Background Ken Burns: 150% → 100% over first 2s ──
  const bgScale = interpolate(frame, [0, fps * 2], [1.5, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Overlay: fades in at 3s over 1s ──
  const overlayStart = Math.round(fps * 3);
  const overlayOpacity = interpolate(
    frame,
    [overlayStart, overlayStart + fps],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // ── Text slide-up: starts at 3.8s ──
  const textStartFrame = Math.round(fps * 3.8);
  const textProgress = spring({
    fps,
    frame: frame - textStartFrame,
    config: { damping: 35, stiffness: 180, mass: 1 },
    durationInFrames: Math.round(fps * 1.2),
  });
  const textTranslateY = interpolate(textProgress, [0, 1], [60, 0]);
  const textOpacity = interpolate(
    frame,
    [textStartFrame, textStartFrame + Math.round(fps * 0.4)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // ── Logo: fades in over first 1s ──
  const logoOpacity = interpolate(frame, [0, Math.round(fps * 0.99)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* Background image with Ken Burns zoom */}
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Img
          src={imageUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${bgScale})`,
            transformOrigin: "center center",
          }}
        />
      </AbsoluteFill>

      {/* Dark overlay */}
      {frame >= overlayStart && (
        <AbsoluteFill
          style={{
            backgroundColor: overlayColor,
            opacity: overlayOpacity,
          }}
        />
      )}

      {/* Title text */}
      {frame >= textStartFrame && (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "flex-start",
            padding: "0 6% 22% 6%",
          }}
        >
          <div
            style={{
              transform: `translateY(${textTranslateY}px)`,
              opacity: textOpacity,
              fontFamily: "'Oswald', 'Noto Sans CJK TC', sans-serif",
              fontWeight: 700,
              fontSize: 72,
              textTransform: "uppercase",
              color: "#FFFFFF",
              textShadow: "0 2px 8px rgba(0,0,0,0.6)",
              maxWidth: "88%",
              lineHeight: 1.25,
              letterSpacing: "0.02em",
            }}
          >
            {text}
          </div>
        </AbsoluteFill>
      )}

      {/* Logo (top-right) */}
      {logoUrl && (
        <AbsoluteFill
          style={{
            justifyContent: "flex-start",
            alignItems: "flex-end",
            flexDirection: "column",
            padding: "4% 3% 0 0",
          }}
        >
          <Img
            src={logoUrl}
            style={{
              width: "10%",
              maxHeight: "18%",
              opacity: logoOpacity,
              objectFit: "contain",
            }}
          />
        </AbsoluteFill>
      )}

      {/* Audio */}
      {audioUrl && <Audio src={audioUrl} />}
    </AbsoluteFill>
  );
};
