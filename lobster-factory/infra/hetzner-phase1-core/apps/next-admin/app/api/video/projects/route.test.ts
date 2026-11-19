// V1.2: a project read by id is checked against the caller's organization; invalid values are 400 before any write.
// U0: a workbench project has one row per (org, sourceRef); attachAssetIds links only the org's unlinked videos.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));

import { GET, PATCH, POST } from "./route";

const org = "123e4567-e89b-42d3-a456-426614174001";
const other = "123e4567-e89b-42d3-a456-426614174009";
const projectId = "123e4567-e89b-42d3-a456-426614174002";

// Thenable query chain: every filter returns the chain; maybeSingle/single/await resolve to the table's row(s).
function fakeDb(rows: Record<string, unknown>, lists: Record<string, unknown[]> = {}) {
  const insert = vi.fn();
  const chain = (table: string): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "in", "order", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: rows[table] ?? null, error: null });
    q.single = async () => ({ data: rows[table] ?? null, error: null });
    q.then = (resolve: (v: unknown) => void) => resolve({ data: lists[table] ?? [], error: null });
    q.insert = (v: unknown) => { insert(v); return q; };
    return q;
  };
  return { db: { from: chain }, insert };
}

const asClient = (url: string, init?: RequestInit) => new NextRequest(url, {
  ...init, headers: { "content-type": "application/json", "x-ops-claims-role": "owner", "x-ops-user-kind": "client", "x-ops-org-id": org },
});
const asStaff = (url: string, init?: RequestInit) => new NextRequest(url, {
  ...init, headers: { "content-type": "application/json", "x-ops-claims-role": "owner", "x-ops-user-kind": "staff" },
});

beforeEach(() => vi.clearAllMocks());

