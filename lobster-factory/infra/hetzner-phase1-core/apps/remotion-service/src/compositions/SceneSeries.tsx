import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface SceneItem {
  imageUrl: string;
  text: string;
  durationInSeconds: number;
  logoUrl?: string;
  /** Timeline v1 compiler output. Omitted values preserve the original manual-template behaviour. */
  crop?: "cover" | "contain";
  transitionOut?: "cut" | "fade" | "slide_left" | "slide_right";
}

// ── Private slide renderer ────────────────────────────────────────────────────
// useCurrentFrame() is automatically 0-relative inside its parent <Sequence>.
const Slide: React.FC<{
  imageUrl: string;
  text: string;
  logoUrl?: string;
  slideIndex: number;
  bgColor: string;
  crop?: "cover" | "contain";
}> = ({ imageUrl, text, logoUrl, slideIndex, bgColor, crop = "cover" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const TEXT_DELAY = Math.round(fps * 2);

  // Ken Burns: alternating zoom-in / zoom-out per slide
  const zoomStart = slideIndex % 2 === 0 ? 1.15 : 1.0;
  const zoomEnd = slideIndex % 2 === 0 ? 1.0 : 1.15;
  const photoScale = interpolate(frame, [0, fps * 8], [zoomStart, zoomEnd], {
    extrapolateRight: "clamp",
    easing: (t) => Math.sin((t * Math.PI) / 2),
  });

  // Horizontal pan on every 3rd slide
  const panX =
    slideIndex % 3 === 2
      ? interpolate(frame, [0, fps * 7.8], [-3, 3], {
          extrapolateRight: "clamp",
        })
      : 0;

  // Text: spring slide-in from alternating sides
  const textProgress = spring({
    fps,
    frame: frame - TEXT_DELAY,
    config: { damping: 40, stiffness: 160 },
  });
  const textSlideFrom = slideIndex % 2 === 0 ? -100 : 100;
  const textTranslateX = interpolate(textProgress, [0, 1], [textSlideFrom, 0], {
    extrapolateRight: "clamp",
  });
  const textOpacity = interpolate(
    frame,
    [TEXT_DELAY, TEXT_DELAY + fps * 0.5],
    [0, 1],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  const logoOpacity = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: "5%",
          top: "2%",
          width: "85%",
          height: "96%",
          overflow: "hidden",
          borderRadius: 4,
        }}
      >
        {imageUrl ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              transform: `scale(${photoScale}) translateX(${panX}%)`,
              transformOrigin: slideIndex % 3 === 2 ? "0% 50%" : "50% 50%",
            }}
          >
            <Img
              src={imageUrl}
              style={{ width: "100%", height: "100%", objectFit: crop }}
            />
          </div>
        ) : (
          <div
            style={{ width: "100%", height: "100%", background: "#2d4a6e" }}
          />
        )}

        {/* Timeline scenes can deliberately have no title. Do not cover their image with an empty box. */}
        {text.trim() && (
          <div
            style={{
              position: "absolute",
              bottom: slideIndex % 3 === 1 ? "auto" : "0",
              top: slideIndex % 3 === 1 ? "0" : "55%",
              left: slideIndex % 2 === 0 ? "2%" : "auto",
              right: slideIndex % 2 !== 0 ? "2%" : "auto",
              width: "60%",
              transform: `translateX(${textTranslateX}%)`,
              opacity: textOpacity,
            }}
          >
            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.3)",
                borderRadius: "8px",
                padding: "12px 20px",
              }}
            >
              <p
                style={{
                  color: "#ffffff",
                  fontSize: 48,
                  fontFamily: "Noto Sans CJK SC, sans-serif",
                  fontWeight: 700,
                  lineHeight: 1.3,
                  margin: 0,
                  textShadow: "0 2px 6px rgba(0,0,0,0.4)",
                }}
              >
                {text}
              </p>
            </div>
          </div>
        )}
      </div>

      {logoUrl && (
        <div
          style={{
            position: "absolute",
            left: slideIndex % 2 === 0 ? "8.5%" : "auto",
            right: slideIndex % 2 !== 0 ? "8.5%" : "auto",
            top: "12%",
            width: "11%",
            opacity: logoOpacity,
          }}
        >
          <Img src={logoUrl} style={{ width: "100%", objectFit: "contain" }} />
        </div>
      )}
    </AbsoluteFill>
  );
};

