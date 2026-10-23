import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteVideoObjects = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, deleted: 2 })));
const getWpSites = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage/r2", () => ({ deleteVideoObjects }));
vi.mock("@/lib/content/wp-sites", () => ({ getWpSites, wpAuthHeader: () => "Basic x" }));

const { deleteUnreferencedVideo, videoDirNeedles } = await import("../delete-guard");

const SITE = { id: "s1", name: "Soulful", url: "https://soulful.example", color: "", username: "u", organizationId: null };
const KEY = "video/感恩日記_改變人生/16x9.mp4";
type Row = { id: number; status: string; link: string; content: { raw: string } };
let rowsFor: (url: URL) => Row[];
let totalPages: (url: URL) => number;
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
afterEach(() => { vi.unstubAllGlobals(); deleteVideoObjects.mockClear(); fetchMock.mockClear(); });

const row = (id: number, raw: string): Row => ({ id, status: "publish", link: `https://soulful.example/?p=${id}`, content: { raw } });

describe("deleteUnreferencedVideo", () => {
  it("refuses and names the post while a post embeds the video", async () => {
    rowsFor = (u) => (u.pathname.endsWith("/posts") ? [row(7393, `intro\n\nhttps://pub.r2.dev/${KEY}\n`)] : []);
    const r = await deleteUnreferencedVideo(KEY);
    expect(r).toMatchObject({ ok: false, error: "video_in_use", references: [{ site: "Soulful", type: "post", id: 7393 }] });
    expect(deleteVideoObjects).not.toHaveBeenCalled();
  });

  it("finds the percent-encoded form of a CJK folder", async () => {
    const encoded = `video/${encodeURIComponent("感恩日記_改變人生")}/9x16.mp4`;
    rowsFor = (u) => (u.pathname.endsWith("/pages") ? [row(12, `<video src="https://pub.r2.dev/${encoded.toLowerCase()}">`)] : []);
    const r = await deleteUnreferencedVideo(KEY);
    expect(r).toMatchObject({ ok: false, error: "video_in_use", references: [{ type: "page", id: 12 }] });
  });

  it("searches every status, both types, and every page of results", async () => {
    totalPages = (u) => (u.pathname.endsWith("/posts") ? 2 : 1);
    rowsFor = (u) => (u.searchParams.get("page") === "2" && u.pathname.endsWith("/posts") ? [row(9, `https://pub.r2.dev/${KEY}`)] : []);
    const r = await deleteUnreferencedVideo(KEY);
    expect(r).toMatchObject({ ok: false, error: "video_in_use", references: [{ id: 9 }] });
    expect(fetchMock.mock.calls.every(([u]) => new URL(u).searchParams.get("status") === "any")).toBe(true);
  });

  it("a search hit on a different folder is not a reference; nothing found -> deletes", async () => {
    rowsFor = () => [row(1, "https://pub.r2.dev/video/感恩日記_改變人生_第二集/16x9.mp4")];
    expect(await deleteUnreferencedVideo(KEY)).toEqual({ ok: true, deleted: 2 });
    expect(deleteVideoObjects).toHaveBeenCalledWith(KEY);
  });

  it("could-not-check refuses: HTTP error, missing token, no sites, no raw content", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("no", { status: 401 }));
    expect(await deleteUnreferencedVideo(KEY)).toMatchObject({ ok: false, error: "reference_scan_http_401:Soulful" });

    getWpSites.mockResolvedValueOnce({ sites: [SITE], tokens: {}, usernames: {} });
    expect(await deleteUnreferencedVideo(KEY)).toMatchObject({ ok: false, error: "reference_scan_no_credentials:Soulful" });

    getWpSites.mockResolvedValueOnce({ sites: [], tokens: {}, usernames: {} });
    expect(await deleteUnreferencedVideo(KEY)).toMatchObject({ ok: false, error: "reference_scan_no_sites" });

    rowsFor = () => [{ id: 1, status: "publish", link: "", content: {} as { raw: string } }];
    expect(await deleteUnreferencedVideo(KEY)).toMatchObject({ ok: false, error: "reference_scan_no_raw_content:Soulful" });
    expect(deleteVideoObjects).not.toHaveBeenCalled();
  });

  it("rejects a key that is not a video object", () => {
    expect(videoDirNeedles("designs/2026-10/x.png")).toBeNull();
  });
});

describe("delete boundary", () => {
  it("only delete-guard.ts calls deleteVideoObjects", () => {
    const root = process.cwd();
    const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      if (n === "node_modules" || n === "__tests__" || n.startsWith(".")) return [];
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
    });
    const users = [...files(join(root, "app")), ...files(join(root, "lib"))]
      .filter((f) => /\bdeleteVideoObjects\b/.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f).replace(/\\/g, "/"))
      .sort();
    expect(users).toEqual(["lib/content/video/delete-guard.ts", "lib/storage/r2.ts"]);
  });
});
