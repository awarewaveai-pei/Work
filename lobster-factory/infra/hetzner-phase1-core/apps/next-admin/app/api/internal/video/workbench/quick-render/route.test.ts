// Plan U5 快速輸出: a scene names an asset id; only this org's registered assets render (url and rights read from the row),
// another org's id is refused before any render call.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/lib/content/video/__tests__/fake-db";

const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
const submitDraftRender = vi.hoisted(() => vi.fn());
const ensureWorkbenchProject = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));
vi.mock("@/lib/content/video/draft-render", () => ({ submitDraftRender, renderAssetHostError: async () => null }));
vi.mock("@/lib/content/video/projects", () => ({ ensureWorkbenchProject }));

import { POST } from "./route";

const org = "123e4567-e89b-42d3-a456-426614174001", other = "123e4567-e89b-42d3-a456-426614174009";
const mine = "123e4567-e89b-42d3-a456-426614174002", theirs = "123e4567-e89b-42d3-a456-426614174003";
const project = "123e4567-e89b-42d3-a456-426614174004";
const rights = [{ kind: "ai_generated", model: "gpt-image-2", provider: "OpenAI", url: "/generated/a.png" }];
const tables = () => ({
  media_assets: [
    { id: mine, organization_id: org, object_url: "https://v.example.com/video/workbench/a.png", mime_type: "image/png", metadata: { rightsSources: rights } },
    { id: theirs, organization_id: other, object_url: "https://v.example.com/video/workbench/b.png", mime_type: "image/png", metadata: {} },
  ],
  media_production_projects: [{ id: project, organization_id: org }],
});
const call = (assetId: string) => POST(new Request("http://localhost/api/internal/video/workbench/quick-render", {
  method: "POST", headers: { authorization: "Bearer internal-secret", "content-type": "application/json" },
  body: JSON.stringify({ organizationId: org, sourceRef: "proj-1", title: "第一集", ratio: "9x16", scenes: [{ narration: "第一句旁白", assetId }] }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VW_INTERNAL_TOKEN", "internal-secret");
  const t = tables();
  getSupabaseWriteClient.mockReturnValue(fakeDb(() => t));
  ensureWorkbenchProject.mockResolvedValue({ ok: true, item: { id: project }, created: true });
  submitDraftRender.mockResolvedValue({ ok: true, jobId: "123e4567-e89b-42d3-a456-426614174005" });
});

describe("POST /api/internal/video/workbench/quick-render", () => {
  it("another org's asset id: refused, nothing rendered", async () => {
    expect((await call(theirs)).status).toBe(404);
    expect(submitDraftRender).not.toHaveBeenCalled();
  });

  it("this org's asset: rendered from the row's url and rights, in the workbench project, deleting nothing", async () => {
    const r = await call(mine);
    expect(r.status).toBe(202);
    expect(submitDraftRender).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: org, formatAssets: { "9x16": ["https://v.example.com/video/workbench/a.png"] }, formats: ["9x16"],
      scenes: [{ id: 1, narration: "第一句旁白" }], r2Keys: [], rightsSources: rights, projectId: project,
    }));
  });
});
