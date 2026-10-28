import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteVideoObjects = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, deleted: 2 })));
const deleteDesignObject = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
const r2DeleteObject = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
const getWpSites = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage/r2", () => ({ deleteVideoObjects, deleteDesignObject, r2DeleteObject }));
vi.mock("@/lib/content/wp-sites", () => ({ getWpSites, wpAuthHeader: () => "Basic x" }));

const { deleteUnreferencedAsset, assetTarget } = await import("../r2-delete-guard");
const { videoObjectKey } = await import("../blocks/video-pipeline");

const SITE = { id: "s1", name: "Soulful", url: "https://soulful.example", color: "", username: "u", organizationId: null };
const KEY = "video/感恩日記_改變人生/16x9.mp4";
type Row = { id: number; status: string; link: string; content: { raw: string } };
let rowsFor: (url: URL) => Row[];
let totalPages: (url: URL) => number;
const route = (u: URL) => u.searchParams.get("rest_route") ?? "";
const fetchMock = vi.fn(async (input: string) => {
  const u = new URL(input);
  return new Response(JSON.stringify(rowsFor(u)), { status: 200, headers: { "x-wp-totalpages": String(totalPages(u)) } });
});

beforeEach(() => {
  getWpSites.mockResolvedValue({ sites: [SITE], tokens: { s1: "t" }, usernames: { s1: "u" } });
  rowsFor = () => [];
  totalPages = () => 1;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const m of [deleteVideoObjects, deleteDesignObject, r2DeleteObject, fetchMock]) m.mockClear();
});

const row = (id: number, raw: string): Row => ({ id, status: "publish", link: `https://soulful.example/?p=${id}`, content: { raw } });
const nothingDeleted = () => [deleteVideoObjects, deleteDesignObject, r2DeleteObject].every((m) => m.mock.calls.length === 0);

