// Every internal marker the article generator (lib/content/article/generate-core.ts, its prompt and its stream) or the
// pipeline can leave in article markdown, and the one place that takes them out before a WordPress write. Both publish
// converters (publish/wordpress-core.ts markdownToHtml, markdown-to-blocks.ts markdownToBlocks) call scrubInternalMarkers
// first, so a marker cannot reach a post on one path and not the other. Readers that NEED a marker (parseArticleMeta:
// CONTENT_META / SLUG_HINT; the pipeline's GENERATION_* check; the quality and review steps) read the markdown before it
// is converted, which this never touches.
// 2026-11-22: aware-wave.com posts 62 and 69 showed 「&lt;!-- NEEDS_FACT_CHECK --&gt;」 as text: an inline comment was
// HTML-escaped into a visible paragraph; scheduled drafts also ended with a 「[COST_JSON]{…}」 paragraph.
// 2026-11-23 (K22 blind test): models wrote editor notes on a source's year into the body (「（年份未核）」), and one wrote a
// raw <a href> that both converters escape into visible code. The prompt forbids both (generate-core.ts SOURCE YEAR RULE,
// LINKS); this is the guard for a model that ignores it. The year notes are an explicit list, so 「（2024）」 stays.

/** The markers, for the record and for the test that runs all of them through both converters. */
export const INTERNAL_MARKERS = [
  { marker: "<!-- CONTENT_META_START --> … <!-- CONTENT_META_END -->", source: "prompt: the meta block (title, description, slug…)", handling: "block removed" },
  { marker: "<!-- SLUG_HINT: … -->", source: "prompt: slug hint", handling: "removed (any HTML comment)" },
  { marker: "<!-- NEEDS_FACT_CHECK -->", source: "prompt: claim needs a source (often inline)", handling: "removed, the sentence kept" },
  { marker: "<!-- NEEDS_BRAND_VERIFY -->", source: "prompt: unverified brand claim (inline)", handling: "removed, the sentence kept" },
  { marker: "<!-- GENERATION_ERROR: … --> / <!-- GENERATION_TRUNCATED: … -->", source: "stream: failed or cut-off generation", handling: "removed (the pipeline already refuses such an article)" },
  { marker: "<!-- any other HTML comment -->", source: "model or pasted text", handling: "removed; only a Gutenberg <!-- wp:… --> comment is kept" },
  { marker: "[COST_JSON]{…}", source: "stream: cost note for the browser", handling: "line removed" },
  { marker: "[YOUTUBE_PLACEHOLDER_N: …]", source: "prompt: video cue", handling: "removed (a resolved one is a bare URL already)" },
  { marker: "![alt](IMAGE_PLACEHOLDER_N)", source: "prompt: image cue", handling: "removed when still unresolved (make.ts / the studio fill it first)" },
  { marker: "[KADENCE_PATTERN: id] inside a sentence", source: "prompt: pattern cue", handling: "removed; ALONE on its line it is a feature (converted to a wp:block ref) and kept" },
  { marker: "（年份未核）（無固定出版年）（出版年份待查）（X，未註明年份）…", source: "model: editor note on an unknown source year", handling: "note removed; a source name in the same brackets kept, emptied brackets dropped" },
  { marker: "<a href=\"https://…\">text</a>", source: "model: raw HTML link instead of Markdown", handling: "rewritten to [text](url), so the converters' URL check and link output apply" },
] as const;

// The exact forms models write. Kept explicit: a broad 「年份」 match would eat real text.
const YEAR_NOTE = "(?:條目)?(?:更新|出版)?年份(?:未核|未確認|未註明|待查|不詳)|未註明(?:出版)?年份|無固定出版年份?|出版年份?(?:未核|未確認|待查|不詳)";
const YEAR_NOTE_ANY = new RegExp(YEAR_NOTE);
const YEAR_NOTE_PART = new RegExp(`[，,；;、]?\\s*(?:${YEAR_NOTE})`, "g");

/** A bracket holding a year note loses the note; a bracket left empty goes, with the space before it. */
function scrubYearNotes(md: string): string {
  return md.replace(/([ \t]*)([（(])([^（）()\n]{0,80})([）)])/g, (all, lead: string, open: string, inner: string, close: string) => {
    if (!YEAR_NOTE_ANY.test(inner)) return all;
    const kept = inner.replace(YEAR_NOTE_PART, "").replace(/^[，,；;、\s]+/, "").trim();
    return kept ? `${lead}${open}${kept}${close}` : "";
  });
}

/** A raw HTML link becomes a Markdown link (brackets out of the text, ")" encoded in the URL). */
function htmlLinksToMarkdown(md: string): string {
  return md.replace(/<a\s[^>]*?href\s*=\s*["']([^"'\s]+)["'][^>]*>([^<]*)<\/a>/gi, (_all, url: string, text: string) =>
    `[${text.replace(/[[\]]/g, "").trim() || url}](${url.replace(/\)/g, "%29")})`);
}

/** Article markdown with every internal marker taken out; the text around an inline marker stays. */
export function scrubInternalMarkers(md: string): string {
  return htmlLinksToMarkdown(scrubYearNotes(md))
    .replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "")
    // every HTML comment but a Gutenberg block comment: NEEDS_*, SLUG_HINT, GENERATION_*, and any marker added later
    .replace(/[ \t]*<!--(?!\s*\/?wp:)[\s\S]*?-->/g, "")
    .replace(/^[ \t]*\[COST_JSON\].*$/gm, "")
    .replace(/\[YOUTUBE_PLACEHOLDER_\d+:[^\]]*\]/g, "")
    .replace(/!\[[^\]]*\]\(IMAGE_PLACEHOLDER_\d+\)/g, "")
    // only INLINE pattern leftovers; a standalone line is converted by the converters' main loop
    .replace(/(?<=\S)[ \t]*\[KADENCE_PATTERN:\s*\d+\s*\]/gi, "")
    .replace(/\[KADENCE_PATTERN:\s*\d+\s*\][ \t]*(?=\S)/gi, "")
    .trim();
}
