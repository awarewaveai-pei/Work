/**
 * Embedding a video in a WordPress post. Takes an identity instead of a Request, so the browser route and
 * the pipeline clock embed through the same code (AUTO_CONTENT I4). Kept apart from finalize.ts so the
 * embed route does not reach video-pipeline's product features.
 */
import { resolveWpSite } from "@/lib/content/wp-sites";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { publishToWordPress } from "@/lib/content/publish/wordpress-core";
import {
  ensureDeliveryReceipt,
  claimDeliveryReceipt,
  mediaPersistenceEnabled,
  recordDeliveryReceipt,
  type DeliveryReceipt,
} from "@/lib/content/video/delivery-receipts";

export type EmbedResult =
  | { ok: true; postId: number; videoUrl: string; idempotent?: true; delivery?: DeliveryReceipt }
  | { ok: false; status: number; error: string }
  | { ok: false; blockedMode: string }; // caller answers blockedChangeResponse(mode)

/** WordPress statuses nobody outside wp-admin sees. Anything else (publish, future, private) is or becomes live on edit. */
const NOT_LIVE_STATUSES = ["draft", "pending"];

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
  if (!resolved.token) return { ok: false, status: 503, error: "No token for site" };

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
  const markReceipt = async (ok: boolean, externalId?: string, response?: Record<string, unknown>) => {
    if (!receipt) return;
    try {
      if (!ok) {
        await recordDeliveryReceipt(receipt, { type: "failed" }, response);
        return;
      }
      const drafted = await recordDeliveryReceipt(receipt, { type: "drafted", externalId: externalId ?? String(postId) }, response);
      if (drafted) await recordDeliveryReceipt(drafted, { type: "published", externalId: externalId ?? String(postId) }, response);
    } catch (err) {
      console.error("[video/embed-to-wp] receipt persistence failed", err);
    }
  };
  const authHdr = resolved.authHeader;
  const base = resolved.site.url.replace(/\/+$/, "");

  // Fetch current post content
  let currentContent = "";
  let draftStatus: string | null = null;   // draftOnly: the not-live status read, written back with the content
  try {
    const getRes = await fetch(`${base}/wp-json/wp/v2/posts/${postId}?context=edit`, {
      headers: { Authorization: authHdr },
      signal: AbortSignal.timeout(10_000),
    });
    if (!getRes.ok) {
      const e = await getRes.json().catch(() => ({})) as { message?: string };
      await markReceipt(false, undefined, { phase: "fetch", status: getRes.status, error: e.message });
      return { ok: false, status: getRes.status, error: e.message ?? `WP GET error ${getRes.status}` };
    }
    const post = await getRes.json() as { status?: string; content?: { raw?: string } };
    if (input.draftOnly && !NOT_LIVE_STATUSES.includes(String(post.status))) {
      await markReceipt(false, undefined, { phase: "fetch", refused: "not_draft", postStatus: post.status });
      return { ok: false, status: 409, error: "這篇文章已發布或已排程，嵌入會直接上線；請改用「建新草稿文章並嵌入」" };
    }
    if (input.draftOnly) draftStatus = String(post.status);
    currentContent = post.content?.raw ?? "";
  } catch {
    await markReceipt(false, undefined, { phase: "fetch", error: "network" });
    return { ok: false, status: 502, error: "Failed to fetch post from WordPress" };
  }

  // once: a caller that may repeat after a crash (the content pipeline) must not append the same video twice
  if (input.once && currentContent.includes(videoUrl)) return { ok: true, postId, videoUrl };
  if (!currentContent.includes("<!-- VIDEO_PLACEHOLDER -->")) {
    // Placeholder not found — append video at end instead of failing
    currentContent = currentContent.trimEnd() + `\n\n${videoUrl}\n`;
  } else {
    // Replace ALL placeholders with the bare video URL (WP autoembed → responsive iframe).
    // Global regex + function replacer: replaces every occurrence (not just the first) AND prevents
    // $ in the URL being interpreted as a replacement pattern. The needle has no regex-special chars.
    currentContent = currentContent.replace(/<!-- VIDEO_PLACEHOLDER -->/g, () => videoUrl);
  }

  // PATCH the post content back
  try {
    const patchRes = await fetch(`${base}/wp-json/wp/v2/posts/${postId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHdr,
        "X-HTTP-Method-Override": "PUT",
      },
      // draftOnly sends the status it read: a post published between the GET and this write (WP has no
      // conditional update) goes back to that status instead of going live with the video (Codex 67aa39bb F1).
      body: JSON.stringify(draftStatus ? { content: currentContent, status: draftStatus } : { content: currentContent }),
      signal: AbortSignal.timeout(12_000),
    });
    const pj = await patchRes.json().catch(() => ({})) as { message?: string };
    if (!patchRes.ok) {
      await markReceipt(false, undefined, { phase: "patch", status: patchRes.status, error: pj.message });
      return { ok: false, status: patchRes.status, error: pj.message ?? `WP PATCH error ${patchRes.status}` };
    }
  } catch {
    await markReceipt(false, undefined, { phase: "patch", error: "network" });
    return { ok: false, status: 502, error: "Failed to update post in WordPress" };
  }

  await markReceipt(true, String(postId), { postId, videoUrl });
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

  const created = await publishToWordPress({ siteId, markdown: `# ${title}\n\n${intro || title}\n`, publishStatus: "draft" }, identity);
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
