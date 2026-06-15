import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getWpSites, wpAuthHeader } from "@/lib/content/wp-sites";
import { isBridgeConfigured, bridgeBaseUrl, createPost } from "@/lib/studio/wp-bridge-client";
import { markdownToBlocks } from "@/lib/content/markdown-to-blocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function markdownToHtml(md: string): string {
  // Strip meta block before converting
  const clean = md
    .replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "")
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
    const h1 = line.match(/^#\s+(.*)/);      if (h1) { out.push(`<h1>${inline(h1[1])}</h1>`); continue; }

    // Blockquote
    if (line.startsWith("> ")) {
      out.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`);
      continue;
    }

    // YouTube placeholder — [YOUTUBE_PLACEHOLDER_N: search query]
    const ytMatch = line.trim().match(/^\[YOUTUBE_PLACEHOLDER_(\d+):\s*(.+)\]$/);
    if (ytMatch) {
      const [, n, query] = ytMatch;
      out.push(
        `<div class="youtube-placeholder" data-query="${escapeHtml(query.trim())}" style="padding:24px;background:#f8f8f8;border:2px dashed #ccc;text-align:center;margin:16px 0;">` +
        `🎬 YouTube #${n}：${escapeHtml(query.trim())}` +
        `</div>`
      );
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

    // HTML comments — only pure comment lines (NEEDS_BRAND_VERIFY etc.)
    if (/^<!--.*-->$/.test(line.trim())) { out.push(line.trim()); continue; }

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
        const match = terms.find(t => t.name.toLowerCase() === name.toLowerCase());
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

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: {
    markdown?: unknown;
    slug?: unknown;
    seoTitle?: unknown;
    metaDescription?: unknown;
    focusKeyword?: unknown;
    categories?: unknown;
    tags?: unknown;
    scheduleDate?: unknown;
    siteId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  // Resolve target site: use siteId if provided, otherwise fall back to env vars
  const siteId = typeof body.siteId === "string" ? body.siteId.trim() : "";
  let wpApiUrl: string | undefined;
  let wpToken: string | undefined;
  let wpUsername = "";

  const { sites, tokens, usernames } = await getWpSites();
  if (siteId) {
    const site = sites.find(s => s.id === siteId);
    if (!site) return new NextResponse(`Site '${siteId}' not found`, { status: 400 });
    wpApiUrl   = site.url;
    wpToken    = tokens[siteId];
    wpUsername = usernames[siteId] ?? "";
  } else if (sites.length > 0) {
    // No explicit siteId — fall back to first available site (DB or env)
    const site = sites[0];
    wpApiUrl   = site.url;
    wpToken    = tokens[site.id];
    wpUsername = usernames[site.id] ?? "";
  } else {
    // Last-resort legacy env vars (single-site deployments without WP_SITE_i_* scheme)
    wpApiUrl = process.env.WP_API_URL;
    wpToken  = process.env.WORDPRESS_JWT_TOKEN;
  }

  if (!wpApiUrl || !wpToken) {
    return new NextResponse("WP_API_URL or WORDPRESS_JWT_TOKEN not configured", { status: 503 });
  }

  const markdown = (typeof body.markdown === "string" ? body.markdown : "").trim();
  if (!markdown) return new NextResponse("markdown required", { status: 400 });

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
    const blocks = markdownToBlocks(markdown);
    if (blocks.length === 0) return new NextResponse("no publishable content", { status: 400 });
    const seo: { focus_keyword?: string; description?: string; title?: string } = {};
    if (typeof body.focusKeyword === "string" && body.focusKeyword.trim()) seo.focus_keyword = body.focusKeyword.trim();
    if (typeof body.metaDescription === "string" && body.metaDescription.trim()) seo.description = body.metaDescription.trim();
    if (seoTitle) seo.title = seoTitle;
    const result = await createPost({
      title,
      blocks,
      status: "draft",
      excerpt,
      categories: catNames,
      tags: tagNames,
      seo: Object.keys(seo).length > 0 ? seo : undefined,
    });
    if (!result.ok) {
      // tsconfig has strict:false → discriminated-union narrowing via `!result.ok` does not
      // expose `.error`; cast to the error arm (same idiom as app/api/tools/publish/route.ts:292).
      return NextResponse.json(
        { ok: false, error: `bridge: ${(result as { ok: false; error: string }).error}` },
        { status: 502 },
      );
    }
    const v = result.value;
    return NextResponse.json({ ok: true, post_id: v.post_id, edit_url: v.edit_url });
  }

  // ── Standard WP REST path (non-bridge sites) ──────────────────────────────
  const content = markdownToHtml(markdown);
  const endpoint = `${base}/wp-json/wp/v2/posts`;

  const payload: Record<string, unknown> = {
    title,
    content,
    slug,
    excerpt,
    status: "draft",
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

  if (typeof body.scheduleDate === "string" && body.scheduleDate.trim()) {
    payload.date = body.scheduleDate.trim();
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
    return NextResponse.json({ ok: false, error: "WordPress connection failed" }, { status: 502 });
  }

  let json: unknown;
  try { json = await res.json(); } catch { json = {}; }

  if (!res.ok) {
    const msg =
      typeof json === "object" && json !== null && "message" in json
        ? String((json as { message: unknown }).message).slice(0, 200)
        : `WP error ${res.status}`;
    return NextResponse.json({ ok: false, error: msg }, { status: res.status });
  }

  const post = json as { id?: number; link?: string };
  const editUrl = post.id ? `${base}/wp-admin/post.php?post=${post.id}&action=edit` : undefined;

  return NextResponse.json({ ok: true, post_id: post.id, edit_url: editUrl, view_url: post.link });
}
