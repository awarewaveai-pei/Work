/**
 * Embedding a video in a WordPress post. Takes an identity instead of a Request, so the browser route and
 * the pipeline clock embed through the same code (AUTO_CONTENT I4). Kept apart from finalize.ts so the
 * embed route does not reach video-pipeline's product features.
 */
import { listAccessibleWpSites, resolveWpSite, type ResolvedWpSite } from "@/lib/content/wp-sites";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { publishToWordPress } from "@/lib/content/publish/wordpress-core";
import { bridgeClientForSite, listDraftPosts, readBridgePost, updateDraftPost } from "@/lib/payments/woo";
import {
  ensureDeliveryReceipt,
  claimDeliveryReceipt,
  mediaPersistenceEnabled,
  recordDeliveryReceipt,
  type DeliveryReceipt,
} from "@/lib/content/video/delivery-receipts";
import { coverForRelease } from "@/lib/content/video/cover";
import { requiredBlocksForSite } from "@/lib/content/brand-voice-store";

const attr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** What goes into the post for one video (card VD.8): with a cover, WordPress's own video block with it as the poster
 *  (the still shown before play); without one, the bare URL on its own line as before (WP autoembed). */
export function videoMarkup(videoUrl: string, posterUrl: string | null): string {
  if (!posterUrl) return videoUrl;
  return `<!-- wp:video -->\n<figure class="wp-block-video"><video controls poster="${attr(posterUrl)}" src="${attr(videoUrl)}"></video></figure>\n<!-- /wp:video -->`;
}

/** Whether a post already holds this video: as the bare URL (as before), or as the src of the video block where the url
 *  is attribute-escaped (`&` is `&amp;`), so a repeat of the content pipeline never embeds it twice. Only the block's
 *  src="..." counts in escaped form: a link to the same file elsewhere in the article is not the video (Codex 4f5f2286). */
export function alreadyEmbedded(content: string, videoUrl: string): boolean {
  return content.includes(videoUrl) || content.includes(` src="${attr(videoUrl)}"`);
}

export type EmbedResult =
  | { ok: true; postId: number; videoUrl: string; idempotent?: true; delivery?: DeliveryReceipt }
  | { ok: false; status: number; error: string }
  | { ok: false; blockedMode: string }; // caller answers blockedChangeResponse(mode)

/** WordPress statuses nobody outside wp-admin sees. Anything else (publish, future, private) is or becomes live on edit. */
const NOT_LIVE_STATUSES = ["draft", "pending"];

/** The delivery event for an article in WordPress status `status`: publish = published, future = scheduled, anything else
 *  (draft, pending, private, unknown) = drafted. */
export function deliveryEventForPostStatus(status: string | undefined): "published" | "scheduled" | "drafted" {
  return status === "publish" ? "published" : status === "future" ? "scheduled" : "drafted";
}

const DRAFT_ONLY_REFUSAL = "這篇文章已發布或已排程，嵌入會直接上線；請改用「建新草稿文章並嵌入」";
const BRIDGE_LIVE_REFUSAL = "這篇文章已發布或已排程；這個網站經 WP Bridge 只能改草稿或待審文章，影片沒有嵌入";

const CHANGED_SINCE_READ = "這篇草稿剛被別人改過，影片沒有嵌入；請重新整理後再按一次";

/**
 * One site, one channel (bridgeClientForSite, the same choice publishToWordPress makes): a bridge site is read and
 * written only through the plugin's signed /post/read + /draft/update, which refuses a live post itself and writes only
 * over the content read (sha256); REST only without a bridge.
 * Soulful 2026-11-18: the draft was made through the bridge, the embed went to /wp/v2 with a dead application password.
 */
type PostRead =
  | { ok: true; status: string; title: string; content: string; sha256?: string }
  | { ok: false; status: number; error: string; receipt: Record<string, unknown> };

/** A plugin older than 0.22.0 has no /draft routes: WordPress answers rest_no_route, which signedPost reports as bridge_404. */
function bridgeError(error: string): string {
  return error === "bridge_404" ? "這個網站的 WP Bridge 外掛版本太舊（需要 0.22.0 以上才能改草稿），請先更新外掛" : `bridge: ${error}`;
}

