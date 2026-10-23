/**
 * The only way a video leaves R2. Invariant: a video still referenced by a WordPress post or page is never deleted.
 *
 * embed-to-wp writes the bare R2 URL into post content, so deleting the R2 objects silently breaks every page that
 * embeds them (2026-08-26: Soulful post 7393 showed a 404 video). Before deleting, every active wp_sites site is
 * searched (posts + pages, every status but trash, raw content); any hit refuses the delete and names the posts.
 * A site that cannot be searched also refuses: "could not check" is never treated as "not used".
 * lib/content/video/__tests__/delete-guard.test.ts fails if deleteVideoObjects is imported anywhere else.
 */
import { deleteVideoObjects } from "@/lib/storage/r2";
import { getWpSites, wpAuthHeader } from "@/lib/content/wp-sites";

export type VideoReference = { site: string; type: "post" | "page"; id: number; status: string; link: string };

export type ReferenceScan = { ok: true; references: VideoReference[] } | { ok: false; error: string };

export type GuardedDelete =
  | { ok: true; deleted: number }
  | { ok: false; error: "video_in_use"; references: VideoReference[]; message: string }
  | { ok: false; error: string; message: string };

const MAX_PAGES = 20; // 2000 hits per type and needle; more than that is not a state we can reason about -> refuse

/** `video/<dir>/<format>.mp4` -> the folder every format of this video shares, raw and percent-encoded. */
export function videoDirNeedles(objectKey: string): string[] | null {
  const m = /^video\/(.+)\/[^/]+\.mp4$/.exec(objectKey);
  if (!m) return null;
  let dir: string;
  try { dir = decodeURIComponent(m[1]); } catch { return null; }
  const encoded = encodeURIComponent(dir);
  return [...new Set([dir, encoded])];
}

export function contentReferences(raw: string, needles: string[]): boolean {
  const hay = raw.toLowerCase();
  return needles.some((n) => hay.includes(`video/${n}/`.toLowerCase()));
}

export async function findVideoReferences(objectKey: string): Promise<ReferenceScan> {
  const needles = videoDirNeedles(objectKey);
  if (!needles) return { ok: false, error: "invalid_video_object_key" };

  const { sites, tokens, usernames } = await getWpSites();
  // getWpSites() swallows DB errors; an empty list means "could not load", never "no site uses it".
  if (sites.length === 0) return { ok: false, error: "reference_scan_no_sites" };
  const references: VideoReference[] = [];
  for (const site of sites) {
    const token = tokens[site.id];
    if (!token) return { ok: false, error: `reference_scan_no_credentials:${site.name}` };
    const headers = { Authorization: wpAuthHeader(usernames[site.id] ?? "", token) };
    for (const type of ["post", "page"] as const) {
      for (const needle of needles) {
        for (let page = 1; ; page++) {
          if (page > MAX_PAGES) return { ok: false, error: `reference_scan_too_many_results:${site.name}` };
          const u = new URL(`${site.url}/wp-json/wp/v2/${type}s`);
          u.searchParams.set("search", needle);
          u.searchParams.set("status", "any");
          u.searchParams.set("context", "edit");
          u.searchParams.set("per_page", "100");
          u.searchParams.set("page", String(page));
          u.searchParams.set("_fields", "id,status,link,content");
          let res: Response;
          try { res = await fetch(u.toString(), { headers, signal: AbortSignal.timeout(15_000) }); }
          catch { return { ok: false, error: `reference_scan_network:${site.name}` }; }
          if (!res.ok) return { ok: false, error: `reference_scan_http_${res.status}:${site.name}` };
          const rows = (await res.json().catch(() => null)) as Array<{ id: number; status: string; link: string; content?: { raw?: string } }> | null;
          if (!Array.isArray(rows)) return { ok: false, error: `reference_scan_bad_response:${site.name}` };
          for (const r of rows) {
            if (typeof r.content?.raw !== "string") return { ok: false, error: `reference_scan_no_raw_content:${site.name}` };
            if (contentReferences(r.content.raw, needles) && !references.some((x) => x.site === site.name && x.id === r.id)) {
              references.push({ site: site.name, type, id: r.id, status: r.status, link: r.link });
            }
          }
          const totalPages = Number(res.headers.get("x-wp-totalpages") ?? "1");
          if (page >= totalPages) break;
        }
      }
    }
  }
  return { ok: true, references };
}

export async function deleteUnreferencedVideo(objectKey: string): Promise<GuardedDelete> {
  const scan = await findVideoReferences(objectKey);
  if ("error" in scan) return { ok: false, error: scan.error, message: `無法確認影片是否仍被文章使用，未刪除（${scan.error}）` };
  if (scan.references.length > 0) {
    const list = scan.references.map((r) => `${r.site} ${r.type} #${r.id}（${r.status}）${r.link}`).join("；");
    return {
      ok: false,
      error: "video_in_use",
      references: scan.references,
      message: `影片仍被 ${scan.references.length} 篇文章使用，未刪除。先從文章移除影片再刪：${list}`,
    };
  }
  const r = await deleteVideoObjects(objectKey);
  return "error" in r ? { ok: false, error: r.error, message: `R2 刪除失敗（${r.error}）` } : r;
}
