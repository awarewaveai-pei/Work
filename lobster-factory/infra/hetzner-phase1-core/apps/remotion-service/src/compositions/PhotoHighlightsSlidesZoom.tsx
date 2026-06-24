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

export interface PhotoHighlightsSlidesZoomProps {
  imageUrl1: string;
  text1: string;
  imageUrl2: string;
  text2: string;
  imageUrl3: string;
  text3: string;
  logoUrl?: string;
  backgroundColor?: string;
  audioUrl?: string;
  durationInFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
}

export const PhotoHighlightsSlidesZoomDefaultProps: PhotoHighlightsSlidesZoomProps =
  {
    imageUrl1: "",
    text1: "First scene headline",
    imageUrl2: "",
    text2: "Second scene headline",
    imageUrl3: "",
    text3: "Third scene headline",
    logoUrl: "",
    backgroundColor: "#0ebba2",
    audioUrl: "",
    durationInFrames: 1320,
    fps: 60,
    width: 1920,
    height: 1080,
  };

interface SlideProps {
  imageUrl: string;
  text: string;
  logoUrl?: string;
  localFrame: number;
  fps: number;
  slideIndex: number;
  bgColor: string;
  textDelayFrames: number;
}

const PhotoSlide: React.FC<SlideProps> = ({
  imageUrl,
  text,
  logoUrl,
  localFrame,
  fps,
  slideIndex,
  bgColor,
  textDelayFrames,
}) => {
  // Photo zoom: sinusoid easing, alternating in/out direction
  const zoomStart = slideIndex % 2 === 0 ? 1.15 : 1.0;
  const zoomEnd = slideIndex % 2 === 0 ? 1.0 : 1.15;
  const photoScale = interpolate(
    localFrame,
    [0, fps * 8],
    [zoomStart, zoomEnd],
    {
      extrapolateRight: "clamp",
      easing: (t) => Math.sin((t * Math.PI) / 2),
    }
  );

  // Slide 3 horizontal pan
  const panX =
    slideIndex === 2
      ? interpolate(localFrame, [0, fps * 7.8], [-3, 3], {
          extrapolateRight: "clamp",
        })
      : 0;

  // Text overlay — rotate-slide effect (slides from left or right)
  const textProgress = spring({
    fps,
    frame: localFrame - textDelayFrames,
    config: { damping: 40, stiffness: 160 },
  });
  const textSlideFrom = slideIndex % 2 === 0 ? -100 : 100;
  const textTranslateX = interpolate(textProgress, [0, 1], [textSlideFrom, 0], {
    extrapolateRight: "clamp",
  });
  const textOpacity = interpolate(
    localFrame,
    [textDelayFrames, textDelayFrames + fps * 0.5],
    [0, 1],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  const logoOpacity = interpolate(localFrame, [0, fps * 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  const sideTextOpacity = interpolate(localFrame, [0, fps * 0.8], [0, 1], {
    extrapolateRight: "clamp",
  });

  const sideLabels = ["HIGHLIGHTS", "GALLERY", "MOMENTS"];

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, overflow: "hidden" }}>
      {/* Photo — almost full bleed */}
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
              transformOrigin: slideIndex === 2 ? "0% 50%" : "50% 50%",
            }}
          >
            <Img
              src={imageUrl}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#2d4a6e" }} />
        )}

        {/* Text overlay */}
        <div
          style={{
            position: "absolute",
            bottom: slideIndex === 1 ? "auto" : "0",
            top: slideIndex === 1 ? "0" : "55%",
            left: slideIndex % 2 === 0 ? "2%" : "auto",
            right: slideIndex === 1 ? "auto" : "2%",
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
      </div>

      {/* Logo */}
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

      {/* Rotated side label */}
      <div
        style={{
          position: "absolute",
          right: slideIndex % 2 === 0 ? "1.5%" : "auto",
          left: slideIndex !== 0 ? "1.5%" : "auto",
          top: "50%",
          transform: "translateY(-50%) rotate(-90deg)",
          opacity: sideTextOpacity,
        }}
      >
        <span
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: 18,
            fontFamily: "Noto Sans CJK SC, sans-serif",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {sideLabels[slideIndex] ?? ""}
        </span>
      </div>
    </AbsoluteFill>
  );
};

const SlideTransition: React.FC<{
  children: React.ReactNode;
  localFrame: number;
  fps: number;
  fromLeft?: boolean;
}> = ({ children, localFrame, fps, fromLeft = false }) => {
  const progress = spring({
    fps,
    frame: localFrame,
    config: { damping: 45, stiffness: 200 },
  });
  const from = fromLeft ? -100 : 100;
  const translateX = interpolate(progress, [0, 1], [from, 0], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{ transform: `translateX(${translateX}%)`, overflow: "hidden" }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const PhotoHighlightsSlidesZoom: React.FC<
  PhotoHighlightsSlidesZoomProps
> = ({
  imageUrl1,
  text1,
  imageUrl2,
  text2,
  imageUrl3,
  text3,
  logoUrl,
  backgroundColor = "#0ebba2",
  audioUrl,
}) => {
  const frame = useCurrentFrame();
  // fps from config — timing constants derived from fps so they're correct at any frame rate
  const { fps } = useVideoConfig();

  const SLIDE2_START = Math.round(fps * 6.46);
  const SLIDE3_START = Math.round(fps * 13.96);
  const TEXT_DELAY = Math.round(fps * 2.16);

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Slide 1 */}
      <Sequence from={0} durationInFrames={SLIDE2_START + fps}>
        <PhotoSlide
          imageUrl={imageUrl1}
          text={text1}
          logoUrl={logoUrl}
          localFrame={frame}
          fps={fps}
          slideIndex={0}
          bgColor={backgroundColor}
          textDelayFrames={TEXT_DELAY}
        />
      </Sequence>

      {/* Slide 2 — slides in from right */}
      <Sequence from={SLIDE2_START} durationInFrames={SLIDE3_START - SLIDE2_START + fps}>
        <SlideTransition localFrame={frame - SLIDE2_START} fps={fps}>
          <PhotoSlide
            imageUrl={imageUrl2}
            text={text2}
            logoUrl={logoUrl}
            localFrame={frame - SLIDE2_START}
            fps={fps}
            slideIndex={1}
            bgColor={backgroundColor}
            textDelayFrames={TEXT_DELAY}
          />
        </SlideTransition>
      </Sequence>

      {/* Slide 3 — slides in from left */}
      <Sequence from={SLIDE3_START}>
        <SlideTransition localFrame={frame - SLIDE3_START} fps={fps} fromLeft>
          <PhotoSlide
            imageUrl={imageUrl3}
            text={text3}
            logoUrl={logoUrl}
            localFrame={frame - SLIDE3_START}
            fps={fps}
            slideIndex={2}
            bgColor={backgroundColor}
            textDelayFrames={TEXT_DELAY}
          />
        </SlideTransition>
      </Sequence>

      {audioUrl && <Audio src={audioUrl} />}
    </AbsoluteFill>
  );
};
