// The video cover (0163 cover_media_id) reaches the media list and the sender's queue by a SECOND plain query on
// social_media, not by an embed of the table into itself (no-self-embed.test.ts says why). These tests pin the two
// query shapes and the unchanged result shapes: listMedia rows keep `cover_path`, QueuedPost media keep `cover`.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Call = { table: string; select: string; filters: Array<[string, string, unknown]> };
const h = vi.hoisted(() => ({ calls: [] as Call[], answer: (() => []) as (call: Call) => Row[], failCovers: false }));

/** A chainable PostgREST stand-in: every filter is recorded, the query resolves to h.answer(call). */
function fakeClient() {
  return {
    from: (table: string) => {
      const call: Call = { table, select: "", filters: [] };
      h.calls.push(call);
      const q: Record<string, unknown> = {};
      const chain = (name: string) => (q[name] = (...args: unknown[]) => { call.filters.push([name, String(args[0]), args[1]]); return q; });
      q.select = (s: string) => { call.select = s; return q; };
      for (const f of ["eq", "in", "lte", "order", "limit"]) chain(f);
      q.then = (res: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) =>
        Promise.resolve(h.failCovers && call.filters.some(([f]) => f === "in") ? { data: null, error: { message: "boom" } } : { data: h.answer(call), error: null }).then(res);
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  };
}
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => fakeClient() }));
vi.mock("@/lib/content/postiz", () => ({
  uploadVideo: async () => ({ id: "", path: "" }), uploadMedia: async () => ({ id: "", path: "" }),
  connectUrl: () => "", listAllIntegrations: async () => [], listPosts: async () => [], createPost: async () => ({}), deletePost: async () => {},
}));
vi.mock("@/lib/ops-inbox/ingest", () => ({ ingestIncident: async () => ({ error: null }) }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed: async () => ({ allowed: true }) }));
vi.mock("@/lib/entitlements/grant", () => ({ grantFor: async () => ({}) }));
vi.mock("@/lib/entitlements/can", () => ({ EntitlementRequired: class extends Error {} }));

const { listMedia } = await import("../store");
const { dispatchPorts } = await import("../dispatch-store");
const { loadCoverRows, coverKey } = await import("../cover-rows");

const ORG = "39ad4149-5044-4077-8d9a-b6b916de0e21";
const VIDEO = "86a80e2d-ec46-4052-a3c7-429bab42b2b7";
const COVER = "3b98bacb-1c65-4240-ad8e-5f08dd93ddfa";
const coverRow = { id: COVER, organization_id: ORG, kind: "image", postiz_media_id: "pz-c", postiz_path: "https://pz/c.jpg" };
const videoRow = { id: VIDEO, organization_id: ORG, kind: "video", postiz_media_id: "pz-v", postiz_path: "https://pz/v.mp4", cover_media_id: COVER };

beforeEach(() => { h.calls = []; h.answer = () => []; h.failCovers = false; });

const inFilter = (call: Call) => call.filters.find(([f]) => f === "in");

