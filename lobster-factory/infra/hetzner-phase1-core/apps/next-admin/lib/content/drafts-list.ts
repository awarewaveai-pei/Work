/** The content_drafts list query (light columns, newest first): GET /api/content/drafts and the portal launcher's
 *  「繼續上次」 (card U17) both read drafts through this one function. organizationId null = every org -- only staff
 *  without ?organizationId may get that; a caller acting for a customer must pass its org. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

export const DRAFTS_LIST_LIMIT = 100;
const LIST_COLUMNS = "id, organization_id, site_id, keyword, title, language, article_type, slug_hint, seo_score, status, created_at, updated_at";

export interface DraftListRow {
  id: string;
  organization_id: string | null;
  site_id: string | null;
  keyword: string;
  title: string | null;
  language: string | null;
  article_type: string | null;
  slug_hint: string | null;
  seo_score: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function toDraftListItem(r: DraftListRow) {
  return {
    id: r.id,
    keyword: r.keyword,
    title: r.title,
    language: r.language,
    articleType: r.article_type,
    slugHint: r.slug_hint,
    seoScore: r.seo_score,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export type DraftListItem = ReturnType<typeof toDraftListItem>;

/** Throws on a database error (the caller decides how to say it). */
export async function listContentDrafts(
  supabase: Client,
  f: { organizationId: string | null; siteId?: string | null; limit?: number },
): Promise<DraftListItem[]> {
  let query = supabase
    .from("content_drafts")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(f.limit ?? DRAFTS_LIST_LIMIT);
  if (f.siteId) query = query.eq("site_id", f.siteId);
  if (f.organizationId) query = query.eq("organization_id", f.organizationId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as DraftListRow[]).map(toDraftListItem);
}
