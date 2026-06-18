/**
 * client-markdown.ts — lightweight Markdown → HTML for browser preview only.
 * No Node.js APIs. Shared with ContentStudio article preview panel.
 * Not used for WP publishing (server uses wordpress-core.ts markdownToHtml).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(url: string): string {
  const clean = url.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  if (/^(https?:|mailto:|\/[/#]?)/i.test(clean)) {
    try {
      if (/^https?:/i.test(clean)) new URL(clean); // validate
      return escapeHtml(clean);
    } catch { return "#"; }
  }
  if (/^[/#]/.test(clean)) return escapeHtml(clean);
  return "#";
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, (_m, c) => `<strong>${c}</strong>`)
    .replace(/\*([^*]+)\*/g, (_m, c) => `<em>${c}</em>`)
    .replace(/~~([^~]+)~~/g, (_m, c) => `<s>${c}</s>`)
    .replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) =>
      `<a href="${safeUrl(url)}" target="_blank" rel="noreferrer">${text}</a>`);
}

/** Convert article Markdown to safe HTML for browser preview. */
export function markdownPreview(md: string): string {
  // Strip meta + comment blocks
  const clean = md
    .replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "")
    .replace(/<!--.*?-->/gs, "")
    .trim();

  const lines = clean.split("\n");
  const out: string[] = [];
  let inList = false, inOl = false, inTable = false, tableHasHeader = false;

  for (const line of lines) {
    // Tables
    if (line.trim().startsWith("|")) {
      if (!inTable) { out.push('<table style="border-collapse:collapse;width:100%;margin:12px 0">'); inTable = true; tableHasHeader = false; }
      if (/^\|[\s\-|:]+\|$/.test(line.trim())) continue;
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      if (!tableHasHeader) {
        out.push("<thead><tr>" + cells.map(c => `<th style="padding:8px 12px;border:1px solid #ccc;background:#f5f5f5;text-align:left">${inline(c)}</th>`).join("") + "</tr></thead><tbody>");
        tableHasHeader = true;
      } else {
        out.push("<tr>" + cells.map(c => `<td style="padding:8px 12px;border:1px solid #ccc">${inline(c)}</td>`).join("") + "</tr>");
      }
      continue;
    }
    if (inTable) { out.push("</tbody></table>"); inTable = false; tableHasHeader = false; }

    // Lists
    if (/^[-*+]\s/.test(line)) {
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inList) { out.push('<ul style="margin:8px 0;padding-left:20px">'); inList = true; }
      out.push(`<li style="margin:4px 0">${inline(line.replace(/^[-*+]\s/, ""))}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }

    const olM = line.match(/^\d+\.\s+(.*)/);
    if (olM) {
      if (!inOl) { out.push('<ol style="margin:8px 0;padding-left:20px">'); inOl = true; }
      out.push(`<li style="margin:4px 0">${inline(olM[1])}</li>`);
      continue;
    }
    if (inOl) { out.push("</ol>"); inOl = false; }

    // Headings — skip H1 (used as post title)
    const h6 = line.match(/^######\s+(.*)/); if (h6) { out.push(`<h6 style="font-size:13px;margin:12px 0 4px">${inline(h6[1])}</h6>`); continue; }
    const h5 = line.match(/^#####\s+(.*)/);  if (h5) { out.push(`<h5 style="font-size:14px;margin:14px 0 4px">${inline(h5[1])}</h5>`); continue; }
    const h4 = line.match(/^####\s+(.*)/);   if (h4) { out.push(`<h4 style="font-size:15px;margin:16px 0 4px">${inline(h4[1])}</h4>`); continue; }
    const h3 = line.match(/^###\s+(.*)/);    if (h3) { out.push(`<h3 style="font-size:16px;margin:18px 0 6px">${inline(h3[1])}</h3>`); continue; }
    const h2 = line.match(/^##\s+(.*)/);     if (h2) { out.push(`<h2 style="font-size:18px;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb">${inline(h2[1])}</h2>`); continue; }
    // H1: show as article title at top (preview only)
    const h1 = line.match(/^#\s+(.*)/);      if (h1) { out.push(`<h1 style="font-size:22px;margin:0 0 16px;font-weight:700">${inline(h1[1])}</h1>`); continue; }

    // Blockquote
    if (line.startsWith("> ")) {
      out.push(`<blockquote style="border-left:3px solid #d1d5db;margin:12px 0;padding:4px 12px;color:#6b7280;font-style:italic"><p>${inline(line.slice(2))}</p></blockquote>`);
      continue;
    }

    // Images (standalone)
    const imgM = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgM) {
      const [, alt, url] = imgM;
      const safeImgUrl = /^https?:\/\//.test(url.trim()) ? escapeHtml(url.trim()) : "";
      if (safeImgUrl) {
        out.push(`<figure style="margin:16px 0;text-align:center"><img src="${safeImgUrl}" alt="${escapeHtml(alt)}" style="max-width:100%;height:auto;border-radius:6px" /></figure>`);
      }
      continue;
    }

    // Empty line
    if (!line.trim()) { out.push(""); continue; }

    out.push(`<p style="margin:8px 0;line-height:1.7">${inline(line)}</p>`);
  }

  if (inList) out.push("</ul>");
  if (inOl) out.push("</ol>");
  if (inTable) out.push("</tbody></table>");

  return out.join("\n");
}
