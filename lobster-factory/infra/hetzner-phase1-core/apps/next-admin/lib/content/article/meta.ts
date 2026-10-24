// The meta block the article generator writes first (generate-core.ts buildUserPrompt, generateMeta) and the slug hint,
// read in one place for every server caller. Browser-safe: no server imports.

export interface ArticleMeta {
  seoTitle: string;
  metaDesc: string;
  focusKeyword?: string;
  categories?: string[];
  tags?: string[];
  slug?: string;
}

/** null = no meta block, or one without SEO_TITLE and META_DESC (the generator was asked for none, or broke it). */
export function parseArticleMeta(markdown: string): ArticleMeta | null {
  const block = markdown.match(/<!-- CONTENT_META_START -->([\s\S]*?)<!-- CONTENT_META_END -->/);
  if (!block) return null;
  const field = (key: string) => block[1].match(new RegExp(`${key}:\\s*(.+)`))?.[1]?.trim();
  const seoTitle = field("SEO_TITLE");
  const metaDesc = field("META_DESC");
  if (!seoTitle || !metaDesc) return null;
  const csv = (s?: string) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined);
  const slug = markdown.match(/<!--\s*SLUG_HINT:\s*([a-z0-9][a-z0-9-]*)\s*-->/)?.[1];
  return {
    seoTitle,
    metaDesc: metaDesc.slice(0, 160),
    focusKeyword: field("FOCUS_KEYWORD"),
    categories: csv(field("CATEGORIES")),
    tags: csv(field("TAGS")),
    ...(slug ? { slug } : {}),
  };
}
