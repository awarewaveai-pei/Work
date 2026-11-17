// Card U4.4: the picture a workbench shot asks for is drawn by the chosen model and billed to the org the workbench named
// (buildSceneAsset runs inside runForOrg for it); the origin comes from the model that ran, never from the caller.
import { beforeEach, describe, expect, it, vi } from "vitest";

const scope = vi.hoisted(() => ({ org: null as string | null }));
const runForOrg = vi.hoisted(() => vi.fn(async (org: string, _actor: string, fn: () => Promise<unknown>) => {
  scope.org = org;
  try { return await fn(); } finally { scope.org = null; }
}));
const buildSceneAsset = vi.hoisted(() => vi.fn());
vi.mock("@/lib/entitlements/grant", () => ({ runForOrg }));
vi.mock("@/lib/content/blocks/video-pipeline", () => ({
  buildSceneAsset,
  FORMAT_SPEC: { "9x16": { aspectRatio: "9:16", orientation: "portrait", framing: "Vertical." } },
}));

import { POST } from "./route";

const org = "123e4567-e89b-42d3-a456-426614174001";
const url = "https://pub.example.r2.dev/designs/2026-11/a.png";
const call = (body: Record<string, unknown>, token = "internal-secret") => POST(new Request("http://localhost/api/internal/video/workbench/scene-image", {
  method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
  body: JSON.stringify({ organizationId: org, prompt: "清晨廚房", imageModel: "flux-dev", ratio: "9x16", ...body }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VW_INTERNAL_TOKEN", "internal-secret");
  // Records the org the paid ask would bill: the one runForOrg scoped, or none.
  buildSceneAsset.mockImplementation(async (_scene: unknown, opts: { imageModel: string }) => ({
    ok: true, asset: url, billedOrg: scope.org, origin: { kind: "ai_generated", model: opts.imageModel, provider: "flux" },
  }));
});

describe("POST /api/internal/video/workbench/scene-image", () => {
  it("draws with the chosen model, billed to the named org; the origin is the server's", async () => {
    const r = await call({ origin: { kind: "upload", rightsConfirmed: true } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, url, origin: { kind: "ai_generated", model: "flux-dev", provider: "flux" }, costUsd: 0.025 });
    expect(buildSceneAsset).toHaveBeenCalledWith(expect.objectContaining({ image_prompt: "清晨廚房", visual: "custom" }), expect.objectContaining({ imageModel: "flux-dev", aspectRatio: "9:16" }));
    expect(await buildSceneAsset.mock.results[0].value).toMatchObject({ billedOrg: org });
  });

  it("refuses a model outside the video list, a bad token, and a picture from another model", async () => {
    expect((await call({ imageModel: "codex-image" })).status).toBe(400);
    expect((await call({}, "wrong")).status).toBe(401);
    expect(buildSceneAsset).not.toHaveBeenCalled();
    buildSceneAsset.mockResolvedValueOnce({ ok: true, asset: url, origin: { kind: "ai_generated", model: "flux-schnell", provider: "flux" } });
    expect((await call({})).status).toBe(502);
  });
});
