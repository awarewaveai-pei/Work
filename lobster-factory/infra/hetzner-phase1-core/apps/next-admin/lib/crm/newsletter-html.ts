// Email HTML pieces shared by the newsletter route (app/api/content/newsletter/route.ts) and the weekly member newsletter
// (lib/crm/member-newsletter.ts). A route file may only export its handlers, so the shared helpers live here.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** http(s) / mailto / a site-relative path, escaped; anything else (javascript:, data:) becomes "#". */
export function safeUrl(raw: string): string {
  if (/^(https?:|mailto:)/i.test(raw)) {
    try {
      const u = new URL(raw);
      return ["http:", "https:", "mailto:"].includes(u.protocol) ? escapeHtml(raw) : "#";
    } catch { return "#"; }
  }
  if (/^[/#]/.test(raw)) return escapeHtml(raw);
  return "#";
}

/** The teaser email's frame and type (inline styles: email clients strip <style>/<head>). */
export const EMAIL_FRAME_OPEN = '<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">';
export const EMAIL_H1 = "font-size:24px;line-height:1.3;margin:0 0 14px;color:#111827;font-weight:700;";
export const EMAIL_P = "font-size:16px;line-height:1.6;margin:0 0 14px;color:#374151;";
export const EMAIL_LINK = "color:#5855d0;word-break:break-all;";