describe("/api/video/projects", () => {
  it("GET ?id= refuses another organization's project and serves the caller's own", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb({ media_production_projects: { id: projectId, organization_id: other } }).db);
    expect((await GET(asClient(`http://localhost/api/video/projects?id=${projectId}`))).status).toBe(403);
    getSupabaseWriteClient.mockReturnValue(fakeDb({ media_production_projects: { id: projectId, organization_id: org } }).db);
    const res = await GET(asClient(`http://localhost/api/video/projects?id=${projectId}`));
    expect(res.status).toBe(200);
  });

  it("GET ?id= returns the outcome snapshots of the project's releases, empty when none were published", async () => {
    const project = { media_production_projects: { id: projectId, organization_id: org } };
    const get = async () => (await GET(asClient(`http://localhost/api/video/projects?id=${projectId}`))).json() as Promise<{ outcomes: unknown[] }>;
    getSupabaseWriteClient.mockReturnValue(fakeDb(project).db);
    expect((await get()).outcomes).toEqual([]);
    const snap = { id: "s1", release_id: "r1", platform: "youtube", maturity: "7d", observed_at: "2026-10-28T00:00:00Z", metrics: { views: 10 } };
    getSupabaseWriteClient.mockReturnValue(fakeDb(project, { media_assets: [{ id: "a1" }], media_releases: [{ id: "r1" }], media_outcome_snapshots: [snap] }).db);
    expect((await get()).outcomes).toEqual([snap]);
  });

  it("POST rejects an unknown autonomy or format with 400 and writes nothing", async () => {
    const { db, insert } = fakeDb({});
    getSupabaseWriteClient.mockReturnValue(db);
    const post = (extra: object) => POST(asStaff("http://localhost/api/video/projects", {
      method: "POST", body: JSON.stringify({ organizationId: org, title: "t", productionMode: "quick_video", ...extra }),
    }));
    expect((await post({ autonomy: "whenever" })).status).toBe(400);
    expect((await post({ formats: ["1x1"] })).status).toBe(400);
    expect((await post({ formats: [] })).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  // In-memory tables honouring the filters the route uses; insert enforces 0164's unique (organization_id, source_ref).
  function memoryDb(tables: Record<string, Array<Record<string, unknown>>>) {
    let seq = 0;
    const from = (table: string) => {
      const rows = (tables[table] ??= []);
      const tests: Array<(r: Record<string, unknown>) => boolean> = [];
      let op: { kind: "select" } | { kind: "insert"; v: Record<string, unknown> } | { kind: "update"; v: Record<string, unknown> } = { kind: "select" };
      const run = () => {
        if (op.kind === "insert") {
          const v = op.v;
          if (v.source === "video_workbench" && rows.some((r) => r.source === "video_workbench" && r.organization_id === v.organization_id && r.source_ref === v.source_ref))
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          const row = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, ...v };
          rows.push(row); return { data: [row], error: null };
        }
        const hit = rows.filter((r) => tests.every((t) => t(r)));
        if (op.kind === "update") for (const r of hit) Object.assign(r, op.v);
        return { data: hit, error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q, order: () => q, limit: () => q, neq: (k: string, v: unknown) => { tests.push((r) => r[k] !== v); return q; },
        eq: (k: string, v: unknown) => { tests.push((r) => r[k] === v); return q; },
        is: (k: string, v: unknown) => { tests.push((r) => (r[k] ?? null) === v); return q; },
        in: (k: string, v: unknown[]) => { tests.push((r) => v.includes(r[k])); return q; },
        gte: (k: string, v: unknown) => { tests.push((r) => String(r[k] ?? "") >= String(v)); return q; },
        insert: (v: Record<string, unknown>) => { op = { kind: "insert", v }; return q; },
        update: (v: Record<string, unknown>) => { op = { kind: "update", v }; return q; },
        maybeSingle: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
        single: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
        then: (resolve: (v: unknown) => void) => resolve(run()),
      };
      return q;
    };
    return { from };
  }
  const postWb = (extra: object) => POST(asStaff("http://localhost/api/video/projects", {
    method: "POST", body: JSON.stringify({ organizationId: org, title: "Ep 1", productionMode: "short_drama", source: "video_workbench", sourceRef: "vw-proj-1", ...extra }),
  }));

  it("POST video_workbench twice with one sourceRef leaves one row; the second call answers 200 with it and the new title", async () => {
    const tables: Record<string, Array<Record<string, unknown>>> = { media_production_projects: [] };
    getSupabaseWriteClient.mockReturnValue(memoryDb(tables));
    const first = await postWb({});
    const second = await postWb({ title: "Ep 1 renamed" });
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(tables.media_production_projects).toHaveLength(1);
    const item = ((await second.json()) as { item: Record<string, unknown> }).item;
    expect(item).toMatchObject({ id: tables.media_production_projects[0].id, title: "Ep 1 renamed", source_ref: "vw-proj-1" });
    expect((await postWb({ sourceRef: "" })).status).toBe(400);
  });

  it("GET ?excludeSource= leaves that source out (a 選題 row with its own source_ref stays); an unknown value is 400", async () => {
    const tables = { media_production_projects: [
      { id: "p-wb", organization_id: org, source: "video_workbench", source_ref: "vw-1", lifecycle_stage: "produce" },
      { id: "p-topic", organization_id: org, source: "content_topic", source_ref: "topic-7", lifecycle_stage: "produce" },
      { id: "p-manual", organization_id: org, source: "manual", source_ref: null, lifecycle_stage: "create" },
    ] };
    getSupabaseWriteClient.mockReturnValue(memoryDb(tables));
    const res = await GET(asStaff(`http://localhost/api/video/projects?organizationId=${org}&excludeSource=video_workbench`));
    expect(((await res.json()) as { items: Array<{ id: string }> }).items.map((p) => p.id).sort()).toEqual(["p-manual", "p-topic"]);
    expect((await GET(asStaff(`http://localhost/api/video/projects?organizationId=${org}&excludeSource=nope`))).status).toBe(400);
  });

  it("POST attachAssetIds links only this org's unlinked video assets (null -> this project)", async () => {
    const a = (n: number) => `123e4567-e89b-42d3-a456-4266141741${String(n).padStart(2, "0")}`;
    const assets = [
      { id: a(1), organization_id: org, mime_type: "video/mp4", media_project_id: null },          // linked
      { id: a(2), organization_id: other, mime_type: "video/mp4", media_project_id: null },        // another org
      { id: a(3), organization_id: org, mime_type: "video/mp4", media_project_id: projectId },     // already in a project
      { id: a(4), organization_id: org, mime_type: "image/png", media_project_id: null },          // not a video
      { id: a(5), organization_id: org, mime_type: "video/webm", media_project_id: null },         // not a finished mp4
    ];
    const tables: Record<string, Array<Record<string, unknown>>> = { media_production_projects: [], media_assets: assets };
    getSupabaseWriteClient.mockReturnValue(memoryDb(tables));
    const res = await postWb({ attachAssetIds: assets.map((x) => x.id) });
    const project = tables.media_production_projects[0].id;
    expect(((await res.json()) as { attached: string[] }).attached).toEqual([a(1)]);
    expect(assets.map((x) => x.media_project_id)).toEqual([project, null, projectId, null, null]);
    expect((await postWb({ attachAssetIds: Array.from({ length: 51 }, (_, i) => a(i)) })).status).toBe(400);
  });

  // U5 C1/M1: the workbench's 停止／從這裡繼續 change the server half of ONE run (brief_json.autoBudget.runId); a stop of
  // another run never disarms the row (mutation: drop the runId condition -> "a stop of an older run" goes red).
  describe("PATCH autoRun", () => {
    const row = (over: Record<string, unknown> = {}) => ({ id: projectId, organization_id: org, autonomy: "auto_after_render", last_error: "停下", updated_at: "2026-11-18T00:00:00.000Z",
      brief_json: { autoBudget: { runId: "run-new", budgetTwd: 20, spentTwd: 5 }, autoDrafts: { count: 1 } }, ...over });
    const patch = (autoRun: unknown, extra: object = {}) => PATCH(asStaff("http://localhost/api/video/projects", { method: "PATCH", body: JSON.stringify({ id: projectId, autoRun, ...extra }) }));

    it("a stop of the row's run disarms it and records the stop; a stop of an older run only records that run's stop", async () => {
      const tables = { media_production_projects: [row()] };
      getSupabaseWriteClient.mockReturnValue(memoryDb(tables));
      expect((await patch({ runId: "run-old", action: "stop" })).status).toBe(200);
      expect(tables.media_production_projects[0]).toMatchObject({ autonomy: "auto_after_render", brief_json: { autoStop: "run-old", autoDrafts: { count: 1 } } });
      expect((await patch({ runId: "run-new", action: "stop" })).status).toBe(200);
      expect(tables.media_production_projects[0]).toMatchObject({ autonomy: "guided", brief_json: { autoStop: "run-new", autoBudget: { runId: "run-new" } } });
    });

    it("resume re-arms the same run with the new limit and no old stop reason; never below what was spent", async () => {
      const tables = { media_production_projects: [row({ autonomy: "guided", brief_json: { autoBudget: { runId: "run-new", budgetTwd: 20, spentTwd: 5, renderRatios: ["16x9"] }, autoStop: "run-new" } })] };
      getSupabaseWriteClient.mockReturnValue(memoryDb(tables));
      expect((await patch({ runId: "run-new", action: "resume", budgetTwd: 4 })).status).toBe(409);
      expect(tables.media_production_projects[0].autonomy).toBe("guided");
      const res = await patch({ runId: "run-new", action: "resume", budgetTwd: 30 });
      expect(((await res.json()) as { armed: boolean }).armed).toBe(true);
      expect(tables.media_production_projects[0]).toMatchObject({ autonomy: "auto_after_render", last_error: null, brief_json: { autoBudget: { runId: "run-new", budgetTwd: 30, spentTwd: 5 } } });
      expect(tables.media_production_projects[0].brief_json).not.toHaveProperty("autoStop");
      const other = await patch({ runId: "run-old", action: "resume" });
      expect(((await other.json()) as { armed: boolean }).armed).toBe(false);
    });

    // B26 part 2: resume that declares a re-render records the time after which auto-advance accepts a cut, and goes back to produce.
    it("resume with rerender marks the run (autoRerender) and returns to produce; only for the row's run, only on resume", async () => {
      const tables = { media_production_projects: [row({ autonomy: "guided", lifecycle_stage: "review", brief_json: { autoBudget: { runId: "run-new", budgetTwd: 20, spentTwd: 5, renderRatios: ["16x9"] } } })] };
      getSupabaseWriteClient.mockReturnValue(memoryDb(tables));
      expect((await patch({ runId: "run-old", action: "resume", rerender: true })).status).toBe(200);
      expect(tables.media_production_projects[0].brief_json).not.toHaveProperty("autoRerender");
      expect((await patch({ runId: "run-new", action: "stop", rerender: true })).status).toBe(400);
      const before = Date.now();
      expect((await patch({ runId: "run-new", action: "resume", rerender: true })).status).toBe(200);
      const saved = tables.media_production_projects[0] as unknown as { lifecycle_stage: string; autonomy: string; brief_json: { autoRerender: { runId: string; at: string } } };
      expect(saved).toMatchObject({ lifecycle_stage: "produce", autonomy: "auto_after_render", brief_json: { autoRerender: { runId: "run-new" } } });
      expect(Date.parse(saved.brief_json.autoRerender.at)).toBeGreaterThanOrEqual(before);
      // resumed again while the render is still on its way (no finished cut since the mark): the mark keeps its time
      const first = saved.brief_json.autoRerender.at;
      await new Promise((r) => setTimeout(r, 5));
      expect((await patch({ runId: "run-new", action: "resume", rerender: true })).status).toBe(200);
      expect((tables.media_production_projects[0] as unknown as typeof saved).brief_json.autoRerender.at).toBe(first);
      // a cut finished since the mark: the next resume is a new re-render, the mark moves on
      (tables as Record<string, Array<Record<string, unknown>>>).media_assets = [{ id: "a1", organization_id: org, media_project_id: projectId, mime_type: "video/mp4", is_current: true, created_at: new Date().toISOString() }];
      await new Promise((r) => setTimeout(r, 5));
      expect((await patch({ runId: "run-new", action: "resume", rerender: true })).status).toBe(200);
      expect(Date.parse((tables.media_production_projects[0] as unknown as typeof saved).brief_json.autoRerender.at)).toBeGreaterThan(Date.parse(first));
    });

    it("autoRun alone: with another field, or without a runId/action, it is 400", async () => {
      getSupabaseWriteClient.mockReturnValue(memoryDb({ media_production_projects: [row()] }));
      expect((await patch({ runId: "run-new", action: "stop" }, { autonomy: "guided" })).status).toBe(400);
      expect((await patch({ runId: "run-new", action: "publish" })).status).toBe(400);
      expect((await patch({ runId: "run-new", action: "stop", budgetTwd: 3 })).status).toBe(400);
    });
  });
});
