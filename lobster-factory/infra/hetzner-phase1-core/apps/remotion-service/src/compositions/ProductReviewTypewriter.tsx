import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
} from "remotion";

export interface ProductReviewTypewriterProps {
  backgroundImageUrl: string;
  productImageUrl: string;
  profileImageUrl?: string;
  reviewerName: string;
  reviewDate: string;
  reviewText: string;
  starCount?: number;
  logoUrl?: string;
  audioUrl?: string;
  durationInFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
}

export const ProductReviewTypewriterDefaultProps: ProductReviewTypewriterProps =
  {
    backgroundImageUrl: "",
    productImageUrl: "",
    profileImageUrl: "",
    reviewerName: "Jane Smith",
    reviewDate: "June 2026",
    reviewText:
      "This product is absolutely amazing! I use it every day and couldn't be happier with the results.",
    starCount: 5,
    logoUrl: "",
    audioUrl: "",
    durationInFrames: 300,
    fps: 30,
    width: 1920,
    height: 1080,
  };

// Single star shape
const StarIcon: React.FC<{ filled?: boolean; style?: React.CSSProperties }> = ({
  filled = true,
  style,
}) => (
  <svg
    viewBox="0 0 24 24"
    style={{ width: 40, height: 40, ...style }}
    fill={filled ? "#FFD700" : "none"}
    stroke="#FFD700"
    strokeWidth={1.5}
  >
    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
  </svg>
);

// Typewriter text: reveals characters one by one
const TypewriterText: React.FC<{
  text: string;
  startFrame: number;
  durationFrames: number;
  frame: number;
  style?: React.CSSProperties;
}> = ({ text, startFrame, durationFrames, frame, style }) => {
  const charsToShow = Math.floor(
    interpolate(
      frame,
      [startFrame, startFrame + durationFrames],
      [0, text.length],
      { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
    )
  );
  return (
    <div style={style}>
      <span>{text.slice(0, charsToShow)}</span>
      {/* Blinking cursor */}
      {charsToShow < text.length && (
        <span
          style={{
            opacity: Math.floor(frame / 8) % 2 === 0 ? 1 : 0,
            color: "inherit",
          }}
        >
          |
        </span>
      )}
    </div>
  );
};

export const ProductReviewTypewriter: React.FC<
  ProductReviewTypewriterProps
> = ({
  backgroundImageUrl,
  productImageUrl,
  profileImageUrl,
  reviewerName,
  reviewDate,
  reviewText,
  starCount = 5,
  logoUrl,
  audioUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // BG slow zoom: 100→160% over full duration
  const bgScale = interpolate(frame, [0, durationInFrames], [1.0, 1.6], {
    extrapolateRight: "clamp",
  });

  // Review box reveal: height grows from 0→79.3%
  const boxProgress = spring({
    fps,
    frame,
    config: { damping: 35, stiffness: 80 },
  });
  const boxHeight = interpolate(boxProgress, [0, 1], [0, 79.3], {
    extrapolateRight: "clamp",
  });

  // Profile section appears at 1s
  const profileOpacity = interpolate(
    frame,
    [fps * 1, fps * 1.5],
    [0, 1],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );
  const profileProgress = spring({
    fps,
    frame: frame - fps,
    config: { damping: 35, stiffness: 140 },
  });
  const profileSlide = interpolate(profileProgress, [0, 1], [30, 0], {
    extrapolateRight: "clamp",
  });

  // Stars animate in at 3.5s, staggered
  const STAR_START = Math.round(fps * 3.5);
  // Gate: stars are invisible before their stagger start to avoid 5x flash
  const getStarStyle = (idx: number): React.CSSProperties => {
    const starFrame = frame - STAR_START - idx * Math.round(fps * 0.2);
    const active = starFrame >= 0;
    const prog = spring({
      fps,
      frame: starFrame,
      config: { damping: 25, stiffness: 200 },
    });
    const scale = active ? interpolate(prog, [0, 1], [5.0, 1.0], { extrapolateRight: "clamp" }) : 0;
    return { transform: `scale(${scale})`, opacity: active ? 1 : 0 };
  };

  // Product image scale 130→100%
  const productScale = interpolate(frame, [0, durationInFrames], [1.3, 1.0], {
    extrapolateRight: "clamp",
  });

  const clampedStars = Math.min(5, Math.max(1, starCount ?? 5));

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* BG image with zoom + blur overlay */}
      <AbsoluteFill style={{ transform: `scale(${bgScale})` }}>
        {backgroundImageUrl ? (
          <Img
            src={backgroundImageUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#222" }} />
        )}
      </AbsoluteFill>

      {/* Dark blur overlay */}
      <AbsoluteFill
        style={{ backgroundColor: "rgba(0,0,0,0.15)", backdropFilter: "blur(2px)" }}
      />

      {/* Review box — centered */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "79.3%",
            height: `${boxHeight}%`,
            backgroundColor: "rgba(255,255,255,0.97)",
            borderRadius: 12,
            overflow: "hidden",
            display: "flex",
            position: "relative",
            boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
          }}
        >
          {/* Left: product image */}
          <div
            style={{
              width: "38%",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {productImageUrl ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  transform: `scale(${productScale})`,
                  transformOrigin: "50% 25%",
                }}
              >
                <Img
                  src={productImageUrl}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "#e8e8e8",
                }}
              />
            )}
          </div>

          {/* Right: review content */}
          <div
            style={{
              flex: 1,
              padding: "5% 6%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            {/* Profile: avatar + name + date */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                opacity: profileOpacity,
                transform: `translateY(${profileSlide}px)`,
              }}
            >
              {profileImageUrl && (
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  <Img
                    src={profileImageUrl}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </div>
              )}
              <div>
                <div
                  style={{
                    fontFamily: "Noto Sans CJK SC, sans-serif",
                    fontWeight: 700,
                    fontSize: 28,
                    color: "#222",
                  }}
                >
                  {reviewerName}
                </div>
                <div
                  style={{
                    fontFamily: "Noto Sans CJK SC, sans-serif",
                    fontSize: 22,
                    color: "#888",
                    marginTop: 4,
                  }}
                >
                  {reviewDate}
                </div>
              </div>
            </div>

            {/* Stars — staggered scale-in */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {Array.from({ length: clampedStars }).map((_, idx) => (
                <div key={idx} style={getStarStyle(idx)}>
                  <StarIcon filled />
                </div>
              ))}
              {Array.from({ length: 5 - clampedStars }).map((_, idx) => (
                <StarIcon key={`empty-${idx}`} filled={false} />
              ))}
            </div>

            {/* Review text — typewriter */}
            <TypewriterText
              text={reviewText}
              startFrame={Math.round(fps * 1.5)}
              durationFrames={fps * 4}
              frame={frame}
              style={{
                fontFamily: "Noto Sans CJK SC, sans-serif",
                fontSize: 28,
                color: "#333",
                lineHeight: 1.6,
              }}
            />
          </div>
        </div>
      </AbsoluteFill>

      {/* Logo — top right */}
      {logoUrl && (
        <div
          style={{
            position: "absolute",
            right: "5.83%",
            top: "10.35%",
            width: "9.05%",
          }}
        >
          <Img src={logoUrl} style={{ width: "100%", objectFit: "contain" }} />
        </div>
      )}

      {/* Audio */}
      {audioUrl && <Audio src={audioUrl} />}
    </AbsoluteFill>
  );
};
