// The one-click stop rule must accept exactly the JSON skeleton the prompts ask for (nothing hand-typed beside it).
import { describe, expect, it } from "vitest";
import { forgePrompt, type ForgeCtx } from "../modules";
import { autoRunResultValid } from "../auto-run-result";

const ctx: ForgeCtx = { lang: "繁體中文", sceneCount: 4, customScenes: 0, brand: null };
/** The `純JSON：{...}` skeleton at the end of a task prompt, parsed. */
function skeletonOf(moduleId: string, taskId: string, fields: Record<string, unknown>): Record<string, unknown> {
  const prompt = forgePrompt(moduleId, taskId, fields, ctx)!.prompt;
  const at = prompt.lastIndexOf("純JSON：");
  expect(at).toBeGreaterThan(-1);
  return JSON.parse(prompt.slice(at + "純JSON：".length).trim().split("\n")[0]);
}

describe("autoRunResultValid", () => {
  it("score: the prompt's own skeleton passes; the field the page used to require does not", () => {
    const skeleton = skeletonOf("result", "score", { hook: "h", scenes: 4, cta: "c" });
    expect(skeleton).toHaveProperty("overall");
    expect(autoRunResultValid("score", skeleton)).toBe(true);
    expect(autoRunResultValid("score", { ...skeleton, overall: 7.5 })).toBe(true);
    expect(autoRunResultValid("score", { total: 8 })).toBe(false);
    expect(autoRunResultValid("score", { overall: "8" })).toBe(false);
    expect(autoRunResultValid("score", null)).toBe(false);
  });
  it("script: scenes must be a non-empty array", () => {
    const skeleton = skeletonOf("manual", "script", { topic: "t", plat: "YT Shorts" });
    expect(Array.isArray(skeleton.scenes)).toBe(true);
    expect(autoRunResultValid("script", { scenes: [{ visual: "v" }] })).toBe(true);
    expect(autoRunResultValid("script", { scenes: [] })).toBe(false);
    expect(autoRunResultValid("script", { title: "t" })).toBe(false);
  });
});