describe("loadCoverRows", () => {
  it("asks for nothing when no ref has a cover", async () => {
    const got = await loadCoverRows(fakeClient() as never, [{ organization_id: ORG, cover_media_id: null }]);
    expect(got.size).toBe(0);
    expect(h.calls).toEqual([]);
  });
  it("one query per 100 distinct ids, each a plain in-list on social_media, no embed", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`);
    h.answer = (call) => (inFilter(call)![2] as string[]).map((id) => ({ id, organization_id: ORG, postiz_media_id: null, postiz_path: `p/${id}` }));
    const got = await loadCoverRows(fakeClient() as never, ids.flatMap((id) => [{ organization_id: ORG, cover_media_id: id }, { organization_id: ORG, cover_media_id: id }]));
    expect(h.calls.map((c) => c.table)).toEqual(["social_media", "social_media"]);
    expect(h.calls.map((c) => (inFilter(c)![2] as string[]).length)).toEqual([100, 50]);
    for (const c of h.calls) expect(c.select).not.toMatch(/social_media!|\(/);
    expect(got.size).toBe(150);
  });
  it("a cover row from another organization than the video's is dropped", async () => {
    h.answer = () => [{ ...coverRow, organization_id: "other-org" }];
    const got = await loadCoverRows(fakeClient() as never, [{ organization_id: ORG, cover_media_id: COVER }]);
    expect(got.size).toBe(0);
  });
});

describe("listMedia", () => {
  it("first query takes cover_media_id without a self-embed; second resolves it; rows keep cover_path", async () => {
    h.answer = (call) => (inFilter(call) ? [coverRow] : [{ ...videoRow, file_name: "v.mp4", bytes: 1, created_at: "t", uses: [{ count: 2 }] },
      { ...coverRow, file_name: "c.jpg", bytes: 1, created_at: "t", cover_media_id: null, uses: [] }]);
    const rows = await listMedia(ORG);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[0].select).toContain("cover_media_id");
    expect(h.calls[0].select).not.toContain("social_media!");
    expect(h.calls[0].filters).toContainEqual(["eq", "organization_id", ORG]);
    expect(inFilter(h.calls[1])).toEqual(["in", "id", [COVER]]);
    expect(rows).toEqual([
      expect.objectContaining({ id: VIDEO, kind: "video", used: 2, cover_path: "https://pz/c.jpg" }),
      expect.objectContaining({ id: COVER, kind: "image", used: 0, cover_path: null }),
    ]);
    for (const r of rows) expect(r).not.toHaveProperty("cover_media_id");
  });
  it("a failed cover lookup still returns the list, every cover_path null (a thumbnail never empties the library)", async () => {
    h.failCovers = true;
    h.answer = () => [{ ...videoRow, file_name: "v.mp4", bytes: 1, created_at: "t", uses: [] }];
    const rows = await listMedia(ORG);
    expect(rows).toEqual([expect.objectContaining({ id: VIDEO, cover_path: null })]);
  });
  it("a brand with no covers makes one query only", async () => {
    h.answer = () => [{ ...coverRow, file_name: "c.jpg", bytes: 1, created_at: "t", cover_media_id: null, uses: [] }];
    const rows = await listMedia(ORG);
    expect(h.calls).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cover_path: null, used: 0 });
  });
});

describe("dispatch-store loadDue / loadQueued", () => {
  const post = {
    id: "p1", organization_id: ORG, version: 1, state: "scheduled", scheduled_at: "2026-11-15T00:00:00Z", updated_at: "u", body: "b", link_url: null, link_utm: false,
    comments: [], targets: [],
    media: [{ position: 1, alt_text: null, item: { postiz_media_id: "pz-v", postiz_path: "https://pz/v.mp4", cover_media_id: COVER } },
      { position: 0, alt_text: "a", item: { postiz_media_id: "pz-i", postiz_path: "https://pz/i.jpg", cover_media_id: null } }],
  };
  it("the SELECT carries cover_media_id and no self-embed; covers are filled from the second query", async () => {
    h.answer = (call) => (call.table === "social_posts" ? [post] : [coverRow]);
    const [got] = await dispatchPorts(fakeClient() as never).loadDue(new Date(), 10);
    expect(h.calls.map((c) => c.table)).toEqual(["social_posts", "social_media"]);
    expect(h.calls[0].select).toContain("item:social_media(postiz_media_id, postiz_path, cover_media_id)");
    expect(h.calls[0].select).not.toContain("social_media!");
    expect(got.media).toEqual([
      { postizMediaId: "pz-i", postizPath: "https://pz/i.jpg", altText: "a", cover: null },
      { postizMediaId: "pz-v", postizPath: "https://pz/v.mp4", altText: null, cover: { postizMediaId: "pz-c", postizPath: "https://pz/c.jpg" } },
    ]);
  });
  it("a cover row the second query does not return (deleted, other org) leaves cover null, the post still loads", async () => {
    h.answer = (call) => (call.table === "social_posts" ? [post] : []);
    const [got] = await dispatchPorts(fakeClient() as never).loadQueued(10);
    expect(got.media[1].cover).toBeNull();
    expect(h.calls[0].filters).toContainEqual(["eq", "state", "queued"]);
  });
  it("a failed cover lookup fails the load: the sender never sends a video without the cover it was given", async () => {
    h.failCovers = true;
    h.answer = () => [post];
    await expect(dispatchPorts(fakeClient() as never).loadDue(new Date(), 10)).rejects.toThrow(/cover rows: boom/);
  });
  it("coverKey separates organizations", () => {
    expect(coverKey("a", "x")).not.toBe(coverKey("b", "x"));
  });
});
