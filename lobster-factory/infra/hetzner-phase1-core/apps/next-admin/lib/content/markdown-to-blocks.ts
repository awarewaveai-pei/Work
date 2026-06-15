/**
 * markdownToBlocks — convert generated article markdown into a WP Bridge `blocks[]` list
 * (the contract consumed by the plugin's BlockLibrary.compose(); see
 * packages/wp-bridge-plugin/includes/Content/BlockLibrary.php).
 *
 * Why blocks instead of raw HTML: routing publish through the Bridge `/post` route makes the
 * server compose real **Kadence** markup, sideload in-article image URLs into the media library,
 * and persist Rank Math SEO meta server-side via update_post_meta (which — unlike standard WP REST
 * for an unregistered meta key — always lands). This converter is the next-admin half of that path.
 *
 * Single-H1 guarantee (issue 二): the leading `# Title` is NEVER emitted as a heading block — WP
 * renders the post title as the page's H1, so body headings start at h2. The publish route extracts
 * that H1 as the post title separately.
 *
 * Inline formatting (bold/italic/code/link) is converted to safe HTML here because BlockLibrary
 * passes a block's text straight into the markup without escaping; the same escaping idiom as
 * app/api/content/publish/route.ts is reused locally to keep this module self-contained.
 */

export type Block =
  | { type: "heading"; text: string; level: number }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "image"; url: string; alt: string }
  | { type: "embed"; url: string }
  | { type: "table"; rows: string[][] }
  | { type: "divider" };

/**
 * A standalone YouTube watch/share/embed/shorts URL on its own line becomes an embed block,
 * which BlockLibrary.compose() maps via `case 'embed'` → youtube($url) to real core/embed
 * Gutenberg markup. ContentStudio resolves a `[YOUTUBE_PLACEHOLDER_N: query]` by replacing it
 * with the canonical watch URL on its own line, so this is the only YouTube path the converter sees.
 */
function isYouTubeUrl(url: string): boolean {
  // Accept-set kept in lockstep with ContentStudio.canonicalYouTube() (the producer/SSOT) and with the
  // identical copy in app/api/content/publish/route.ts: an 11-char video id under a YouTube host.
  return /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)[\w-]{11}/i.test(url);
}

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

/** Markdown inline → safe HTML (escape first, then bold/italic/code/link). Mirrors publish/route.ts. */
function inline(s: string): string {
  const e = escapeHtml(s);
  return e
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, (_m, c) => `<strong>${c}</strong>`)
    .replace(/\*([^*]+)\*/g, (_m, c) => `<em>${c}</em>`)
    // Links only — negative lookbehind so image syntax ![ is not treated as a link
    .replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) =>
      `<a href="${safeUrl(url)}">${text}</a>`,
    );
}

/**
 * Convert article markdown to a Bridge blocks[] list. Strips the CONTENT_META block and the leading
 * H1, then maps each markdown construct to one block spec. Unknown/unsupported lines fall back to a
 * paragraph so no content is silently dropped.
 */
export function markdownToBlocks(md: string): Block[] {
  const clean = md
    .replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "")
    .replace(/<!--\s*SLUG_HINT:[^>]*-->/g, "")
    // Drop any UNRESOLVED YouTube placeholder, even if the model emitted it inline rather than on its
    // own line. By publish time a resolved placeholder is already a bare watch URL (no longer matches),
    // so this scrubs only the leftover authoring cue and never a real embed. (critic 2026-06-15 Major)
    .replace(/\[YOUTUBE_PLACEHOLDER_\d+:[^\]]*\]/g, "")
    .trim();

  const lines = clean.split("\n");
  const blocks: Block[] = [];

  let listBuf: string[] | null = null;
  let quoteBuf: string[] | null = null;
  let tableBuf: string[][] | null = null;

  const flushList = () => { if (listBuf && listBuf.length) blocks.push({ type: "list", items: listBuf }); listBuf = null; };
  const flushQuote = () => { if (quoteBuf && quoteBuf.length) blocks.push({ type: "quote", text: quoteBuf.join("<br>") }); quoteBuf = null; };
  const flushTable = () => {
    if (tableBuf && tableBuf.length) blocks.push({ type: "table", rows: tableBuf });
    tableBuf = null;
  };
  const flushAll = () => { flushList(); flushQuote(); flushTable(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Table rows ──────────────────────────────────────────────────────────
    if (trimmed.startsWith("|")) {
      flushList(); flushQuote();
      if (/^\|[\s\-|:]+\|$/.test(trimmed)) continue; // separator row
      if (!tableBuf) tableBuf = [];
      const cells = line.split("|").slice(1, -1).map(c => inline(c.trim()));
      tableBuf.push(cells);
      continue;
    }
    if (tableBuf) flushTable();

    // Unordered list ──────────────────────────────────────────────────────
    if (/^[-*+]\s/.test(line)) {
      flushQuote();
      if (!listBuf) listBuf = [];
      listBuf.push(inline(line.replace(/^[-*+]\s/, "")));
      continue;
    }

    // Ordered list — no ordered block type, so bake the number into a bullet item.
    const olMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (olMatch) {
      flushQuote();
      if (!listBuf) listBuf = [];
      listBuf.push(`${olMatch[1]}. ${inline(olMatch[2])}`);
      continue;
    }
    if (listBuf) flushList();

    // Blockquote (accumulate consecutive `>` lines) ───────────────────────
    if (line.startsWith("> ") || trimmed === ">") {
      if (!quoteBuf) quoteBuf = [];
      quoteBuf.push(inline(line.replace(/^>\s?/, "")));
      continue;
    }
    if (quoteBuf) flushQuote();

    // Headings — h1 dropped (post title owns the H1); h2–h6 become heading blocks
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      const level = h[1].length;
      if (level === 1) continue; // single-H1 guarantee
      blocks.push({ type: "heading", text: inline(h[2]), level });
      continue;
    }

    // Divider ─────────────────────────────────────────────────────────────
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "divider" });
      continue;
    }

    // Standalone image — only real http(s) URLs (placeholders/relative refs skipped)
    const img = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) {
      const alt = img[1].trim();
      const url = img[2].trim();
      if (/^https?:\/\//.test(url)) blocks.push({ type: "image", url, alt });
      continue;
    }

    // Standalone YouTube URL → real embed block (resolved placeholder lands here).
    // (Unresolved placeholders were already scrubbed during preprocessing above.)
    if (isYouTubeUrl(trimmed)) {
      blocks.push({ type: "embed", url: trimmed });
      continue;
    }

    // Pure HTML comment line (NEEDS_BRAND_VERIFY etc.) — skip
    if (/^<!--.*-->$/.test(trimmed)) continue;

    // Blank line — paragraph boundary, nothing to emit
    if (!trimmed) continue;

    // Default: a body paragraph
    blocks.push({ type: "paragraph", text: inline(line) });
  }

  flushAll();
  return blocks;
}
