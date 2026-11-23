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
 * A site with a configured wp-bridge client (same host) is asked through the bridge's signed /asset-references
 * instead (post content, excerpts and post meta of every post type): it needs no application password, which
 * Wordfence can switch off (Soulful, 2026-11-02). A bridge without that route (older than 0.20.0) answers 404 and
 * the site falls back to REST; any other bridge failure refuses.
 * Rollback deletes of objects uploaded moments ago (never published) do not need this and call r2.ts directly;
 * __tests__/r2-delete-guard.test.ts fails if deleteVideoObjects is called anywhere but here.
 */
import { deleteDesignObject, deleteVideoObjects, isContentAddressedKey, r2DeleteObject, r2ListObjects } from "@/lib/storage/r2";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { getWpSites, wpAuthHeader } from "@/lib/content/wp-sites";
import { bridgeRead, listBridgeClientsWithRegistered, wpSiteKey } from "@/lib/payments/woo";

export type AssetReference = { site: string; type: string; id: number; status: string; link: string };

export type ReferenceScan = { ok: true; references: AssetReference[] } | { ok: false; error: string };

export type GuardedDelete =
  | { ok: true; deleted: number; kept?: "shared" }
  | { ok: false; error: "asset_in_use"; references: AssetReference[]; message: string }
  | { ok: false; error: string; message: string };

const MAX_PAGES = 20; // 2000 hits per type and needle; more than that is not a state we can reason about -> refuse

/**
 * What a reference to this object looks like in post content, and how to delete it.
 * The key's own shape decides (card R2DEL, 2026-11-15):
 * - content-addressed (`.../<sha256>.<ext>`, r2.ts isContentAddressedKey -- e.g. the video workbench's
 *   video/workbench/<org>/<sha>.mp4): ONE object, shared by every row with the same bytes. Never a folder: its folder
 *   is everything the organization ever made (deleting it erased other videos, images and covers).
 * - `video/<dir>/<format>.mp4` (one folder per video): every format shares the folder, so the folder is the reference
 *   and the whole folder is deleted.
 * - any other known prefix: the key itself, in the bucket its prefix belongs to.
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
  const raw = dec(objectKey);
  if (raw && isContentAddressedKey(raw) && raw.startsWith("video/") && !raw.includes("..")) {
    return { bucket: "video", prefixDelete: false, search: both(raw.slice(raw.lastIndexOf("/") + 1)), match: both(raw) };
  }
  const v = /^video\/(.+)\/[^/]+\.mp4$/.exec(objectKey);
  if (v) {
    const dir = dec(v[1]);
    if (!dir) return null;
    const dirs = [...new Set([dir, encodeURIComponent(dir)])];
    // videorev/<dir>/: caption-reburn versions (V4.8) of the same folder; a post may embed one of those URLs.
    return { bucket: "video", prefixDelete: true, search: dirs, match: dirs.flatMap((d) => [`video/${d}/`, `videorev/${d}/`]) };
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
  // Env clients and sites the site flow registered (their wp_sites row has no REST token: the bridge is the only way in).
  const bridges = await listBridgeClientsWithRegistered();
  for (const site of sites) {
    const bridge = bridges.find((b) => sameSite(b.baseUrl, site.url));
    if (bridge) {
      const r = await bridgeRead<{ ok?: boolean; references?: Array<{ id: number; type: string; status: string; link: string }> }>(
        "/asset-references",
        { match: target.match },
        { clientId: bridge.id },
      );
      if (r.ok) {
        if (r.value.ok !== true || !Array.isArray(r.value.references)) return { ok: false, error: `reference_scan_bad_response:${site.name}` };
        for (const x of r.value.references) {
          references.push({ site: site.name, type: String(x.type), id: Number(x.id), status: String(x.status), link: String(x.link ?? "") });
        }
        continue;
      }
      if ("error" in r && r.error !== "bridge_404") return { ok: false, error: `reference_scan_bridge:${r.error}:${site.name}` };
    }
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

/** Same WordPress install (woo.ts wpSiteKey): a staging install under a path of a bridge host is scanned as itself. */
function sameSite(a: string, b: string): boolean {
  const k = wpSiteKey(a);
  return k !== null && k === wpSiteKey(b);
}

