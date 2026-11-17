// Card U9 (video-unify-plan-20261116 §4 U9): 存成核准版本 from the workbench is the same chain 腳本 reads.
// A version saved and approved for an organization is in that organization's list (腳本's Story Bible picker keeps the
// approved ones); a member of another organization never reads it, whatever organization it names.
// Mutation: drop `.eq("organization_id", organizationId)` from GET -> the second test is red.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ rows: [] as Row[] }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: () => {
      const filters: [string, unknown][] = [];
      let insert: Row | null = null;
      const result = () => db.rows.filter((r) => filters.every(([k, v]) => r[k] === v));
      const q = {
        select: () => q, order: () => q, limit: () => q, in: () => q,
        eq: (k: string, v: unknown) => (filters.push([k, v]), q),
        insert: (row: Row) => ((insert = { id: `r${db.rows.length + 1}`, created_at: "now", approved_at: null, ...row }), q),
        maybeSingle: async () => ({ data: [...result()].sort((a, b) => Number(b.revision) - Number(a.revision))[0] ?? null, error: null }),
        single: async () => { db.rows.push(insert!); return { data: insert, error: null }; },
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: result(), error: null }).then(ok),
      };
      return q;
    },
  }),
}));

import { GET, POST } from "./route";

const ORG = "123e4567-e89b-42d3-a456-426614174001";
const OTHER = "123e4567-e89b-42d3-a456-426614174009";
const doc = { schemaVersion: "1.0.0", seriesId: "series_1", revision: 1, state: "draft", characters: [{ id: "char_1", name: "小美", role: "主角", referenceAssetIds: [] }], locations: [], props: [],
  continuity: { currentState: [], prohibitions: [], openThreads: [] }, episode: { episodeId: "ep_1", premise: "p", hook: "h", beats: ["b"], stateDelta: {} }, provenance: { capabilityVersion: "1.0.0", sourceArtifactIds: [] } };
const client = (org: string) => ({ "x-ops-user-kind": "client", "x-ops-org-id": org, "x-ops-claims-role": "owner" });
const list = async (headers: Record<string, string>, asked: string) => (await (await GET(new Request(`http://localhost/api/video/story-bibles?organizationId=${asked}`, { headers }))).json()) as { items?: Row[] };

beforeEach(() => { db.rows = []; });

describe("/api/video/story-bibles", () => {
  it("a version the workbench saves (no projectId) and approves is in the organization's list as approved", async () => {
    const r = await POST(new Request("http://localhost/api/video/story-bibles", { method: "POST", headers: { ...client(ORG), "content-type": "application/json" }, body: JSON.stringify({ organizationId: ORG, storyBible: doc }) }));
    expect(r.status).toBe(201);
    expect(db.rows[0]).toMatchObject({ organization_id: ORG, project_id: null, series_id: "series_1", revision: 1 });
    db.rows[0].status = "approved"; // approve_media_story_bible_revision (approve/route.test.ts covers who may)
    const approved = (await list(client(ORG), ORG)).items!.filter((it) => it.status === "approved");
    expect(approved.map((it) => it.series_id)).toEqual(["series_1"]);
  });

  it("another organization's member reads none of it, even naming that organization", async () => {
    db.rows.push({ id: "r1", organization_id: ORG, series_id: "series_1", revision: 1, status: "approved", document_json: doc });
    expect((await list(client(OTHER), ORG)).items).toEqual([]);
  });
});
