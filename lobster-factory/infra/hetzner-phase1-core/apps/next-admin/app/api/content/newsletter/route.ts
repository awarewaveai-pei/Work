import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { isBridgeConfigured, createNewsletter } from "@/lib/studio/wp-bridge-client";
import { blockedChangeResponse } from "@/lib/system-modes/blocked-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Push a generated article into FluentCRM as a DRAFT email campaign via the WP Bridge /newsletter
// route (packages/wp-bridge-plugin/includes/Newsletter/NewsletterCreator.php).
//
// RED LINE (governance, WP_BRIDGE_CONTROL_PLANE_DESIGN.md §I): draft only — NEVER schedules, NEVER
// sends. This route creates the draft row and nothing else; the operator reviews recipients and
// presses send manually in FluentCRM. We pass only content fields (title/subject/preview/body_html).

const MAX_MARKDOWN_BYTES = 600_000;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(raw: string): string {
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
    .replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) =>
      `<a href="${safeUrl(url)}">${text}</a>`);
}

/**
 * Email-flavored markdown → HTML. Deliberately distinct from the WP publish converter
 * (lib/content/publish/wordpress-core.ts markdownToHtml): an email client has no WP autoembed, so a bare
 * YouTube URL would render as raw text — here we turn standalone links into anchors instead. Tables
 * are flattened to nothing fancy; images are kept as <img>. Internal generation markers are scrubbed.
 */
function markdownToEmailHtml(md: string): string {
  const clean = md
    .replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "")
    .replace(/<!--\s*SLUG_HINT:[^>]*-->/g, "")   // self-contained scrub (client strips it too)
    .replace(/\[YOUTUBE_PLACEHOLDER_\d+:[^\]]*\]/g, "")
    .replace(/<!--\s*GENERATION_(?:TRUNCATED|ERROR):[\s\S]*?-->/g, "")
    .trim();

  const lines = clean.split("\n");
  const out: string[] = [];
  let inList = false;
  let inOl = false;

  const closeLists = () => {
    if (inList) { out.push("</ul>"); inList = false; }
    if (inOl)   { out.push("</ol>"); inOl = false; }
  };

  for (const line of lines) {
    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.replace(/^[-*+]\s/, ""))}</li>`);
      continue;
    }
    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      if (inList) { out.push("</ul>"); inList = false; }
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push(`<li>${inline(olMatch[1])}</li>`);
      continue;
    }
    closeLists();

    // Headings (email: keep h2/h3 weight; collapse h1 → h2 so the subject stays the real title)
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      const level = Math.min(Math.max(h[1].length, 2), 4); // h1→h2, cap h4
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) { out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`); continue; }

    // Standalone image
    const imgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const [, alt, url] = imgMatch;
      const u = url.trim();
      if (/^https?:\/\//.test(u)) {
        out.push(`<p><img src="${escapeHtml(u)}" alt="${escapeHtml(alt)}" style="max-width:100%;height:auto;" /></p>`);
      }
      continue;
    }

    // Bare URL on its own line → link (email has no autoembed)
    const bare = line.trim();
    if (/^https?:\/\/\S+$/.test(bare)) {
      out.push(`<p><a href="${safeUrl(bare)}">${escapeHtml(bare)}</a></p>`);
      continue;
    }

    // Table separator / rows → flatten cells to a paragraph (email tables are brittle; keep it simple)
    if (bare.startsWith("|")) {
      if (/^\|[\s\-|:]+\|$/.test(bare)) continue; // separator
      const cells = bare.split("|").slice(1, -1).map(c => c.trim()).filter(Boolean);
      if (cells.length) out.push(`<p>${cells.map(inline).join(" — ")}</p>`);
      continue;
    }

    if (!bare) { continue; }
    out.push(`<p>${inline(line)}</p>`);
  }
  closeLists();
  return out.join("\n");
}

/**
 * Concise teaser email (U-FluentCRM) — hero image + title + short excerpt + a "閱讀完整文章" CTA
 * button linking to the public article URL. Deliberately NOT the full article: the goal is to entice
 * the reader to click through, and to keep the campaign short. All styles are inline (email clients
 * strip <style>/<head>). Returns "" if there is no usable content so the caller can 400.
 */
