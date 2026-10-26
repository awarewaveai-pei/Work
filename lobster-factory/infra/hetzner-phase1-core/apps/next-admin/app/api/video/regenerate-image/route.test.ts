// The old image is deleted only when no other format still points at it (deleteOld:false): an uploaded asset is
// written into every format, so one format regenerating must not delete what a failed sibling still shows.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }), canCreateAiImageJob: () => true }));
vi.mock("@/lib/tenant-guard", () => ({
  effectiveOrgId: () => "11111111-1111-1111-1111-111111111111",
  OrgAccessError: class extends Error {},
  toOrgAccessResponse: () => new Response(null, { status: 403 }),
}));
vi.mock("@/lib/entitlements/grant", () => ({
  thenRun: {},
  withFeature: () => (_req: unknown, run: () => Promise<Response>) => run(),
}));
const buildSceneAsset = vi.hoisted(() => vi.fn(async () => ({ ok: true, asset: "https://cdn.example/designs/2026-10/new.png" })));
vi.mock("@/lib/content/blocks/video-pipeline", () => ({
  buildSceneAsset,
  resolveOrgId: () => null,
  FORMAT_SPEC: { "16x9": { aspectRatio: "16:9", orientation: "landscape", framing: "" } },
}));
const deleteDesignObject = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/storage/r2", () => ({ deleteDesignObject }));

const { POST } = await import("./route");
const OLD = "https://cdn.example/designs/2026-10/0f0e0d0c-0b0a-0908-0706-050403020100.png";
const post = (body: object) =>
  POST(new Request("http://localhost/api/video/regenerate-image", { method: "POST", body: JSON.stringify(body) }) as unknown as NextRequest);

describe("POST /api/video/regenerate-image old-image deletion", () => {
  beforeEach(() => { deleteDesignObject.mockClear(); buildSceneAsset.mockClear(); });

  it("deletes the old designs/ object by default", async () => {
    const res = await post({ imagePrompt: "a cat", oldImageUrl: OLD, format: "16x9" });
    expect(res.status).toBe(200);
    expect(deleteDesignObject).toHaveBeenCalledWith("designs/2026-10/0f0e0d0c-0b0a-0908-0706-050403020100.png");
  });

  it("keeps the old object when another format still uses it (deleteOld:false), but still excludes it", async () => {
    const res = await post({ imagePrompt: "a cat", oldImageUrl: OLD, deleteOld: false, format: "16x9" });
    expect(res.status).toBe(200);
    expect(deleteDesignObject).not.toHaveBeenCalled();
    expect(buildSceneAsset).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ excludeAssets: [OLD] }));
  });
});