async function readPost(resolved: ResolvedWpSite, bridgeClient: string | null, postId: number): Promise<PostRead> {
  if (bridgeClient !== null) {
    const r = await readBridgePost(postId, bridgeClient);
    if (r.ok) return { ok: true, status: r.value.post_status, title: r.value.title, content: r.value.content ?? "", sha256: r.value.content_sha256 };
    const error = (r as { error: string }).error;   // strict:false: no narrowing on !ok
    const status = error === "post_not_found" ? 404 : 502;
    return { ok: false, status, error: bridgeError(error), receipt: { status, error } };
  }
  try {
    const getRes = await fetch(`${resolved.site.url.replace(/\/+$/, "")}/wp-json/wp/v2/posts/${postId}?context=edit`, {
      headers: { Authorization: resolved.authHeader },
      signal: AbortSignal.timeout(10_000),
    });
    if (!getRes.ok) {
      const e = await getRes.json().catch(() => ({})) as { message?: string };
      return { ok: false, status: getRes.status, error: e.message ?? `WP GET error ${getRes.status}`, receipt: { status: getRes.status, error: e.message } };
    }
    const post = await getRes.json() as { status?: string; content?: { raw?: string }; title?: { raw?: string; rendered?: string } };
    return { ok: true, status: String(post.status), title: post.title?.raw || post.title?.rendered || "", content: post.content?.raw ?? "" };
  } catch {
    return { ok: false, status: 502, error: "Failed to fetch post from WordPress", receipt: { error: "network" } };
  }
}

type PostWrite =
  | { ok: true }
  | { ok: false; status: number; error: string; receipt: Record<string, unknown> }
  | { ok: false; blockedMode: string; receipt: Record<string, unknown> };

