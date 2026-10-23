/**
 * The only way a saved media asset (gallery video, footage, design image) leaves R2.
 * Invariant: an object still referenced by a WordPress post or page is never deleted.
 *
 * embed-to-wp writes bare R2 video URLs into posts, and the standard-REST publish path (markdownToHtml) keeps R2
 * image URLs as hotlinks, so deleting the object silently breaks every page that shows it (2026-08-26: Soulful
 * post 7393 showed a 404 video). Before deleting, every active wp_sites site is searched (posts + pages, every
 * status but trash, raw content); any hit refuses the delete and names the posts. A site that cannot be searched
 * also refuses: "could not check" is never treated as "not used". REST goes through ?rest_route= because staging
 * sites in a subfolder may lack pretty permalinks.
 * Rollback deletes of objects uploaded moments ago (never published) do not need this and call r2.ts directly;
 * __tests__/r2-delete-guard.test.ts fails if deleteVideoObjects is called anywhere but here.
 */
import { deleteDesignObject, deleteVideoObjects, r2DeleteObject } from "@/lib/storage/r2";
import { getWpSites, wpAuthHeader } from "@/lib/content/wp-sites";

export type AssetReference = { site: string; type: "post" | "page"; id: number; status: string; link: string };

export type ReferenceScan = { ok: true; references: AssetReference[] } | { ok: false; error: string };

export type GuardedDelete =
  | { ok: true; deleted: number }
  | { ok: false; error: "asset_in_use"; references: AssetReference[]; message: string }
  | { ok: false; error: string; message: string };

const MAX_PAGES = 20; // 2000 hits per type and needle; more than that is not a state we can reason about -> refuse

/**
 * What a reference to this object looks like in post content, and how to delete it.
 * `video/<dir>/<format>.mp4`: every format shares the folder, so the folder is the reference and the whole
 * folder is deleted. Any other known prefix: the key itself, in the bucket its prefix belongs to.
 */
export type AssetTarget = { bucket: "video" | "designs"; prefixDelete: boolean; search: string[]; match: string[] };

// A folder match ends in "/" already; a single key must be followed by something that cannot continue a key.
const KEY_CONTINUES = /[A-Za-z0-9._~%-]/;

// Which bucket a single-object key lives in, by its first path segment (r2.ts writers: buildDesignKey designs/,
// buildWebImageKey web/, transcription import captions/; remotion-service remotion/ in the video bucket).
const DESIGNS_BUCKET_PREFIXES = ["designs", "captions", "web"];
const VIDEO_BUCKET_PREFIXES = ["remotion"];

export function assetTarget(objectKey: string): AssetTarget | null {
  const dec = (s: string) => { try { return decodeURIComponent(s); } catch { return null; } };
  const both = (s: string) => [...new Set([s, s.split("/").map(encodeURIComponent).join("/")])];
  const v = /^video\/(.+)\/[^/]+\.mp4$/.exec(objectKey);
  if (v) {
    const dir = dec(v[1]);
    if (!dir) return null;
    const dirs = [...new Set([dir, encodeURIComponent(dir)])];
    return { bucket: "video", prefixDelete: true, search: dirs, match: dirs.map((d) => `video/${d}/`) };
  }
  const key = dec(objectKey);
  const prefix = key?.split("/")[0] ?? "";
  const bucket = VIDEO_BUCKET_PREFIXES.includes(prefix) ? "video" : DESIGNS_BUCKET_PREFIXES.includes(prefix) ? "designs" : null;
  if (!key || !bucket || key.includes("..") || !/^[^/]+\/[^?#]+\.[a-z0-9]+$/i.test(key)) return null;
  return {
    bucket,
    prefixDelete: false,
    search: both(key.slice(key.lastIndexOf("/") + 1)),
    match: both(key),
  };
}

export function contentReferences(raw: string, match: string[]): boolean {
  const hay = raw.toLowerCase();
  return match.some((m) => {
    const needle = m.toLowerCase();
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
      if (needle.endsWith("/") || !KEY_CONTINUES.test(hay.charAt(i + needle.length))) return true;
    }
    return false;
  });
}

export async function findAssetReferences(target: AssetTarget): Promise<ReferenceScan> {
  const { sites, tokens, usernames } = await getWpSites();
  // getWpSites() swallows DB errors; an empty list means "could not load", never "no site uses it".
  if (sites.length === 0) return { ok: false, error: "reference_scan_no_sites" };
  const references: AssetReference[] = [];
  for (const site of sites) {
    const token = tokens[site.id];
    if (!token) return { ok: false, error: `reference_scan_no_credentials:${site.name}` };
    const headers = { Authorization: wpAuthHeader(usernames[site.id] ?? "", token) };
    for (const type of ["post", "page"] as const) {
      for (const needle of target.search) {
        for (let page = 1; ; page++) {
          if (page > MAX_PAGES) return { ok: false, error: `reference_scan_too_many_results:${site.name}` };
          const u = new URL(`${site.url}/`);
          u.searchParams.set("rest_route", `/wp/v2/${type}s`);
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
            if (contentReferences(r.content.raw, target.match) && !references.some((x) => x.site === site.name && x.id === r.id)) {
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

export async function deleteUnreferencedAsset(objectKey: string): Promise<GuardedDelete> {
  const target = assetTarget(objectKey);
  if (!target) return { ok: false, error: "unsupported_object_key", message: `無法辨識的檔案位置，未刪除（${objectKey}）` };
  const scan = await findAssetReferences(target);
  if ("error" in scan) return { ok: false, error: scan.error, message: `無法確認檔案是否仍被文章使用，未刪除（${scan.error}）` };
  if (scan.references.length > 0) {
    const list = scan.references.map((r) => `${r.site} ${r.type} #${r.id}（${r.status}）${r.link}`).join("；");
    return {
      ok: false,
      error: "asset_in_use",
      references: scan.references,
      message: `檔案仍被 ${scan.references.length} 篇文章使用，未刪除。先從文章移除再刪：${list}`,
    };
  }
  const r = target.prefixDelete
    ? await deleteVideoObjects(objectKey)
    : target.bucket === "designs"
      ? await deleteDesignObject(decodeURIComponent(objectKey))
      : await r2DeleteObject(process.env.R2_VIDEO_BUCKET ?? "lobster-videos", decodeURIComponent(objectKey));
  if ("error" in r) return { ok: false, error: r.error, message: `R2 刪除失敗（${r.error}）` };
  return { ok: true, deleted: "deleted" in r ? (r as { deleted: number }).deleted : 1 };
}