describe("deleteUnreferencedAsset", () => {
  it("refuses and names the post while a post embeds the video", async () => {
    rowsFor = (u) => (route(u) === "/wp/v2/posts" ? [row(7393, `intro\n\nhttps://pub.r2.dev/${KEY}\n`)] : []);
    const r = await deleteUnreferencedAsset(KEY);
    expect(r).toMatchObject({ ok: false, error: "asset_in_use", references: [{ site: "Soulful", type: "post", id: 7393 }] });
    expect(nothingDeleted()).toBe(true);
  });

  it("finds the percent-encoded form of a CJK folder", async () => {
    const encoded = `video/${encodeURIComponent("感恩日記_改變人生")}/9x16.mp4`;
    rowsFor = (u) => (route(u) === "/wp/v2/pages" ? [row(12, `<video src="https://pub.r2.dev/${encoded.toLowerCase()}">`)] : []);
    expect(await deleteUnreferencedAsset(KEY)).toMatchObject({ ok: false, error: "asset_in_use", references: [{ type: "page", id: 12 }] });
  });

  it("a caption-reburn version URL (videorev/) maps to the same video and still counts as a reference", async () => {
    const rev = "https://pub.r2.dev/videorev/感恩日記_改變人生/0a1b2c3d/16x9.mp4";
    expect(videoObjectKey(rev)).toBe(`video/${encodeURIComponent("感恩日記_改變人生")}/16x9.mp4`);
    rowsFor = (u) => (route(u) === "/wp/v2/posts" ? [row(31, `<video src="${rev}">`)] : []);
    expect(await deleteUnreferencedAsset(videoObjectKey(rev))).toMatchObject({ ok: false, error: "asset_in_use", references: [{ id: 31 }] });
    expect(nothingDeleted()).toBe(true);
  });

  it("searches every status, both types, through ?rest_route=, and every page of results", async () => {
    totalPages = (u) => (route(u) === "/wp/v2/posts" ? 2 : 1);
    rowsFor = (u) => (u.searchParams.get("page") === "2" && route(u) === "/wp/v2/posts" ? [row(9, `https://pub.r2.dev/${KEY}`)] : []);
    expect(await deleteUnreferencedAsset(KEY)).toMatchObject({ ok: false, error: "asset_in_use", references: [{ id: 9 }] });
    expect(fetchMock.mock.calls.every(([u]) => new URL(u).searchParams.get("status") === "any" && new URL(u).pathname === "/")).toBe(true);
  });

  it("a search hit on a different folder is not a reference; nothing found -> deletes the folder", async () => {
    rowsFor = () => [row(1, "https://pub.r2.dev/video/感恩日記_改變人生_第二集/16x9.mp4")];
    expect(await deleteUnreferencedAsset(KEY)).toEqual({ ok: true, deleted: 2 });
    expect(deleteVideoObjects).toHaveBeenCalledWith(KEY);
  });

  it("a design image hotlinked by a post is refused; an unused one is deleted from the designs bucket", async () => {
    const img = "designs/2026-09/3c7abcbd-0663-4ce5-8c5c-909b42a26992.png";
    rowsFor = () => [row(5, `<img src="https://pub-a88b.r2.dev/${img}">`)];
    expect(await deleteUnreferencedAsset(img)).toMatchObject({ ok: false, error: "asset_in_use", references: [{ id: 5 }] });
    rowsFor = () => [];
    expect(await deleteUnreferencedAsset(img)).toEqual({ ok: true, deleted: 1 });
    expect(deleteDesignObject).toHaveBeenCalledWith(img);
  });

  it("a key that only prefixes another file name is not a reference (foo.png vs foo.png.bak)", async () => {
    const img = "designs/2026-09/foo.png";
    rowsFor = () => [row(3, `<img src="https://pub-a88b.r2.dev/${img}.bak">`)];
    expect(await deleteUnreferencedAsset(img)).toEqual({ ok: true, deleted: 1 });
    rowsFor = () => [row(3, `<img src="https://pub-a88b.r2.dev/${img}?w=300">`)];
    expect(await deleteUnreferencedAsset(img)).toMatchObject({ ok: false, error: "asset_in_use" });
  });

  it("routes each prefix to its bucket and refuses keys it does not know", async () => {
    expect(await deleteUnreferencedAsset("remotion/2026-09-11/54e8ccfb.mp4")).toEqual({ ok: true, deleted: 1 });
    expect(r2DeleteObject).toHaveBeenCalledWith("lobster-videos", "remotion/2026-09-11/54e8ccfb.mp4");
    expect(assetTarget("captions/a.json")?.bucket).toBe("designs");
    for (const k of ["other/x.png", "designs/../x.png", "designs/2026-09/x"]) expect(assetTarget(k), k).toBeNull();
    expect(await deleteUnreferencedAsset("other/x.png")).toMatchObject({ ok: false, error: "unsupported_object_key" });
  });

  it("could-not-check refuses: HTTP error, missing token, no sites, no raw content", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("no", { status: 401 }));
    expect(await deleteUnreferencedAsset(KEY)).toMatchObject({ ok: false, error: "reference_scan_http_401:Soulful" });

    getWpSites.mockResolvedValueOnce({ sites: [SITE], tokens: {}, usernames: {} });
    expect(await deleteUnreferencedAsset(KEY)).toMatchObject({ ok: false, error: "reference_scan_no_credentials:Soulful" });

    getWpSites.mockResolvedValueOnce({ sites: [], tokens: {}, usernames: {} });
    expect(await deleteUnreferencedAsset(KEY)).toMatchObject({ ok: false, error: "reference_scan_no_sites" });

    rowsFor = () => [{ id: 1, status: "publish", link: "", content: {} as { raw: string } }];
    expect(await deleteUnreferencedAsset(KEY)).toMatchObject({ ok: false, error: "reference_scan_no_raw_content:Soulful" });
    expect(nothingDeleted()).toBe(true);
  });
});

describe("delete boundary", () => {
  const root = process.cwd();
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    if (n === "node_modules" || n === "__tests__" || n.startsWith(".")) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
  const sources = [...files(join(root, "app")), ...files(join(root, "lib"))]
    .map((f) => ({ f: relative(root, f).replace(/\\/g, "/"), src: readFileSync(f, "utf8") }));

  it("only r2-delete-guard.ts calls deleteVideoObjects", () => {
    expect(sources.filter((x) => /\bdeleteVideoObjects\b/.test(x.src)).map((x) => x.f).sort())
      .toEqual(["lib/content/r2-delete-guard.ts", "lib/storage/r2.ts"]);
  });

  // A saved asset is a media_assets row; deleting one is the path a published file can be lost through.
  it("every route that deletes a media_assets row deletes its file through the guard", () => {
    const deleters = sources.filter((x) => /from\("media_assets"\)[\s\S]{0,200}?\.delete\(\)/.test(x.src));
    expect(deleters.length).toBeGreaterThan(0);
    for (const x of deleters) {
      expect(x.src, x.f).toMatch(/\bdeleteUnreferencedAsset\b/);
      expect(x.src, x.f).not.toMatch(/\b(deleteDesignObject|r2DeleteObject|deleteVideoObjects)\b/);
    }
  });
});
