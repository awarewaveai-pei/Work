/**
 * wordpress-core.ts — 「一段邏輯、兩個入口」的 WordPress 發佈核心（純函式，無 HTTP 殼）。
 *
 * 這段邏輯原本內嵌在 `app/api/content/publish/route.ts` 的 POST。抽成純函式後：
 *   - route（給 UI）：解析 Request → 呼叫 publishToWordPress() → 包成 NextResponse
 *   - 積木（給 headless 編排）：`publish/wordpress` block 直接 in-process 呼叫同一個 core
 * 兩個入口、同一段邏輯、零重複。行為與原 route 完全相同（含 draft-first、Bridge↔REST 雙路徑）。
 *
 * 契約 SSOT：`lib/content/blocks/README.md`。本檔不做角色閘（role gate 屬 HTTP 殼，留在 route）；
 * 不依賴 `Request`/`NextResponse` → 可被任何 Node runtime 呼叫、可單獨測試、可整段移植。
 */
import { resolveWpSite, getWpSites, wpAuthHeader } from "@/lib/content/wp-sites";
import { OrgAccessError } from "@/lib/tenant-guard";
import { isBridgeConfigured, bridgeBaseUrl, createPost } from "@/lib/payments/woo";
import { markdownToBlocks } from "@/lib/content/markdown-to-blocks";
import { decodeWpEntities } from "@/lib/content/wp-entities";
import { normalizeManyForWp } from "@/lib/studio/wp-web-image";
import { isDesignsAsset } from "@/lib/storage/r2";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { BLOCKED_CHANGE_CODE } from "@/lib/system-modes/blocked-change";

/** 發佈輸入。欄位型別刻意保持 unknown（與原 route body 同形），coercion 在 core 內統一做 → route 與積木共用同一套寬鬆解析。 */
export interface WordPressPublishInput {
  markdown?: unknown;
  slug?: unknown;
  seoTitle?: unknown;
  metaDescription?: unknown;
  focusKeyword?: unknown;
  categories?: unknown;
  tags?: unknown;
  /** ISO 8601 datetime for scheduled posts. Used when publishStatus="future". */
  scheduleDate?: unknown;
  siteId?: unknown;
  featuredImageUrl?: unknown;
  featuredImageAlt?: unknown;
  internalLinkKeywords?: unknown;
  /** "draft" (default) | "publish" (immediate) | "future" (scheduled — requires scheduleDate). */
  publishStatus?: unknown;
}

export interface WordPressPublishSuccess {
  ok: true;
  post_id?: number;
  edit_url?: string;
  view_url?: string;      // 標準 REST 路徑回傳
  featured_set?: boolean; // Bridge 路徑回傳
}

export interface WordPressPublishFailure {
  ok: false;
  status: number;         // route 應使用的 HTTP 狀態碼
  error: string;          // 錯誤訊息
  /** 原 route 對此錯誤的序列化方式，保留以讓 HTTP 殼與舊行為位元相同。
   *  "text" = new NextResponse(error, {status})；"json" = NextResponse.json({ok:false,error},{status})。
   *  關鍵：單篇 UI 對 text 回應會 res.json() throw → 顯示「網路錯誤」（非真實訊息），這是現行行為，必須保留。 */
  wire: "text" | "json";
  /** Only set when the system-mode gate blocked the write (error = BLOCKED_CHANGE_CODE) -- the mode it read. */
  mode?: string;
}

export type WordPressPublishResult = WordPressPublishSuccess | WordPressPublishFailure;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(escapedUrl: string): string {
  const raw = escapedUrl
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  if (/^(https?:|mailto:)/i.test(raw)) {
    try {
      const u = new URL(raw);
      return ["http:", "https:", "mailto:"].includes(u.protocol) ? escapeHtml(raw) : "#";
    } catch { return "#"; }
  }
  if (/^[/#]/.test(raw)) return escapeHtml(raw);
  return "#";
}

function inline(s: string): string {
  const e = escapeHtml(s);
  return e
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, (_m, c) => `<strong>${c}</strong>`)
    .replace(/\*([^*]+)\*/g, (_m, c) => `<em>${c}</em>`)
    // Links only — negative lookbehind so image syntax ![ is not treated as a link
    .replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) =>
      `<a href="${safeUrl(url)}">${text}</a>`
    );
}

