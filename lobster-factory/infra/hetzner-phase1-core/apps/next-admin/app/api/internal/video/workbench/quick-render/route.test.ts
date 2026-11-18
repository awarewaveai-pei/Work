// Plan U5 快速輸出: a scene names an asset id; only this org's registered assets render (url and rights read from the row),
// another org's id is refused before any render call.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/lib/content/video/__tests__/fake-db";

const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
const submitDraftRender = vi.hoisted(() => vi.fn());
const ensureWorkbenchProject = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));
vi.mock("@/lib/content/video/draft-render", () => ({ submitDraftRender, renderAssetHostError: async () => null }));
vi.mock("@/lib/content/video/projects", async (actual) => ({ ...(await actual<typeof import("@/lib/content/video/projects")>()), ensureWorkbenchProject }));

import { POST } from "./route";

const org = "123e4567-e89b-42d3-a456-426614174001", other = "123e4567-e89b-42d3-a456-426614174009";
const mine = "123e4567-e89b-42d3-a456-426614174002", theirs = "123e4567-e89b-42d3-a456-426614174003";
const project = "123e4567-e89b-42d3-a456-426614174004";
const myIntro = "123e4567-e89b-42d3-a456-426614174006", theirIntro = "123e4567-e89b-42d3-a456-426614174007";
const site = "123e4567-e89b-42d3-a456-426614174008";
const rights = [{ kind: "ai_generated", model: "gpt-image-2", provider: "OpenAI", url: "/generated/a.png" }];
const tables = () => ({
  media_assets: [
    { id: mine, organization_id: org, object_url: "https://v.example.com/video/workbench/a.png", mime_type: "image/png", metadata: { rightsSources: rights } },
    { id: theirs, organization_id: other, object_url: "https://v.example.com/video/workbench/b.png", mime_type: "image/png", metadata: {} },
    { id: myIntro, organization_id: org, object_url: "https://v.example.com/video/workbench/intro.mp4", mime_type: "video/mp4", metadata: {} },
    { id: theirIntro, organization_id: other, object_url: "https://v.example.com/video/workbench/x.mp4", mime_type: "video/mp4", metadata: {} },
  ],
  media_production_projects: [{ id: project, organization_id: org, updated_at: "2026-11-18T00:00:00.000Z", autonomy: "guided", brief_json: { autoDrafts: { count: 1 } } as Record<string, unknown> }],
  wp_sites: [{ id: site, organization_id: org }],
});
const call = (assetId: string, more: Record<string, unknown> = {}) => POST(new Request("http://localhost/api/internal/video/workbench/quick-render", {
  method: "POST", headers: { authorization: "Bearer internal-secret", "content-type": "application/json" },
  body: JSON.stringify({ organizationId: org, sourceRef: "proj-1", title: "第一集", ratio: "9x16", scenes: [{ narration: "第一句旁白", assetId }], ...more }),
}));
let t: ReturnType<typeof tables>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VW_INTERNAL_TOKEN", "internal-secret");
  t = tables();
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

  // Plan U5.4: a template intro is an asset id like a scene; another org's is refused before any render (mutation:
  // drop the organization filter of the asset lookup -> red).
  it("another org's intro asset id: refused, nothing rendered", async () => {
    expect((await call(mine, { intro: { kind: "template", assetId: theirIntro }, transition: "crossfade" })).status).toBe(404);
    expect(submitDraftRender).not.toHaveBeenCalled();
  });

  it("template intro + title outro + crossfade: joined by the service from the rows' urls", async () => {
    expect((await call(mine, { intro: { kind: "template", assetId: myIntro }, outro: { kind: "title", title: "謝謝收看", seconds: 3 }, transition: "crossfade", transitionSeconds: 0.5 })).status).toBe(202);
    expect(submitDraftRender).toHaveBeenCalledWith(expect.objectContaining({
      bookends: { intro: { assetUrl: "https://v.example.com/video/workbench/intro.mp4" }, outro: { title: "謝謝收看", duration: 3 }, transition: "crossfade", transitionSeconds: 0.5 },
    }));
    expect(submitDraftRender.mock.calls[0][0]).not.toHaveProperty("introTitle");
  });

  // Plan §12/§13 C3: a pressed button goes at most to drafts; full_auto (the topic queue's outward publish) is refused.
  it("full_auto: refused, nothing rendered", async () => {
    expect((await call(mine, { autonomy: "full_auto" })).status).toBe(400);
    expect(submitDraftRender).not.toHaveBeenCalled();
  });

  it("embedSiteId: kept for the schedule only with auto_after_render, on this org's site", async () => {
    expect((await call(mine, { embedSiteId: site, autonomy: "guided" })).status).toBe(400);
    expect((await call(mine, { embedSiteId: site, autonomy: "auto_after_render" })).status).toBe(202);
    expect(t.media_production_projects[0].brief_json).toEqual({ autoDrafts: { count: 1 }, autoEmbed: { siteId: site } });
  });
  it("a new run clears completion marks; another ratio of the same run preserves them", async () => {
    const budget = { runId: "run-one", budgetTwd: 20, spentTwd: 0 };
    Object.assign(t.media_production_projects[0].brief_json, { autoEmbedded: { postId: 7 } });
    expect((await call(mine, { autonomy: "auto_after_render", autoBudget: budget, embedSiteId: site })).status).toBe(202);
    expect(t.media_production_projects[0].brief_json).not.toHaveProperty("autoEmbedded");
    expect(t.media_production_projects[0].brief_json).not.toHaveProperty("autoDrafts");
    Object.assign(t.media_production_projects[0].brief_json, { autoEmbedded: { postId: 8 } });
    await call(mine, { autonomy: "auto_after_render", autoBudget: budget, ratio: "16x9", embedSiteId: site });
    expect(t.media_production_projects[0].brief_json).toHaveProperty("autoEmbedded.postId", 8);
    await call(mine, { autonomy: "auto_after_render", autoBudget: { ...budget, runId: "run-two" }, embedSiteId: site });
    expect(t.media_production_projects[0].brief_json).not.toHaveProperty("autoEmbedded");
  });

  // U5 C1: a run a person stopped (brief_json.autoStop) sends no render; a stop that lands while a render is submitted is
  // kept (merged on a fresh read), so that render never re-arms the row.
  it("a stopped run: refused before any render; a stop landing during the submit leaves the row unarmed", async () => {
    const budget = { runId: "run-one", budgetTwd: 20, spentTwd: 0 };
    ensureWorkbenchProject.mockResolvedValueOnce({ ok: true, item: { id: project, brief_json: { autoStop: "run-one" } }, created: false });
    expect((await call(mine, { autonomy: "auto_after_render", autoBudget: budget })).status).toBe(409);
    expect(submitDraftRender).not.toHaveBeenCalled();
    submitDraftRender.mockImplementationOnce(async () => {
      Object.assign(t.media_production_projects[0], { autonomy: "guided", updated_at: "2026-11-18T00:00:01.000Z", brief_json: { ...t.media_production_projects[0].brief_json, autoStop: "run-one" } });
      return { ok: true, jobId: "123e4567-e89b-42d3-a456-426614174005" };
    });
    expect((await call(mine, { autonomy: "auto_after_render", autoBudget: budget })).status).toBe(202);
    expect(t.media_production_projects[0]).toMatchObject({ autonomy: "guided", brief_json: { autoStop: "run-one", autoBudget: { runId: "run-one" } } });
  });
});