async function writePost(
  resolved: ResolvedWpSite, bridgeClient: string | null, postId: number, content: string, readSha256: string,
  draftStatus: string | null, draftOnly: boolean, videoUrl: string,
): Promise<PostWrite> {
  if (bridgeClient !== null) {
    const r = await updateDraftPost(postId, content, readSha256, bridgeClient);
    // the plugin returns what WordPress saved: a save filter that dropped the video is a failed delivery, not a receipt (Codex 66c620ce F2)
    if (r.ok) {
      return alreadyEmbedded(r.value.content ?? "", videoUrl)
        ? { ok: true }
        : { ok: false, status: 502, error: "WordPress 儲存時把影片拿掉了，影片沒有嵌進文章", receipt: { status: 502, error: "video_not_saved" } };
    }
    const failed = r as { error: string; blockedMode?: string };   // strict:false
    if (failed.blockedMode !== undefined) return { ok: false, blockedMode: failed.blockedMode, receipt: { blockedMode: failed.blockedMode } };
    if (failed.error === "post_not_draft") {
      return { ok: false, status: 409, error: draftOnly ? DRAFT_ONLY_REFUSAL : BRIDGE_LIVE_REFUSAL, receipt: { refused: "not_draft" } };
    }
    if (failed.error === "content_changed") return { ok: false, status: 409, error: CHANGED_SINCE_READ, receipt: { refused: "content_changed" } };
    return { ok: false, status: 502, error: bridgeError(failed.error), receipt: { status: 502, error: failed.error } };
  }
  try {
    const patchRes = await fetch(`${resolved.site.url.replace(/\/+$/, "")}/wp-json/wp/v2/posts/${postId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: resolved.authHeader,
        "X-HTTP-Method-Override": "PUT",
      },
      // draftOnly sends the status it read: a post published between the GET and this write (WP has no
      // conditional update) goes back to that status instead of going live with the video (Codex 67aa39bb F1).
      body: JSON.stringify(draftStatus ? { content, status: draftStatus } : { content }),
      signal: AbortSignal.timeout(12_000),
    });
    const pj = await patchRes.json().catch(() => ({})) as { message?: string };
    if (!patchRes.ok) {
      return { ok: false, status: patchRes.status, error: pj.message ?? `WP PATCH error ${patchRes.status}`, receipt: { status: patchRes.status, error: pj.message } };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 502, error: "Failed to update post in WordPress", receipt: { error: "network" } };
  }
}

/** The article's status in WordPress now ("publish", "draft", ...), found from the edit URL a receipt kept (its site
 *  origin) and read through the site's one channel; null = cannot tell (site gone, no access, WordPress down). */
export async function readArticleStatus(identity: Request | { headers: Headers }, editUrl: string, postId: number): Promise<string | null> {
  try {
    // the receipt's editUrl is <site url>/wp-admin/post.php...: the site is the one whose url (path included) it starts with
    const { sites } = await listAccessibleWpSites(identity);
    const site = sites.filter((s) => editUrl.startsWith(s.url.replace(/\/+$/, "") + "/wp-admin/")).sort((a, b) => b.url.length - a.url.length)[0];
    const resolved = site ? await resolveWpSite(identity, site.id) : null;
    if (!resolved || !Number.isInteger(postId) || postId <= 0) return null;
    const read = await readPost(resolved, bridgeClientForSite(resolved.site.url), postId);
    return read.ok ? read.status : null;
  } catch {
    return null;
  }
}

/** The release page's draft picker: the site's newest not-live posts (draft, pending), through the site's one channel. */
export async function listNotLiveDrafts(
  resolved: ResolvedWpSite,
): Promise<{ ok: true; posts: Array<{ id: number; title: string; status: string; modified: string }> } | { ok: false; status: number; error: string }> {
  const name = (id: number, title: string | undefined) => title || `（無標題 #${id}）`;
  const bridgeClient = bridgeClientForSite(resolved.site.url);
  if (bridgeClient !== null) {
    const r = await listDraftPosts(bridgeClient);
    if (!r.ok) return { ok: false, status: 502, error: bridgeError((r as { error: string }).error) };
    return { ok: true, posts: (r.value.posts ?? []).map((p) => ({ id: p.id, title: name(p.id, p.title), status: p.status, modified: p.modified })) };
  }
  if (!resolved.token) return { ok: false, status: 404, error: "Site not found" };
  try {
    const res = await fetch(`${resolved.site.url.replace(/\/+$/, "")}/wp-json/wp/v2/posts?per_page=30&status=draft,pending&orderby=modified&order=desc&context=edit&_fields=id,title,status,modified`, {
      headers: { Authorization: resolved.authHeader }, signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, status: 502, error: `WordPress ${res.status}` };
    const rows = await res.json() as Array<{ id: number; title?: { raw?: string }; status: string; modified: string }>;
    return { ok: true, posts: rows.map((p) => ({ id: p.id, title: name(p.id, p.title?.raw), status: p.status, modified: p.modified })) };
  } catch {
    return { ok: false, status: 502, error: "Failed to reach WordPress" };
  }
}

/**
 * Fetches a WP post's content, replaces <!-- VIDEO_PLACEHOLDER --> with the video URL
 * (as a bare URL on its own line → WP autoembed renders it), and PATCHes the post back.
 *
 * Called by ContentStudio after video render completes (fire-and-forget polling loop).
 * The article was already pushed; this just patches the video into its placeholder slot.
 * An OrgAccessError from resolveWpSite propagates; the caller maps it.
 */
export async function embedVideoInPost(
  identity: Request | { headers: Headers },
  // draftOnly: refuse a post that is not a draft (the release page: nothing it does may put content live).
  // WP REST has no draft revision of a published post, so editing one is a live edit.
  input: { siteId: string; postId: number; videoUrl: string; releaseId?: string; variant?: string; once?: boolean; draftOnly?: boolean },
): Promise<EmbedResult> {
  // Normalized here, not only in the route: a blank siteId reaching resolveWpSite means "first accessible site".
  const siteId = input.siteId.trim();
  const videoUrl = input.videoUrl.trim();
  const postId = input.postId;
  const releaseId = (input.releaseId ?? "").trim();
  const variant = (input.variant ?? "").trim() || "default";

  // Required: this rewrites an existing post by id, so resolveWpSite's "first accessible site" fallback
  // would edit post N on whichever site happens to be first.
  if (!siteId) return { ok: false, status: 400, error: "siteId required" };
  if (!videoUrl) return { ok: false, status: 400, error: "videoUrl required" };
  if (!/^https:\/\//i.test(videoUrl)) return { ok: false, status: 400, error: "videoUrl must start with https://" };
  if (!Number.isInteger(postId) || postId <= 0) return { ok: false, status: 400, error: "postId must be a positive integer" };
  if (releaseId && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(releaseId)) {
    return { ok: false, status: 400, error: "releaseId must be a UUID" };
  }
  if (variant.length > 64) return { ok: false, status: 400, error: "variant too long" };

  // Resolve site auth
  const resolved = await resolveWpSite(identity, siteId);
  if (!resolved) return { ok: false, status: 404, error: "Site not found" };
  const bridgeClient = bridgeClientForSite(resolved.site.url);
  if (bridgeClient === null && !resolved.token) return { ok: false, status: 503, error: "No token for site" };

  const gate = await checkProductionChangeAllowed(getSupabaseWriteClient(), resolved.site.organizationId);
  if (!gate.allowed) {
    return { ok: false, blockedMode: gate.mode };
  }

  let receipt: DeliveryReceipt | null = null;
  if (releaseId && mediaPersistenceEnabled()) {
    const organizationId = resolved.site.organizationId;
    if (!organizationId) {
      return { ok: false, status: 422, error: "WordPress site is not linked to an organization" };
    }
    try {
      receipt = await ensureDeliveryReceipt({
        organizationId,
        releaseId,
        destination: "wordpress",
        variant: `${variant}:post-${postId}`,
      });
      if (receipt) {
        const claim = await claimDeliveryReceipt(receipt);
        if (claim && !claim.claimed) {
          return { ok: true, idempotent: true, postId, videoUrl, delivery: claim.receipt };
        }
        if (claim) receipt = claim.receipt;
      }
    } catch (err) {
      return { ok: false, status: 503, error: err instanceof Error ? err.message : "failed to reserve delivery receipt" };
    }
  }
  const markReceipt = async (ok: boolean, externalId?: string, response?: Record<string, unknown>, postStatus?: string) => {
    if (!receipt) return;
    try {
      if (!ok) {
        await recordDeliveryReceipt(receipt, { type: "failed" }, response);
        return;
      }
      // The receipt says what the article is: only a live post is "published" (a draft recorded as published made the
      // delivery list and the outcome webhook treat it as public).
      await recordDeliveryReceipt(receipt, { type: deliveryEventForPostStatus(postStatus), externalId: externalId ?? String(postId) }, { ...response, postStatus });
    } catch (err) {
      console.error("[video/embed-to-wp] receipt persistence failed", err);
    }
  };

  // Fetch current post content
  const read = await readPost(resolved, bridgeClient, postId);
  if (!read.ok) {
    const failed = read as Extract<PostRead, { ok: false }>;   // strict:false: no narrowing on !ok
    await markReceipt(false, undefined, { phase: "fetch", ...failed.receipt });
    return { ok: false, status: failed.status, error: failed.error };
  }
  const postTitle = read.title || "文章 #" + postId;
  if (input.draftOnly && !NOT_LIVE_STATUSES.includes(read.status)) {
    await markReceipt(false, undefined, { phase: "fetch", refused: "not_draft", postStatus: read.status });
    return { ok: false, status: 409, error: DRAFT_ONLY_REFUSAL };
  }
  const draftStatus = input.draftOnly ? read.status : null;   // draftOnly: the not-live status read, written back with the content
  let currentContent = read.content;

  // once: a caller that may repeat after a crash (the content pipeline) must not append the same video twice
  if (input.once && alreadyEmbedded(currentContent, videoUrl)) return { ok: true, postId, videoUrl };
  // the bridge changes only not-live posts (DraftPostEditor refuses the rest too); said here, before any write
  if (bridgeClient !== null && !NOT_LIVE_STATUSES.includes(read.status)) {
    await markReceipt(false, undefined, { phase: "fetch", refused: "not_draft", postStatus: read.status });
    return { ok: false, status: 409, error: BRIDGE_LIVE_REFUSAL };
  }
  // VD.8: the Release's chosen cover as the poster, looked up by the server from the Release (never a url from the
  // client). A failed lookup embeds without a poster: the cover is optional, the delivery is not.
  let poster: string | null = null;
  const posterDb = releaseId && resolved.site.organizationId ? getSupabaseWriteClient() : null;
  if (posterDb) {
    try { poster = await coverForRelease(posterDb, resolved.site.organizationId as string, releaseId, videoUrl); }
    catch (err) { console.error("[video/embed-to-wp] cover lookup failed; embedding without a poster", err); }
  }
  const markup = videoMarkup(videoUrl, poster);
  if (!currentContent.includes("<!-- VIDEO_PLACEHOLDER -->")) {
    // Placeholder not found — append video at end instead of failing
    currentContent = currentContent.trimEnd() + `\n\n${markup}\n`;
  } else {
    // Replace ALL placeholders with the video (bare URL: WP autoembed; with a cover: the video block).
    // Global regex + function replacer: replaces every occurrence (not just the first) AND prevents
    // $ in the URL being interpreted as a replacement pattern. The needle has no regex-special chars.
    currentContent = currentContent.replace(/<!-- VIDEO_PLACEHOLDER -->/g, () => markup);
  }

  // PATCH the post content back
  const written = await writePost(resolved, bridgeClient, postId, currentContent, read.sha256 ?? "", draftStatus, input.draftOnly === true, videoUrl);
  if (!written.ok) {
    const failed = written as Exclude<PostWrite, { ok: true }>;   // strict:false
    await markReceipt(false, undefined, { phase: "patch", ...failed.receipt });
    if ("blockedMode" in failed) return { ok: false, blockedMode: failed.blockedMode };
    return { ok: false, status: failed.status, error: failed.error };
  }

  await markReceipt(true, String(postId), { postId, videoUrl, postTitle, editUrl: resolved.site.url.replace(/\/$/, "") + "/wp-admin/post.php?post=" + postId + "&action=edit" }, read.status);
  return { ok: true, postId, videoUrl };
}

export type NewDraftEmbedResult = (Extract<EmbedResult, { ok: true }> & { editUrl?: string }) | Exclude<EmbedResult, { ok: true }>;

/**
 * Create a new WordPress draft and embed the video in it. The draft goes through the one existing post-creation path,
 * publishToWordPress (wp-bridge signed /post on the bridge site, standard REST elsewhere), with publishStatus "draft";
 * the embed then runs draftOnly on that post, so this can never put anything live.
 */
export async function embedVideoInNewDraft(
  identity: Request | { headers: Headers },
  input: { siteId: string; title: string; intro?: string; videoUrl: string; releaseId?: string; variant?: string },
): Promise<NewDraftEmbedResult> {
  const siteId = input.siteId.trim();
  const title = input.title.replace(/[\r\n#]+/g, " ").trim().slice(0, 200);
  const intro = (input.intro ?? "").trim().slice(0, 2000);
  // Checked before the draft exists: publishToWordPress treats a blank siteId as "first accessible site",
  // and a bad video URL would leave an empty draft behind.
  if (!siteId) return { ok: false, status: 400, error: "siteId required" };
  if (!title) return { ok: false, status: 400, error: "title required" };
  if (!/^https:\/\//i.test(input.videoUrl.trim())) return { ok: false, status: 400, error: "videoUrl must start with https://" };

  // N1b / SOP B2: the site's must-carry paragraphs (disclaimer, crisis line) go into the draft from the start. Read before
  // the draft exists: a failed read makes nothing, rather than a draft that silently lacks them.
  let required: string[];
  try { required = await requiredBlocksForSite(siteId); }
  catch (err) {
    console.error("[video/embed-new-draft] required blocks read failed; no draft made", err);
    return { ok: false, status: 500, error: "讀不到網站的必附段落設定，沒有建立草稿；請稍後再試" };
  }
  const body = [intro || title, ...required].join("\n\n");
  const created = await publishToWordPress({ siteId, markdown: `# ${title}\n\n${body}\n`, publishStatus: "draft" }, identity);
  if (!created.ok) {
    const failed = created as { status: number; error: string; mode?: string };   // strict:false: no narrowing on !ok
    return failed.mode !== undefined ? { ok: false, blockedMode: failed.mode } : { ok: false, status: failed.status, error: failed.error };
  }
  if (!created.post_id) return { ok: false, status: 502, error: "WordPress did not return the new draft's id" };
  const embedded = await embedVideoInPost(identity, { siteId, postId: created.post_id, videoUrl: input.videoUrl, releaseId: input.releaseId, variant: input.variant, draftOnly: true });
  if (embedded.ok) return { ...embedded, editUrl: created.edit_url };
  // the draft exists without the video: say which one, so a retry embeds into it instead of making another (Codex c9fa41ed F2)
  if ("blockedMode" in embedded) return embedded;
  const failed = embedded as { status: number; error: string };   // strict:false: no narrowing
  return { ok: false, status: failed.status, error: `草稿 #${created.post_id} 已建立但影片沒嵌進去（${failed.error}）；請在下面的草稿清單選它再按「嵌入影片」` };
}