/** A standalone YouTube watch/share/embed/shorts URL — emitted bare so WP autoembed (priority 8,
 *  before wpautop) fetches oEmbed and renders the responsive iframe. Byte-identical to the copy in
 *  lib/content/markdown-to-blocks.ts; both stay in lockstep with ContentStudio.canonicalYouTube(). */
function isYouTubeUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)[\w-]{11}/i.test(url);
}

function markdownToHtml(md: string): string {
  // Strip meta block before converting
  const clean = md
    .replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "")
    // Drop any UNRESOLVED YouTube placeholder, even if emitted inline (defense-in-depth so a stray
    // "[YOUTUBE_PLACEHOLDER_N: ...]" cue never reaches a live post). Resolved ones are already bare
    // watch URLs by now and don't match. (critic 2026-06-15 Major)
    .replace(/\[YOUTUBE_PLACEHOLDER_\d+:[^\]]*\]/g, "")
    // #6 — strip only INLINE Kadence-pattern leftovers; a standalone-line placeholder is converted
    // to a wp:block reference in the main loop below.
    .replace(/(?<=\S)[ \t]*\[KADENCE_PATTERN:\s*\d+\s*\]/gi, "")
    .replace(/\[KADENCE_PATTERN:\s*\d+\s*\][ \t]*(?=\S)/gi, "")
    .trim();

  const lines = clean.split("\n");
  const out: string[] = [];
  let inList = false;
  let inOl = false;
  let inTable = false;
  let tableHasHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table rows
    if (line.trim().startsWith("|")) {
      if (!inTable) { out.push("<table>"); inTable = true; tableHasHeader = false; }
      if (/^\|[\s\-|:]+\|$/.test(line.trim())) continue; // separator row
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      if (!tableHasHeader) {
        out.push("<thead><tr>" + cells.map(c => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>");
        tableHasHeader = true;
      } else {
        out.push("<tr>" + cells.map(c => `<td>${inline(c)}</td>`).join("") + "</tr>");
      }
      continue;
    }
    if (inTable) { out.push("</tbody></table>"); inTable = false; tableHasHeader = false; }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.replace(/^[-*+]\s/, ""))}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push(`<li>${inline(olMatch[1])}</li>`);
      continue;
    }
    if (inOl) { out.push("</ol>"); inOl = false; }

    // Headings
    const h6 = line.match(/^######\s+(.*)/); if (h6) { out.push(`<h6>${inline(h6[1])}</h6>`); continue; }
    const h5 = line.match(/^#####\s+(.*)/);  if (h5) { out.push(`<h5>${inline(h5[1])}</h5>`); continue; }
    const h4 = line.match(/^####\s+(.*)/);   if (h4) { out.push(`<h4>${inline(h4[1])}</h4>`); continue; }
    const h3 = line.match(/^###\s+(.*)/);    if (h3) { out.push(`<h3>${inline(h3[1])}</h3>`); continue; }
    const h2 = line.match(/^##\s+(.*)/);     if (h2) { out.push(`<h2>${inline(h2[1])}</h2>`); continue; }
    // H1 is already used as post_title — never emit it into body content (avoids duplicate H1 with WP title).
    const h1 = line.match(/^#\s+(.*)/);      if (h1) { continue; }

    // Blockquote
    if (line.startsWith("> ")) {
      out.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`);
      continue;
    }

    // #6 — Kadence synced pattern placeholder alone on its line → Gutenberg synced-pattern reference.
    // Even on the REST/HTML path, post_content carrying a <!-- wp:block {"ref":id} /--> comment is
    // parsed and rendered by the block engine, so the brand-designed funnel pattern displays live.
    const patMatch = line.trim().match(/^\[KADENCE_PATTERN:\s*(\d+)\s*\]$/i);
    if (patMatch) {
      const ref = parseInt(patMatch[1], 10);
      if (ref > 0) out.push(`<!-- wp:block {"ref":${ref}} /-->`);
      continue;
    }

    // Standalone YouTube URL → emit bare on its own line so WP autoembed renders the iframe.
    // (Resolved placeholder lands here once ContentStudio swaps in the canonical watch URL;
    //  unresolved placeholders were already scrubbed during preprocessing above.)
    if (isYouTubeUrl(line.trim())) {
      out.push(line.trim());
      continue;
    }

    // Standalone images (full-line image syntax)
    const imgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const [, alt, url] = imgMatch;
      const safeImgUrl = /^https?:\/\//.test(url.trim()) ? escapeHtml(url.trim()) : "";
      if (safeImgUrl) {
        out.push(`<figure><img src="${safeImgUrl}" alt="${escapeHtml(alt)}" style="max-width:100%;height:auto;" /></figure>`);
      }
      continue;
    }

    // HTML comments — only pure comment lines (NEEDS_BRAND_VERIFY etc.). Defense-in-depth: never
    // emit internal generation markers into the live post even if upstream stripping missed one.
    if (/^<!--.*-->$/.test(line.trim())) {
      if (/<!--\s*GENERATION_(?:TRUNCATED|ERROR):/.test(line)) continue;
      out.push(line.trim());
      continue;
    }

    // Empty line
    if (!line.trim()) { out.push(""); continue; }

    out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  if (inOl) out.push("</ol>");
  if (inTable) out.push("</tbody></table>");
  return out.join("\n");
}

function extractH1(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim() ?? "";
}

function extractExcerpt(md: string): string {
  const clean = md
    .replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")  // non-greedy: handles comments containing >
    .trim();
  // Prefer ## Quick Answer section (lookahead anchored to line-start headings)
  const qaMatch = clean.match(/##\s+Quick Answer\s*\n([\s\S]+?)(?=\n#{1,6}\s|$)/);
  let source: string;
  if (qaMatch) {
    source = qaMatch[1];
  } else {
    // First non-heading, non-empty paragraph
    source = clean
      .split(/\n{2,}/)
      .map(b => b.trim())
      .find(b => b.length > 30 && !/^#{1,6}\s/.test(b) && !/^<!--/.test(b) && !/^\[/.test(b) && !/^!/.test(b))
      ?? "";
  }
  return source
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")     // only strip # at line start (preserves C#, F#)
    .replace(/[`*_~>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

/** Resolve WP term names → IDs; creates missing terms. Returns empty array on auth/network errors. */
async function resolveTermIds(
  names: string[],
  taxonomy: "categories" | "tags",
  authHeader: string,
  base: string,
): Promise<number[]> {
  const ids: number[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    try {
      // Search for existing term first
      const searchRes = await fetch(
        `${base}/wp-json/wp/v2/${taxonomy}?search=${encodeURIComponent(name)}&per_page=10`,
        { headers: { Authorization: authHeader } },
      );
      if (searchRes.ok) {
        const terms = await searchRes.json() as Array<{ id: number; name: string }>;
        // Decode WP's entity-encoded term name before comparing: the AI is now shown decoded category
        // names (#3, via decodeWpEntities), so a category like "Health – Wellness" arrives here as the
        // decoded form while WP REST returns t.name encoded ("Health &#8211; Wellness"). Without decoding
        // both sides, the exact-match misses and a DUPLICATE term is created — the very bug #3 targets,
        // surviving on the standard-REST path (critic 2026-06-16 Major). decodeWpEntities is idempotent
        // on already-plain names, so this is safe for entity-free names too.
        const match = terms.find(t => decodeWpEntities(t.name).toLowerCase() === name.toLowerCase());
        if (match) { ids.push(match.id); continue; }
      }
      // Create term
      const createRes = await fetch(`${base}/wp-json/wp/v2/${taxonomy}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ name }),
      });
      if (createRes.ok) {
        const term = await createRes.json() as { id?: number };
        if (term.id) ids.push(term.id);
      }
    } catch { /* skip this term */ }
  }
  return ids;
}

/**
 * 發佈一篇 markdown 文章到 WordPress（draft-first；Bridge 站走簽章 /post，其餘走標準 REST）。
 * 行為與原 `app/api/content/publish/route.ts` POST 完全相同，唯一差別是回傳結構化結果而非 NextResponse。
 */
export async function publishToWordPress(
  body: WordPressPublishInput,
  /**
   * 呼叫者的身分來源（**必填**，2026-08-26）。這條路徑會**發文到指定的站**，而 `body.siteId`
   * 完全由呼叫端給定 —— 沒有身分就沒有東西可以驗，等於任何過了角色閘的人都能發到任一客戶站。
   * 做成必填而非選填：選填參數漏傳時會靜默退回舊的不安全行為，編譯器不會說話。
   */
  req: Request | { headers: Headers },
): Promise<WordPressPublishResult> {
  // Resolve target site: use siteId if provided, otherwise fall back to env vars
  const siteId = typeof body.siteId === "string" ? body.siteId.trim() : "";
  let wpApiUrl: string | undefined;
  let wpToken: string | undefined;
  let wpUsername = "";
  let organizationId: string | null = null;

  const { sites } = await getWpSites();
  if (siteId || sites.length > 0) {
    // 指定站 → 驗租戶；未指定 → 取「呼叫者有權存取的第一個」（staff 等同舊的 sites[0]）
    let resolved;
    try {
      resolved = await resolveWpSite(req, siteId);
    } catch (e) {
      if (e instanceof OrgAccessError) {
        return { ok: false, status: 403, error: e.message, wire: "text" };
      }
      throw e;
    }
    if (!resolved) {
      return { ok: false, status: 400, error: siteId ? `Site '${siteId}' not found` : "No accessible site", wire: "text" };
    }
    wpApiUrl   = resolved.site.url;
    wpToken    = resolved.token || undefined;
    wpUsername = resolved.username;
    organizationId = resolved.site.organizationId;
  } else {
    // Last-resort legacy env vars (single-site deployments without WP_SITE_i_* scheme) --
    // no DB row, so no org: organizationId stays null (only the global mode applies).
    wpApiUrl = process.env.WP_API_URL;
    wpToken  = process.env.WORDPRESS_JWT_TOKEN;
  }

  if (!wpApiUrl || !wpToken) {
    return { ok: false, status: 503, error: "WP_API_URL or WORDPRESS_JWT_TOKEN not configured", wire: "text" };
  }

  const markdown = (typeof body.markdown === "string" ? body.markdown : "").trim();
  if (!markdown) return { ok: false, status: 400, error: "markdown required", wire: "text" };

  // Site resolved + input validated -- gate before any write to it (term creation and the draft on
  // the standard-REST path, the signed /post on the Bridge path; bridgePost gates again on its own org).
  const gate = await checkProductionChangeAllowed(getSupabaseWriteClient(), organizationId);
  if (!gate.allowed) {
    return { ok: false, status: 423, error: BLOCKED_CHANGE_CODE, wire: "json", mode: gate.mode };
  }

  // Resolve publish status. Bridge only supports "draft"/"publish" (no scheduled posts yet).
  const rawStatus = typeof body.publishStatus === "string" ? body.publishStatus.trim() : "draft";
  const publishStatus: "draft" | "publish" | "future" =
    rawStatus === "publish" ? "publish" : rawStatus === "future" ? "future" : "draft";

  const h1 = extractH1(markdown);
  const seoTitle = typeof body.seoTitle === "string" ? body.seoTitle.trim() : "";
  const title = seoTitle || h1 || "Untitled Article";
  const slug = (typeof body.slug === "string" ? body.slug.trim() : "") || slugify(h1 || "article");

  const base = wpApiUrl.replace(/\/+$/, "");
  const excerpt = extractExcerpt(markdown);

  // Category + tag names — shared by the Bridge path and the standard-REST path.
  const catNames = (Array.isArray(body.categories) ? body.categories : [])
    .map(c => String(c).trim()).filter(Boolean);
  const tagNames = (Array.isArray(body.tags) ? body.tags : [])
    .map(t => String(t).trim()).filter(Boolean);

  // ── WP Bridge path ───────────────────────────────────────────────────────
  // When the target site IS the configured bridge site, route through the signed /post endpoint:
  // the plugin composes real Kadence blocks, sideloads in-article images into the media library,
  // and persists Rank Math SEO meta server-side (standard WP REST silently drops the unregistered
  // rank_math_focus_keyword meta). Gate on a hostname match so an article for a NON-bridge site is
  // never mis-published to the bridge site; non-bridge sites keep the standard-REST path below.
  const bridgeBase = isBridgeConfigured() ? bridgeBaseUrl() : null;
  let bridgeHostMatch = false;
  if (bridgeBase) {
    try { bridgeHostMatch = new URL(bridgeBase).host === new URL(base).host; } catch { bridgeHostMatch = false; }
  }
  if (bridgeHostMatch) {
    // Bridge supports "draft" and "publish". Scheduled posts ("future") require the WP date field
    // which the plugin's PostCreator does not yet support → fall through to standard-REST for those.
    if (publishStatus === "future") {
      return {
        ok: false,
        status: 400,
        error: "排程發佈尚不支援此站台（Bridge 路徑）。請使用「直接發佈」或改用標準 WP REST 站台。",
        wire: "json",
      };
    }
    const blocks = markdownToBlocks(markdown);
    if (blocks.length === 0) return { ok: false, status: 400, error: "no publishable content", wire: "text" };
    const seo: { focus_keyword?: string; description?: string; title?: string } = {};
    if (typeof body.focusKeyword === "string" && body.focusKeyword.trim()) seo.focus_keyword = body.focusKeyword.trim();
    if (typeof body.metaDescription === "string" && body.metaDescription.trim()) seo.description = body.metaDescription.trim();
    if (seoTitle) seo.title = seoTitle;
    // Issue 四: a dedicated hero image generated at generation time → plugin sideloads + sets as
    // featured (best-effort). Issue 七: focus keyword (+ related terms) → ILJ ilj_linkdefinition meta.
    const heroRaw =
      typeof body.featuredImageUrl === "string" && body.featuredImageUrl.trim() ? body.featuredImageUrl.trim() : undefined;
    // Operator invariant: every image the bridge sideloads into WP is WebP ≤150KB. Bake display
    // derivatives (in-article image blocks + hero) on our sharp infra BEFORE the bridge sideloads them;
    // the R2 designs/ masters are untouched. Per-image failure → keep the original URL (logged), never
    // block the publish. Mirrors the POD path (app/api/tools/publish/route.ts `create`).
    //
    // Only normalise OUR generated assets (R2 designs bucket, host-checked) — never fetch arbitrary
    // in-article URLs server-side (SSRF) and never re-host an author's externally hot-linked image.
    // External URLs pass through unchanged (the bridge sideloads them as before, same as pre-change).
    const articleImageUrls = new Set<string>();
    for (const b of blocks) if (b.type === "image" && isDesignsAsset(b.url)) articleImageUrls.add(b.url);
    if (isDesignsAsset(heroRaw)) articleImageUrls.add(heroRaw);
    const articleWebMap = await normalizeManyForWp(articleImageUrls);
    for (const b of blocks) if (b.type === "image" && b.url) b.url = articleWebMap.get(b.url) ?? b.url;
    const featuredImageUrl = heroRaw ? articleWebMap.get(heroRaw) ?? heroRaw : undefined;
    const featuredImageAlt =
      typeof body.featuredImageAlt === "string" && body.featuredImageAlt.trim() ? body.featuredImageAlt.trim() : undefined;
    const internalLinkKeywords = (Array.isArray(body.internalLinkKeywords) ? body.internalLinkKeywords : [])
      .map(k => String(k).trim()).filter(Boolean);
    const result = await createPost({
      title,
      blocks,
      status: publishStatus === "publish" ? "publish" : "draft",
      excerpt,
      categories: catNames,
      tags: tagNames,
      seo: Object.keys(seo).length > 0 ? seo : undefined,
      featured_image_url: featuredImageUrl,
      featured_image_alt: featuredImageAlt,
      internal_link_keywords: internalLinkKeywords.length > 0 ? internalLinkKeywords : undefined,
    });
    if (!result.ok) {
      // tsconfig has strict:false → discriminated-union narrowing via `!result.ok` does not
      // expose `.error`; cast to the error arm (same idiom as app/api/tools/publish/route.ts:292).
      const failed = result as { ok: false; error: string; blockedMode?: string };
      if (failed.blockedMode !== undefined) {
        return { ok: false, status: 423, error: BLOCKED_CHANGE_CODE, wire: "json", mode: failed.blockedMode };
      }
      return { ok: false, status: 502, error: `bridge: ${failed.error}`, wire: "json" };
    }
    const v = result.value;
    return { ok: true, post_id: v.post_id, edit_url: v.edit_url, featured_set: v.featured_set };
  }

  // ── Standard WP REST path (non-bridge sites) ──────────────────────────────
  const content = markdownToHtml(markdown);
  const endpoint = `${base}/wp-json/wp/v2/posts`;

  // For "future" status, WP requires status="future" + date field (ISO 8601).
  // Without a valid date, fall back to "draft" to avoid a WP 400 error.
  const scheduleDate = typeof body.scheduleDate === "string" ? body.scheduleDate.trim() : "";
  const resolvedStatus =
    publishStatus === "future" && scheduleDate ? "future" :
    publishStatus === "publish" ? "publish" : "draft";

  const payload: Record<string, unknown> = {
    title,
    content,
    slug,
    excerpt,
    status: resolvedStatus,
  };

  // Resolve category + tag names → WP term IDs
  const authHdr = wpAuthHeader(wpUsername, wpToken);
  if (catNames.length > 0) {
    const catIds = await resolveTermIds(catNames, "categories", authHdr, base);
    if (catIds.length > 0) payload.categories = catIds;
  }
  if (tagNames.length > 0) {
    const tagIds = await resolveTermIds(tagNames, "tags", authHdr, base);
    if (tagIds.length > 0) payload.tags = tagIds;
  }

  if (scheduleDate && resolvedStatus === "future") {
    payload.date = scheduleDate;
  }

  const metaPayload: Record<string, string> = {};
  if (typeof body.metaDescription === "string" && body.metaDescription.trim()) {
    metaPayload._yoast_wpseo_metadesc = body.metaDescription.trim();
    metaPayload.rank_math_description  = body.metaDescription.trim();
  }
  if (typeof body.seoTitle === "string" && body.seoTitle.trim()) {
    metaPayload.rank_math_title = body.seoTitle.trim();
  }
  if (typeof body.focusKeyword === "string" && body.focusKeyword.trim()) {
    metaPayload.rank_math_focus_keyword = body.focusKeyword.trim();
  }
  if (Object.keys(metaPayload).length > 0) {
    payload.meta = metaPayload;
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHdr,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, status: 502, error: "WordPress connection failed", wire: "json" };
  }

  let json: unknown;
  try { json = await res.json(); } catch { json = {}; }

  if (!res.ok) {
    const msg =
      typeof json === "object" && json !== null && "message" in json
        ? String((json as { message: unknown }).message).slice(0, 200)
        : `WP error ${res.status}`;
    return { ok: false, status: res.status, error: msg, wire: "json" };
  }

  const post = json as { id?: number; link?: string };
  const editUrl = post.id ? `${base}/wp-admin/post.php?post=${post.id}&action=edit` : undefined;

  return { ok: true, post_id: post.id, edit_url: editUrl, view_url: post.link };
}
