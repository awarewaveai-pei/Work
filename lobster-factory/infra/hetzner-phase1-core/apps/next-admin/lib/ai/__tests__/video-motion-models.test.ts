// video-motion-models.ts is the one Replicate video-model list; video-workbench loads it with Node type stripping.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MOTION_MODELS, isVideoMotionModel } from "../video-motion-models";
import { MEDIA_MODELS, VIDEO_MOTION_RATES } from "../cost-model";

describe("video-motion-models", () => {
  it("every model has a rate with the same default duration, and an active MEDIA_MODELS slug", () => {
    expect(Object.keys(VIDEO_MOTION_RATES).sort()).toEqual(Object.keys(MOTION_MODELS).sort());
    for (const [id, m] of Object.entries(MOTION_MODELS)) {
      expect(VIDEO_MOTION_RATES[id as keyof typeof VIDEO_MOTION_RATES].defaultDurationSec).toBe(m.defaultDurationSec);
      expect(m.durations).toContain(m.defaultDurationSec);
      expect(MEDIA_MODELS[m.slug]?.status).toBe("active");
    }
  });

  it("imports nothing (video-workbench requires it without the next-admin build)", () => {
    const src = readFileSync(path.join(__dirname, "../video-motion-models.ts"), "utf8");
    expect(src).not.toMatch(/^\s*import\s/m);
  });

  it("image is sent only when given; Runway requires it", () => {
    const base = { prompt: "p", aspectRatio: "16:9" as const, durationSec: 5 };
    expect(MOTION_MODELS["runway-gen4-turbo"].requiresImage).toBe(true);
    expect(MOTION_MODELS["veo-3-1-fast"].buildInput(base)).not.toHaveProperty("image");
    expect(MOTION_MODELS["veo-3-1-fast"].buildInput({ ...base, imageUrl: "u", resolution: "720p" })).toMatchObject({ image: "u", resolution: "720p", generate_audio: false });
    expect(MOTION_MODELS["luma-ray-3-2"].buildInput({ ...base, imageUrl: "u" })).toMatchObject({ start_image: "u", resolution: "720p" });
    expect(isVideoMotionModel("sora-2")).toBe(false);
    expect(isVideoMotionModel("toString")).toBe(false);
  });
});
