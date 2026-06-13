import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Table rows
    if (line.trim().startsWith("|")) {
      if (!inTable) { out.push("<table>"); inTable = true; }
      // separator row
      if (/^\|[\s\-|]+\|$/.test(line.trim())) continue;
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      const tag = i === 0 || (lines[i - 1]?.trim().startsWith("|") === false) ? "th" : "td";
      out.push("<tr>" + cells.map(c => `<${tag}>${inline(c)}</${tag}>`).join("") + "</tr>");
      continue;
    }
    if (inTable) { out.push("</table>"); inTable = false; }

    // List items
    if (/^[-*+]\s/.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.replace(/^[-*+]\s/, ""))}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }

    // Headings
    const h6 = line.match(/^######\s+(.*)/); if (h6) { out.push(`<h6>${inline(h6[1])}</h6>`); continue; }
    const h5 = line.match(/^#####\s+(.*)/);  if (h5) { out.push(`<h5>${inline(h5[1])}</h5>`); continue; }
    const h4 = line.match(/^####\s+(.*)/);   if (h4) { out.push(`<h4>${inline(h4[1])}</h4>`); continue; }
    const h3 = line.match(/^###\s+(.*)/);    if (h3) { out.push(`<h3>${inline(h3[1])}</h3>`); continue; }
    const h2 = line.match(/^##\s+(.*)/);     if (h2) { out.push(`<h2>${inline(h2[1])}</h2>`); continue; }
    const h1 = line.match(/^#\s+(.*)/);      if (h1) { out.push(`<h1>${inline(h1[1])}</h1>`); continue; }

    // Blockquote
    if (line.startsWith("> ")) { out.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`); continue; }

    // HTML comments pass through (NEEDS_BRAND_VERIFY etc.)
    if (line.trim().startsWith("<!--")) { out.push(line); continue; }

    // Empty line
    if (!line.trim()) { out.push(""); continue; }

    out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  if (inTable) out.push("</table>");
  return out.join("\n");
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
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

  const wpApiUrl = process.env.WP_API_URL;
  const jwtToken = process.env.WORDPRESS_JWT_TOKEN;
  if (!wpApiUrl || !jwtToken) {
    return new NextResponse("WP_API_URL or WORDPRESS_JWT_TOKEN not configured", { status: 503 });
  }

  let body: {
    markdown?: string;
    slug?: string;
    seoTitle?: string;
    metaDescription?: string;
    categories?: number[];
  };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const markdown = (body.markdown ?? "").trim();
  if (!markdown) return new NextResponse("markdown required", { status: 400 });

  const h1 = extractH1(markdown);
  const title = h1 || "Untitled Article";
  const slug = body.slug?.trim() || slugify(h1 || "article");
  const content = markdownToHtml(markdown);

  const base = wpApiUrl.replace(/\/+$/, "");
  const endpoint = `${base}/wp-json/wp/v2/posts`;

  const payload: Record<string, unknown> = {
    title,
    content,
    slug,
    status: "draft",
  };
  if (body.categories?.length) payload.categories = body.categories;

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
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
  }

  let json: unknown;
  try { json = await res.json(); } catch { json = {}; }

  if (!res.ok) {
    const msg =
      typeof json === "object" && json !== null && "message" in json
        ? String((json as { message: unknown }).message)
        : `wp_${res.status}`;
    return NextResponse.json({ ok: false, error: msg }, { status: res.status });
  }

  const post = json as { id?: number; link?: string };
  const editUrl = post.id ? `${base}/wp-admin/post.php?post=${post.id}&action=edit` : undefined;

  return NextResponse.json({ ok: true, post_id: post.id, edit_url: editUrl, view_url: post.link });
}
