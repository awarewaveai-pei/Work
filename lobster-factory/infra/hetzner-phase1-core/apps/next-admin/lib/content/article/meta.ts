// The meta block the article generator writes first (generate-core.ts buildUserPrompt, generateMeta) and the slug hint,
// read in one place for every server caller. Browser-safe: no server imports.

export interface ArticleMeta {
  seoTitle: string;
  metaDesc: string;
  focusKeyword?: string;
  categories?: string[];
  tags?: string[];
  slug?: string;
  /** K10: the cover's English scene, short title and subtitle (written only when images were asked for) */
  cover?: ArticleCover;
}

export interface ArticleCover { scene?: string; title?: string; subtitle?: string }

/** The cover fields of the meta block; undefined when it has none (no images asked for, or an article before K10). */
export function parseArticleCover(markdown: string): ArticleCover | undefined {
  const block = markdown.match(/<!-- CONTENT_META_START -->([\s\S]*?)<!-- CONTENT_META_END -->/);
  if (!block) return undefined;
  const field = (key: string) => block[1].match(new RegExp(`${key}:[ \t]*(.+)`))?.[1]?.trim() || undefined;
  const c = { scene: field("COVER_SCENE"), title: field("COVER_TITLE"), subtitle: field("COVER_SUBTITLE") };
  return c.scene || c.title || c.subtitle ? Object.fromEntries(Object.entries(c).filter(([, v]) => v)) as ArticleCover : undefined;
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
  const cover = parseArticleCover(markdown);
  const slug = markdown.match(/<!--\s*SLUG_HINT:\s*([a-z0-9][a-z0-9-]*)\s*-->/)?.[1];
  return {
    seoTitle,
    metaDesc: metaDesc.slice(0, 160),
    focusKeyword: field("FOCUS_KEYWORD"),
    categories: csv(field("CATEGORIES")),
    tags: csv(field("TAGS")),
    ...(slug ? { slug } : {}),
    ...(cover ? { cover } : {}),
  };
}

/** The article's first H1 ("" = none): with the SEO title, what wordpress-core names the draft (K27 keeps that title). */
export function extractH1(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim() ?? "";
}
