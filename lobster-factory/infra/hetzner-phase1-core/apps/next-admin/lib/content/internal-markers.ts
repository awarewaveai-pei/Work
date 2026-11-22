// Every internal marker the article generator (lib/content/article/generate-core.ts, its prompt and its stream) or the
// pipeline can leave in article markdown, and the one place that takes them out before a WordPress write. Both publish
// converters (publish/wordpress-core.ts markdownToHtml, markdown-to-blocks.ts markdownToBlocks) call scrubInternalMarkers
// first, so a marker cannot reach a post on one path and not the other. Readers that NEED a marker (parseArticleMeta:
// CONTENT_META / SLUG_HINT; the pipeline's GENERATION_* check; the quality and review steps) read the markdown before it
// is converted, which this never touches.
// 2026-11-22: aware-wave.com posts 62 and 69 showed 「&lt;!-- NEEDS_FACT_CHECK --&gt;」 as text: an inline comment was
// HTML-escaped into a visible paragraph; scheduled drafts also ended with a 「[COST_JSON]{…}」 paragraph.

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
] as const;

/** Article markdown with every internal marker taken out; the text around an inline marker stays. */
export function scrubInternalMarkers(md: string): string {
  return md
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
