import { describe, expect, it } from "vitest";
import { buildBatchMockupSpecs } from "../batch-mockup";
import { podModelById } from "../pod-catalog-config";

describe("buildBatchMockupSpecs", () => {
  it("returns 4 specs in order: white-bg flat (main), 2 models, decor flat", () => {
    const specs = buildBatchMockupSpecs(podModelById(57)!);
    expect(specs).toHaveLength(4);
    expect(specs.map((s) => s.kind)).toEqual(["flat-white", "model-a", "model-b", "flat-decor"]);
    expect(specs.every((s) => s.prompt.trim().length > 20)).toBe(true);
  });

  it("long-sleeve model (Gildan 2400) renders 'long sleeve' in the model prompt", () => {
    const specs = buildBatchMockupSpecs(podModelById(57)!);
    const modelA = specs.find((s) => s.kind === "model-a")!;
    expect(modelA.prompt.toLowerCase()).toContain("long sleeve");
  });

  it("short-sleeve model (Gildan 5000 tee) does NOT say long sleeve", () => {
    const specs = buildBatchMockupSpecs(podModelById(438)!);
    const modelA = specs.find((s) => s.kind === "model-a")!;
    expect(modelA.prompt.toLowerCase()).not.toContain("long sleeve");
  });

  it("flat-white spec is a white-garment flat-lay (becomes the main image)", () => {
    const specs = buildBatchMockupSpecs(podModelById(456)!);
    const flat = specs.find((s) => s.kind === "flat-white")!;
    expect(flat.prompt.toLowerCase()).toContain("white");
    expect(flat.prompt.toLowerCase()).toMatch(/flat-lay|flat lay/);
  });

  it("decor spec arranges corner props", () => {
    const specs = buildBatchMockupSpecs(podModelById(456)!);
    const decor = specs.find((s) => s.kind === "flat-decor")!;
    expect(decor.prompt.toLowerCase()).toMatch(/corner|wildflower|eucalyptus/);
  });
});
