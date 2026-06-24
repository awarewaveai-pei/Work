import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";

export interface PanSlideTextLeft3ScenesProps {
  imageUrl1: string;
  text1: string;
  imageUrl2: string;
  text2: string;
  imageUrl3: string;
  text3: string;
  logoUrl?: string;
  audioUrl?: string;
  durationInFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
}

export const PanSlideTextLeft3ScenesDefaultProps: PanSlideTextLeft3ScenesProps =
  {
    imageUrl1: "",
    text1: "Scene one headline text here",
    imageUrl2: "",
    text2: "Scene two headline text here",
    imageUrl3: "",
    text3: "Scene three headline text here",
    logoUrl: "",
    audioUrl: "",
    durationInFrames: 600,
    fps: 30,
    width: 1080,
    height: 1920,
  };

interface SceneProps {
  imageUrl: string;
  text: string;
  local: number;
  fps: number;
  sceneIndex: number;
}

const SceneContent: React.FC<SceneProps> = ({
  imageUrl,
  text,
  local,
  fps,
  sceneIndex,
}) => {
  const panDuration = fps * 4;
  const panScale = interpolate(local, [0, panDuration], [1.13, 1.0], {
    extrapolateRight: "clamp",
  });
  const panX = interpolate(
    local,
    [0, panDuration],
    sceneIndex % 2 === 0 ? [-3, 3] : [3, -3],
    { extrapolateRight: "clamp" }
  );

  const textDelay = fps; // 1s
  const textProgress = spring({
    fps,
    frame: local - textDelay,
    config: { damping: 30, stiffness: 120 },
  });
  const textY = interpolate(textProgress, [0, 1], [40, 0]);
  const textOpacity = interpolate(
    local,
    [textDelay, textDelay + fps * 0.8],
    [0, 1],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {imageUrl ? (
        <AbsoluteFill
          style={{ transform: `scale(${panScale}) translateX(${panX}%)` }}
        >
          <Img
            src={imageUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ backgroundColor: "#1a1a2e" }} />
      )}

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingLeft: "9%",
          paddingRight: "9%",
        }}
      >
        <div style={{ transform: `translateY(${textY}px)`, opacity: textOpacity, width: "82%" }}>
          <p
            style={{
              color: "#ffffff",
              fontSize: 72,
              fontFamily: "Noto Sans CJK SC, sans-serif",
              fontWeight: 700,
              lineHeight: 1.25,
              margin: 0,
              textShadow: "0 2px 8px rgba(0,0,0,0.5)",
              textTransform: "uppercase",
            }}
          >
            {text}
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SlideScene: React.FC<{
  children: React.ReactNode;
  localFrame: number;
  fps: number;
}> = ({ children, localFrame, fps }) => {
  const slideProgress = spring({
    fps,
    frame: localFrame,
    config: { damping: 40, stiffness: 160 },
  });
  const translateX = interpolate(slideProgress, [0, 1], [100, 0], {
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

export const PanSlideTextLeft3Scenes: React.FC<
  PanSlideTextLeft3ScenesProps
> = ({ imageUrl1, text1, imageUrl2, text2, imageUrl3, text3, logoUrl, audioUrl }) => {
  const frame = useCurrentFrame();
  // fps from config — not props — so Studio and render always agree
  const { fps } = useVideoConfig();

  // Scene timing derived from fps (source truth: Creatomate JSON)
  const SCENE2_START = Math.round(fps * 5.88);
  const SCENE3_START = Math.round(fps * 11.88);

  const logoOpacity = interpolate(frame, [0, fps * 0.99], [0, 1], {
    extrapolateRight: "clamp",
    easing: (t) => t * (2 - t),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Sequence from={0} durationInFrames={SCENE2_START + fps}>
        <SceneContent imageUrl={imageUrl1} text={text1} local={frame} fps={fps} sceneIndex={0} />
      </Sequence>

      <Sequence from={SCENE2_START} durationInFrames={SCENE3_START - SCENE2_START + fps}>
        <SlideScene localFrame={frame - SCENE2_START} fps={fps}>
          <SceneContent imageUrl={imageUrl2} text={text2} local={frame - SCENE2_START} fps={fps} sceneIndex={1} />
        </SlideScene>
      </Sequence>

      <Sequence from={SCENE3_START}>
        <SlideScene localFrame={frame - SCENE3_START} fps={fps}>
          <SceneContent imageUrl={imageUrl3} text={text3} local={frame - SCENE3_START} fps={fps} sceneIndex={2} />
        </SlideScene>
      </Sequence>

      {logoUrl && (
        <AbsoluteFill
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "flex-start",
            padding: "3.5% 5%",
          }}
        >
          <Img
            src={logoUrl}
            style={{ width: "21%", objectFit: "contain", opacity: logoOpacity }}
          />
        </AbsoluteFill>
      )}

      {audioUrl && <Audio src={audioUrl} />}
    </AbsoluteFill>
  );
};