function buildTeaserHtml(opts: { title: string; excerpt: string; heroImage?: string; articleUrl?: string }): string {
  const title = opts.title.trim();
  const excerpt = opts.excerpt.trim();
  if (!title && !excerpt) return "";
  const hero = opts.heroImage && /^https?:\/\//.test(opts.heroImage) ? opts.heroImage : "";
  const url = opts.articleUrl && /^https?:\/\//.test(opts.articleUrl) ? opts.articleUrl : "";

  const parts: string[] = [];
  parts.push('<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">');
  if (hero) {
    parts.push(`<img src="${escapeHtml(hero)}" alt="${escapeHtml(title)}" width="600" style="width:100%;max-width:600px;height:auto;border-radius:12px;margin:0 0 20px;display:block;" />`);
  }
  if (title) {
    parts.push(`<h1 style="font-size:24px;line-height:1.3;margin:0 0 14px;color:#111827;font-weight:700;">${escapeHtml(title)}</h1>`);
  }
  excerpt.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).slice(0, 3).forEach(p => {
    parts.push(`<p style="font-size:16px;line-height:1.6;margin:0 0 14px;color:#374151;">${inline(p)}</p>`);
  });
  if (url) {
    parts.push(`<div style="margin:24px 0 8px;"><a href="${safeUrl(url)}" style="display:inline-block;background:#5855d0;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:13px 30px;border-radius:8px;">閱讀完整文章 →</a></div>`);
    parts.push(`<p style="font-size:13px;line-height:1.5;color:#9ca3af;margin:0;">若按鈕無法點擊，請複製此連結：<br /><a href="${safeUrl(url)}" style="color:#5855d0;word-break:break-all;">${escapeHtml(url)}</a></p>`);
  }
  parts.push('</div>');
  return parts.join("\n");
}

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  if (!isBridgeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "WP Bridge 未設定（需 WPBRIDGE_BASE_URL / WPBRIDGE_KEY_ID / WPBRIDGE_PRIVATE_KEY）" },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const markdown = (typeof body.markdown === "string" ? body.markdown : "").trim();
  const subject  = (typeof body.subject  === "string" ? body.subject.trim()  : "");
  const title    = (typeof body.title    === "string" && body.title.trim()) ? body.title.trim() : subject;
  const preview  = (typeof body.preview  === "string" ? body.preview.trim()  : "");
  const designTemplate = typeof body.designTemplate === "string" ? body.designTemplate.trim() : "";

  // U-FluentCRM: teaser mode builds a short CTA-driven email instead of converting the full article.
  const mode       = typeof body.mode       === "string" ? body.mode : "";
  const excerpt    = typeof body.excerpt    === "string" ? body.excerpt.trim()    : "";
  const heroImage  = typeof body.heroImage  === "string" ? body.heroImage.trim()  : "";
  const articleUrl = typeof body.articleUrl === "string" ? body.articleUrl.trim() : "";
  const isTeaser   = mode === "teaser";

  if (!subject)  return NextResponse.json({ ok: false, error: "缺少主旨（subject）" }, { status: 400 });
  if (!isTeaser && !markdown) return NextResponse.json({ ok: false, error: "markdown required" }, { status: 400 });
  if (markdown && Buffer.byteLength(markdown, "utf8") > MAX_MARKDOWN_BYTES) {
    return NextResponse.json({ ok: false, error: "內容過長" }, { status: 413 });
  }

  const bodyHtml = isTeaser
    ? buildTeaserHtml({ title, excerpt: excerpt || preview, heroImage, articleUrl })
    : markdownToEmailHtml(markdown);
  if (!bodyHtml.trim()) return NextResponse.json({ ok: false, error: "no publishable content" }, { status: 400 });

  const r = await createNewsletter({
    title,
    subject,
    preview: preview || undefined,
    body_html: bodyHtml,
    design_template: designTemplate || undefined,
  });

  if (!r.ok) {
    // bridge_not_configured handled above; surface the plugin's reason (e.g. fluentcrm_not_active).
    // tsconfig strict:false → `!r.ok` does not narrow to the error arm; cast (same idiom as publish route).
    const failed = r as { ok: false; error: string; blockedMode?: string };
    if (failed.blockedMode !== undefined) {
      return blockedChangeResponse(failed.blockedMode);
    }
    return NextResponse.json({ ok: false, error: failed.error }, { status: 502 });
  }

  const v = r.value;
  return NextResponse.json({
    ok: true,
    campaign_id: v.campaign_id,
    campaign_status: v.campaign_status, // always 'draft'
    edit_url: v.edit_url,
  }, { status: 201 });
}