// ── Slide-in transition wrapper ───────────────────────────────────────────────
// frame=0 inside the parent Sequence = start of this scene = start of the slide animation.
const SlideIn: React.FC<{ fromLeft: boolean; children: React.ReactNode }> = ({
  fromLeft,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    fps,
    frame,
    config: { damping: 45, stiffness: 200 },
  });
  const translateX = interpolate(
    progress,
    [0, 1],
    [fromLeft ? -100 : 100, 0],
    { extrapolateRight: "clamp" }
  );
  return (
    <AbsoluteFill
      style={{ transform: `translateX(${translateX}%)`, overflow: "hidden" }}
    >
      {children}
    </AbsoluteFill>
  );
};

const FadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, Math.max(1, Math.round(fps * 0.5))], [0, 1], {
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity, overflow: "hidden" }}>{children}</AbsoluteFill>;
};

function outgoingTransition(scene: SceneItem, index: number): NonNullable<SceneItem["transitionOut"]> {
  // Existing free-form DynamicSlideshow requests had no transition field and alternated
  // slide directions. Keep that behaviour; Timeline v1 emits an explicit policy.
  return scene.transitionOut ?? (index % 2 === 0 ? "slide_left" : "slide_right");
}

// ── Duration helper (use in calculateMetadata and Composition static fallback) ─
// Timing model:
//   - Each scene's Sequence starts at sum(previous pure durations).
//   - Non-last scenes get +transitionFrames extra so the outgoing scene stays visible
//     while the incoming one slides in on top (slide-in over static, not cross-fade).
//   - Total = sum of all pure scene durations; transitions do not add to total.
export function calculateSceneSeriesDuration(
  scenes: SceneItem[],
  fps: number,
  _transitionDurationSeconds = 1.0
): number {
  if (!scenes.length) return Math.round(fps * 3);
  const total = scenes.reduce((acc, s) => {
    const dur =
      Number.isFinite(s.durationInSeconds) && s.durationInSeconds > 0
        ? s.durationInSeconds
        : 0;
    return acc + Math.round(fps * dur);
  }, 0);
  return Math.max(total, Math.round(fps));
}

// ── Main component ────────────────────────────────────────────────────────────
export const SceneSeries: React.FC<{
  scenes: SceneItem[];
  backgroundColor?: string;
  audioUrl?: string;
  transitionDurationSeconds?: number;
}> = ({
  scenes,
  backgroundColor = "#0ebba2",
  audioUrl,
  transitionDurationSeconds = 1.0,
}) => {
  const { fps } = useVideoConfig();
  const transitionFrames = Math.round(fps * transitionDurationSeconds);

  // Compute each scene's absolute start: begins right after previous scene's pure duration.
  let cursor = 0;
  const sceneLayout = scenes.map((scene, i) => {
    // Floor negative/NaN durations to 1 frame so Sequence bounds stay valid.
    const safeDur =
      Number.isFinite(scene.durationInSeconds) && scene.durationInSeconds > 0
        ? scene.durationInSeconds
        : 0;
    const sceneFrames = Math.max(1, Math.round(fps * safeDur));
    const start = cursor;
    cursor += sceneFrames;
    const isLast = i === scenes.length - 1;
    const transition = outgoingTransition(scene, i);
    // Outgoing scenes get extra transitionFrames so the incoming SlideIn spring can
    // complete while the outgoing scene is still visible beneath it (slide-in over static,
    // not a cross-fade — the incoming scene is a later DOM sibling, so it renders on top).
    const duration = isLast || transition === "cut" ? sceneFrames : sceneFrames + transitionFrames;
    return { scene, start, duration, transition };
  });

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {sceneLayout.map(({ scene, start, duration }, i) => {
        const incomingTransition = i === 0 ? "cut" : sceneLayout[i - 1].transition;
        const slide = (
          <Slide
            imageUrl={scene.imageUrl}
            text={scene.text}
            logoUrl={scene.logoUrl}
            slideIndex={i}
            bgColor={backgroundColor}
            crop={scene.crop}
          />
        );
        const content = i === 0 || incomingTransition === "cut"
          ? slide
          : incomingTransition === "fade"
            ? <FadeIn>{slide}</FadeIn>
            : <SlideIn fromLeft={incomingTransition === "slide_left"}>{slide}</SlideIn>;
        return (
        <Sequence key={i} from={start} durationInFrames={duration}>
          {content}
        </Sequence>
        );
      })}
      {audioUrl && <Audio src={audioUrl} />}
    </AbsoluteFill>
  );
};
