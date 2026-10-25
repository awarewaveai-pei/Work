// The one organizations name/slug search (GET /api/ops/org-search, GET /api/social/brands?q=, Telegram /client_status):
// every WordPress buyer is an organization, so a search is a server filter with a limit, never a whole-table read.

/** q as a PostgREST or() value: characters that end or wildcard a filter are dropped. "" = nothing left to search. */
export const orgSearchTerm = (q: string | null | undefined) => (q ?? "").replace(/[",()*%\\]/g, " ").trim().slice(0, 80);

/** The or() filter for name or slug containing `term` (an orgSearchTerm result, non-empty); the value is quoted. */
export const orgNameFilter = (term: string) => `name.ilike."*${term}*",slug.ilike."*${term}*"`;
