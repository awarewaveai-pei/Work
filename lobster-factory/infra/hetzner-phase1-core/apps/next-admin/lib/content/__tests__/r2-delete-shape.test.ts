// Card R2DEL (2026-11-15, production data loss): deleting ONE workbench video listed video/workbench/<org>/ as "this
// video's folder" and erased every object there -- the organization's other videos, images and covers. Invariant: a
// delete removes only what belongs to that video. The key's own shape decides: a content-addressed key
// (.../<sha256>.<ext>) is one object, shared by every row with those bytes; video/<dir>/<format>.mp4 is one folder per
// video. Real r2.ts delete code over an in-memory bucket behind the Cloudflare REST API; WordPress scan finds nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ rows: [] as Row[] }));
vi.mock("@/lib/supabase-server", async () => {
  const { fakeDb } = await import("@/lib/content/video/__tests__/fake-db");
  return { getSupabaseWriteClient: () => fakeDb(() => ({ media_assets: db.rows })) };
});
vi.mock("@/lib/content/wp-sites", () => ({ getWpSites: async () => ({ sites: [{ id: "s1", name: "Site", url: "https://site.example" }], tokens: { s1: "t" }, usernames: { s1: "u" } }), wpAuthHeader: () => "Basic x" }));
vi.mock("@/lib/payments/woo", () => ({ listBridgeClientsWithRegistered: async () => [], bridgeRead: vi.fn(), wpSiteKey: () => null }));

const { deleteUnreferencedAsset } = await import("../r2-delete-guard");

const ORG = "39ad4149-0000-4000-8000-000000000001";
const sha = (c: string) => c.repeat(64);
const WB = (s: string, ext = "mp4") => `video/workbench/${ORG}/${s}.${ext}`;
const A = WB(sha("a")), B = WB(sha("b")), COVER = WB(sha("c"), "jpg"), OTHER_ORG = `video/workbench/39ad4149-0000-4000-8000-000000000002/${sha("d")}.mp4`;
const FOLDER = ["video/感恩日記_改變人生/16x9.mp4", "video/感恩日記_改變人生/9x16.mp4", "videoclean/感恩日記_改變人生/16x9.mp4", "video/別支影片/16x9.mp4"];
let bucket: Set<string>;
const modified = new Map<string, string>();   // key -> last_modified; default = long ago
let afterFirstList: ((prefix: string) => void) | null = null;   // runs after a LIST answers (simulates a concurrent upload)
const BASE = "https://api.cloudflare.com/client/v4/accounts/acct/r2/buckets/lobster-videos/objects";

beforeEach(() => {
  vi.stubEnv("R2_API_TOKEN", "t");
  vi.stubEnv("R2_ACCOUNT_ID", "acct");
  bucket = new Set([A, B, COVER, OTHER_ORG, ...FOLDER]);
  modified.clear();
  afterFirstList = null;
  db.rows = [];
  vi.stubGlobal("fetch", async (input: string, init?: { method?: string }) => {
    const u = new URL(input);
    if (u.hostname === "site.example") return new Response("[]", { headers: { "x-wp-totalpages": "1" } });   // no post uses it
    if (u.href.startsWith(BASE) && (init?.method ?? "GET") === "GET" && u.pathname.endsWith("/objects")) {
      const prefix = u.searchParams.get("prefix") ?? "";
      const body = { result: [...bucket].filter((k) => k.startsWith(prefix)).map((key) => ({ key, last_modified: modified.get(key) ?? "2026-11-01T00:00:00Z" })), result_info: { is_truncated: false } };
      const hook = afterFirstList; afterFirstList = null; hook?.(prefix);
      return Response.json(body);
    }
    if (init?.method === "DELETE") { bucket.delete(decodeURIComponent(u.pathname.slice(u.pathname.indexOf("/objects/") + 9))); return new Response(null, { status: 204 }); }
    throw new Error("unexpected " + input);
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("R2DEL: a delete removes only what belongs to the video", () => {
  it("a workbench video: only its own object goes; the org's other videos, its covers and other orgs stay", async () => {
    db.rows = [{ id: "row-a", object_key: A }];
    expect(await deleteUnreferencedAsset(A, { exceptAssetIds: ["row-a"] })).toEqual({ ok: true, deleted: 1 });
    expect([...bucket].sort()).toEqual([B, COVER, OTHER_ORG, ...FOLDER].sort());
  });

  it("bytes another row still uses (same video registered twice) stay in R2; the caller may still drop its own row", async () => {
    db.rows = [{ id: "row-a", object_key: A }, { id: "row-a2", object_key: A }];
    expect(await deleteUnreferencedAsset(A, { exceptAssetIds: ["row-a"] })).toEqual({ ok: true, deleted: 0, kept: "shared" });
    expect(bucket.has(A)).toBe(true);
  });

  it("the same bytes re-uploaded between the reference check and the DELETE are kept (Codex 2a61a510; R2's clock only)", async () => {
    db.rows = [{ id: "row-a", object_key: A }];
    afterFirstList = () => modified.set(A, "2026-11-15T09:00:00Z");   // the upload rewrites the object meanwhile
    expect(await deleteUnreferencedAsset(A, { exceptAssetIds: ["row-a"] })).toEqual({ ok: true, deleted: 0, kept: "shared" });
    expect(bucket.has(A)).toBe(true);
  });

  it("a content-addressed key without the rows being deleted, or when the check cannot run, deletes nothing", async () => {
    expect(await deleteUnreferencedAsset(A)).toMatchObject({ ok: false, error: "reference_check_required" });
    expect(bucket.size).toBe(8);
  });

  it("a one-folder-per-video key still removes its whole folder (all formats + caption-less copy), nothing else", async () => {
    const r = await deleteUnreferencedAsset(encodeURI(FOLDER[0]));
    expect(r).toEqual({ ok: true, deleted: 3 });
    expect([...bucket].sort()).toEqual([A, B, COVER, OTHER_ORG, "video/別支影片/16x9.mp4"].sort());
  });

  it("a shared folder is never one video's folder, whatever the file name (critic: positive invariant)", async () => {
    const odd = `video/workbench/${ORG}/3c7abcbd-0663-4ce5-8c5c-909b42a26992.mp4`;
    bucket.add(odd);
    expect(await deleteUnreferencedAsset(odd)).toMatchObject({ ok: false, error: "not_a_single_video_folder" });
    expect(bucket.size).toBe(9);
    const { deleteVideoObjects } = await import("@/lib/storage/r2");
    expect(await deleteVideoObjects("video/subtitles/x.mp4")).toEqual({ ok: false, error: "not_a_single_video_folder" });
    expect(bucket.size).toBe(9);
  });

  it("r2.ts itself refuses to treat a content-addressed key as a folder", async () => {
    const { deleteVideoObjects } = await import("@/lib/storage/r2");
    expect(await deleteVideoObjects(A)).toEqual({ ok: false, error: "content_addressed_key_not_a_folder" });
    expect(bucket.size).toBe(8);
  });
});