/** Rows other than `exceptAssetIds` whose media_assets.object_key is this key (raw or percent-encoded); null = could not check. */
async function otherRowsUsing(key: string, exceptAssetIds: readonly string[]): Promise<number | null> {
  const db = getSupabaseWriteClient();
  if (!db) return null;
  const forms = [...new Set([key, key.split("/").map(encodeURIComponent).join("/")])];
  const { data, error } = await db.from("media_assets").select("id").in("object_key", forms).limit(exceptAssetIds.length + 1);
  if (error || !Array.isArray(data)) return null;
  return data.filter((r: { id: unknown }) => !exceptAssetIds.includes(String(r.id))).length;
}

/**
 * exceptAssetIds = the media_assets rows the caller is deleting with this object. A content-addressed object is shared by
 * every row with the same bytes: it is removed from R2 only when no OTHER row uses it (answer `kept: "shared"` otherwise,
 * so the caller still removes its own row). Without exceptAssetIds, or when the check cannot run, nothing is deleted.
 */
export async function deleteUnreferencedAsset(objectKey: string, opts: { exceptAssetIds?: readonly string[] } = {}): Promise<GuardedDelete> {
  const target = assetTarget(objectKey);
  if (!target) return { ok: false, error: "unsupported_object_key", message: `無法辨識的檔案位置，未刪除（${objectKey}）` };
  const raw = (() => { try { return decodeURIComponent(objectKey); } catch { return objectKey; } })();
  const shared = isContentAddressedKey(raw);
  // An upload of the same bytes writes the object first and its row after (workbench assets route): the object's own
  // last_modified is read before the reference check and again right before DELETE; any change = a re-upload is in
  // flight -> kept (Codex 2a61a510; R2's clock both times, never ours).
  const videoBucket = process.env.R2_VIDEO_BUCKET ?? "lobster-videos";
  const stamp = async (): Promise<string | null | undefined> => {   // ISO, null = gone, undefined = could not read
    const l = await r2ListObjects(videoBucket, raw, { timeoutMs: 15_000 });
    if ("error" in l) return undefined;
    const o = l.objects.find((x) => x.key === raw);
    return o ? (o.lastModified?.toISOString() ?? undefined) : null;
  };
  const before = shared ? await stamp() : null;
  if (shared && before === undefined) return { ok: false, error: "reference_check_failed", message: `無法確認檔案狀態，未刪除（${objectKey}）` };
  if (shared) {
    if (!opts.exceptAssetIds) return { ok: false, error: "reference_check_required", message: `共用檔案需指定要刪的資料列，未刪除（${objectKey}）` };
    const others = await otherRowsUsing(raw, opts.exceptAssetIds);
    if (others === null) return { ok: false, error: "reference_check_failed", message: `無法確認檔案是否仍被其他資料使用，未刪除（${objectKey}）` };
    if (others > 0) return { ok: true, deleted: 0, kept: "shared" };
  }
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
  if (shared) {
    if (before === null) return { ok: true, deleted: 0 };   // already gone
    const after = await stamp();
    if (after === undefined) return { ok: false, error: "reference_check_failed", message: `無法確認檔案狀態，未刪除（${objectKey}）` };
    if (after === null) return { ok: true, deleted: 0 };
    if (after !== before) return { ok: true, deleted: 0, kept: "shared" };
  }
  const r = target.prefixDelete
    ? await deleteVideoObjects(objectKey)
    : target.bucket === "designs"
      ? await deleteDesignObject(decodeURIComponent(objectKey))
      : await r2DeleteObject(videoBucket, decodeURIComponent(objectKey));
  if ("error" in r) return { ok: false, error: r.error, message: `R2 刪除失敗（${r.error}）` };
  // Residual window = one LIST->DELETE: a row registered in it now points at a deleted object. Say so loudly.
  if (shared && opts.exceptAssetIds && (await otherRowsUsing(raw, opts.exceptAssetIds)) !== 0)
    console.error(`[r2-delete-guard] ${raw} deleted while another row registered it meanwhile (or the recheck failed): re-upload needed`);
  return { ok: true, deleted: "deleted" in r ? (r as { deleted: number }).deleted : 1 };
}
