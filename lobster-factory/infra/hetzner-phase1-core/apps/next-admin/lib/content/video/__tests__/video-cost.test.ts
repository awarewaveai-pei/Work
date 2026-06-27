import { describe, it, expect } from "vitest";
import {
  computeVideoCost,
  VIDEO_PIPELINE_STEPS,
  type VideoPipelineStep,
} from "../video-cost";

describe("computeVideoCost", () => {
  const base = { totalScenes: 6, customScenes: 4, brollScenes: 2 };

  it("default 6-scene (4 custom + 2 broll, flux-schnell): exact USD + NT$", () => {
    const r = computeVideoCost(base);
    // script: 1200in*$3/M + 2200out*$15/M = 0.0036 + 0.033 = 0.0366
    // image:  4 * $0.003 = 0.012 ; broll/tts/render = 0
    expect(r.totalUsd).toBeCloseTo(0.0486, 6);
    expect(r.totalNtd).toBeCloseTo(1.56, 2);
    expect(r.imageModel).toBe("flux-schnell");
  });

  it("image line counts ONLY custom scenes; broll/tts/render are free", () => {
    const r = computeVideoCost(base);
    const img = r.lines.find((l) => l.id === "image")!;
    expect(img.count).toBe(4);
    expect(img.unitUsd).toBeCloseTo(0.003, 6);
    for (const id of ["broll", "tts", "render"]) {
      expect(r.lines.find((l) => l.id === id)!.totalUsd).toBe(0);
      expect(r.lines.find((l) => l.id === id)!.free).toBe(true);
    }
  });

  it("flux-dev raises only the image line", () => {
    const r = computeVideoCost({ ...base, imageModel: "flux-dev" });
    expect(r.lines.find((l) => l.id === "image")!.unitUsd).toBeCloseTo(0.025, 6);
    // 0.0366 script + 4*0.025 = 0.1366
    expect(r.totalUsd).toBeCloseTo(0.1366, 6);
  });

  it("可刪減：移除 image 步驟 → 成本不再含生圖（只剩 script）", () => {
    const steps: VideoPipelineStep[] = VIDEO_PIPELINE_STEPS.map((s) =>
      s.id === "image" ? { ...s, enabled: false } : s,
    );
    const r = computeVideoCost(base, steps);
    expect(r.lines.find((l) => l.id === "image")).toBeUndefined();
    expect(r.totalUsd).toBeCloseTo(0.0366, 6);
  });

  it("可擴充：加一步付費步驟 → 流程與成本同時含入", () => {
    const steps: VideoPipelineStep[] = [
      ...VIDEO_PIPELINE_STEPS,
      { id: "music", label: "背景音樂", tool: "X", vendor: "Y", icon: "🎵", cost: { kind: "image-per-custom-scene" }, enabled: true },
    ];
    const r = computeVideoCost(base, steps);
    expect(r.lines.find((l) => l.id === "music")).toBeDefined();
    // extra music line = 4 * 0.003 = 0.012 on top of default 0.0486
    expect(r.totalUsd).toBeCloseTo(0.0606, 6);
  });

  it("enabled:false publish step excluded by default", () => {
    const r = computeVideoCost(base);
    expect(r.lines.find((l) => l.id === "publish")).toBeUndefined();
  });

  it("OpenAI TTS adds per-character voice cost", () => {
    const r = computeVideoCost({ ...base, ttsProvider: "openai", ttsVoice: "tts-1:nova", ttsChars: 300 });
    const tts = r.lines.find((l) => l.id === "tts")!;
    expect(tts.vendor).toBe("OpenAI");
    expect(tts.tool).toBe("OpenAI tts-1");
    expect(tts.count).toBe(300);
    expect(tts.unitUsd).toBeCloseTo(15 / 1_000_000, 10);
    expect(tts.totalUsd).toBeCloseTo(0.0045, 6);
    expect(r.totalUsd).toBeCloseTo(0.0531, 6);
  });

  it("OpenAI TTS HD uses the higher rate", () => {
    const r = computeVideoCost({ ...base, ttsProvider: "openai", ttsVoice: "tts-1-hd:nova", ttsChars: 300 });
    const tts = r.lines.find((l) => l.id === "tts")!;
    expect(tts.tool).toBe("OpenAI tts-1-hd");
    expect(tts.totalUsd).toBeCloseTo(0.009, 6);
  });
});
