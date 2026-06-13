import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getWpSites } from "@/app/api/content/sites/route";

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
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) =>
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
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
    categories?: unknown;
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
  let jwtToken: string | undefined;

  if (siteId) {
    const { sites, tokens } = getWpSites();
    const site = sites.find(s => s.id === siteId);
    if (!site) return new NextResponse(`Site '${siteId}' not found`, { status: 400 });
    wpApiUrl = site.url;
    jwtToken = tokens[siteId];
  } else {
    wpApiUrl = process.env.WP_API_URL;
    jwtToken = process.env.WORDPRESS_JWT_TOKEN;
  }

  if (!wpApiUrl || !jwtToken) {
    return new NextResponse("WP_API_URL or WORDPRESS_JWT_TOKEN not configured", { status: 503 });
  }

  const markdown = (typeof body.markdown === "string" ? body.markdown : "").trim();
  if (!markdown) return new NextResponse("markdown required", { status: 400 });

  const h1 = extractH1(markdown);
  const seoTitle = typeof body.seoTitle === "string" ? body.seoTitle.trim() : "";
  const title = seoTitle || h1 || "Untitled Article";
  const slug = (typeof body.slug === "string" ? body.slug.trim() : "") || slugify(h1 || "article");
  const content = markdownToHtml(markdown);

  const base = wpApiUrl.replace(/\/+$/, "");
  const endpoint = `${base}/wp-json/wp/v2/posts`;

  const payload: Record<string, unknown> = {
    title,
    content,
    slug,
    status: "draft",
  };

  if (Array.isArray(body.categories) && body.categories.length > 0) {
    payload.categories = body.categories.filter(c => Number.isInteger(c));
  }

  if (typeof body.scheduleDate === "string" && body.scheduleDate.trim()) {
    payload.date = body.scheduleDate.trim();
  }

  if (typeof body.metaDescription === "string" && body.metaDescription.trim()) {
    payload.meta = {
      _yoast_wpseo_metadesc: body.metaDescription.trim(),
      rank_math_description: body.metaDescription.trim(),
    };
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwtToken}`,
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
