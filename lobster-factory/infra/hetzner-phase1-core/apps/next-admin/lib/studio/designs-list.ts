/**
 * My Designs list query for GET /api/tools/designs: DB-side filters, keyset paging, DB-side counts.
 *
 * Why everything is in the DB: the gallery used to fetch one 60-row page and filter + count in the
 * browser, so a 78-card deck showed 「60 / 60」 and 「FLUX schnell (60)」. Filters, paging and counts
 * now all run against the same predicate set (applyFilters), so the page, the total and every chip
 * count describe one collection.
 *
 * Counts are COUNT(*) per facet value (PostgREST HEAD + count=exact). PostgREST aggregates are not
 * enabled on this stack and a GROUP BY function would need a migration; the value sets are small
 * (fixed model / product keys, a handful of themes / brands), so one parallel round of HEAD counts
 * replaces the GROUP BY.
 */
import { GALLERY_MODEL_LABELS, GALLERY_PRODUCT_LABELS, MOCKUP_SOURCES, TAROT_SOURCES } from "./asset-group";

export const PAGE_SIZE = 60;
export const LIST_COLUMNS = "id,object_key,object_url,mime_type,byte_size,created_at,metadata";

export type TimeRange = "today" | "week" | "month";
export type SortOrder = "desc" | "asc";
export type FacetDim = "model" | "product" | "theme" | "brand" | "time";

export interface DesignListFilters {
  /** null = staff without ?organizationId → all orgs (see route GET comment). */
  organizationId: string | null;
  mimePrefix: "image/%" | "video/%";
  group: "design" | "mockup" | null;
  model: string | null;
  product: string | null;
  theme: string | null;
  brand: string | null;
  time: TimeRange | null;
  /** Browser Date#getTimezoneOffset() (minutes, UTC − local) so 今天／本週／本月 match the viewer's clock. */
  tzOffsetMin: number;
}

export interface DesignCursor {
  createdAt: string;
  id: string;
}

/** Keys of product / theme / brand = the values that exist in the scope (org + tab) whatever else is selected
 *  (model = every known model), so chips never appear and vanish as filters change; each count is what clicking that chip would give
 *  (the other dimensions' filters applied, its own not). `all` = the row's 全部 chip, same rule. */
export interface DesignFacets {
  model: Record<string, number>;
  product: Record<string, number>;
  theme: Record<string, number>;
  brand: Record<string, number>;
  time: Record<"all" | TimeRange, number>;
  all: Record<"model" | "product" | "theme" | "brand", number>;
}

export interface DesignListResult {
  assets: Record<string, unknown>[];
  nextCursor: string | null;
  /** Present only when counts were requested on the first page. */
  total?: number;
  facets?: DesignFacets;
}

// supabase-js builder generics do not survive dynamic chaining on json paths; the query is
// threaded through these helpers untyped and only the result shape is typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Postgres timestamptz text as returned by PostgREST (microseconds kept: a JS Date would drop
// them and the keyset would skip rows created in the same millisecond).
const TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/;
const MAX_FACET_VALUES = 50;

export function encodeCursor(row: { created_at: string; id: string }): string {
  return Buffer.from(`${row.created_at}|${row.id}`, "utf8").toString("base64url");
}

export function decodeCursor(raw: string): DesignCursor | null {
  let text: string;
  try { text = Buffer.from(raw, "base64url").toString("utf8"); } catch { return null; }
  const sep = text.lastIndexOf("|");
  if (sep < 0) return null;
  const createdAt = text.slice(0, sep);
  const id = text.slice(sep + 1);
  // Both values are interpolated into a PostgREST or-expression: shape-check them strictly.
  if (!TS_RE.test(createdAt) || !UUID_RE.test(id)) return null;
  return { createdAt, id };
}

/** Start of today / this week (Sunday) / this month on the viewer's clock, as a UTC ISO string. */
export function timeCutoff(range: TimeRange, tzOffsetMin: number, now = new Date()): string {
  const local = new Date(now.getTime() - tzOffsetMin * 60_000); // UTC fields = viewer wall clock
  let day = local.getUTCDate();
  if (range === "week") day -= local.getUTCDay();
  if (range === "month") day = 1;
  const startWall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), day);
  return new Date(startWall + tzOffsetMin * 60_000).toISOString();
}

function applyProduct(q: Query, product: string): Query {
  if (product === "tarot-card") return q.in("metadata->>source", [...TAROT_SOURCES]);
  if (product === "mockup-composite") return q.eq("metadata->>source", "mockup");
  return q.eq("metadata->>source", "pod-studio").eq("metadata->>product_type", product);
}

/** Every list predicate except the `omit` facet dimension. Or-groups are returned separately so
 *  they can be AND-ed into ONE `or=` param (finishOr) together with the keyset predicate. */
function applyFilters(q: Query, f: DesignListFilters, now: Date, omit?: FacetDim): { q: Query; ors: string[] } {
  q = q
    .eq("storage_backend", "r2")
    .eq("asset_domain", "ai_generated")
    .like("mime_type", f.mimePrefix)
    .eq("is_current", true)
    .is("metadata->>variantOf", null); // per-ratio video rows (V4.1) show under their primary row
  // Visibility guard: every list AND count query goes through here.
  if (f.organizationId) q = q.eq("organization_id", f.organizationId);

  const ors: string[] = [];
  // Group filter (洗版 fix): applied in the DB so each group pages on its own — tarot art can not
  // starve mockups out of the publish picker. Unknown ?group values are ignored by the route.
  if (f.group === "mockup") {
    ors.push(MOCKUP_SOURCES.map((s) => `metadata->>source.eq.${s}`).join(","));
  } else if (f.group === "design") {
    // NOT any mockup source, INCLUDING null source: jsonb ->> yields NULL for an absent key, which a
    // bare neq would drop (three-valued logic), so is.null is OR-ed in explicitly.
    const negated = MOCKUP_SOURCES.map((s) => `metadata->>source.neq.${s}`).join(",");
    ors.push(`metadata->>source.is.null,and(${negated})`);
  }

  if (omit !== "model" && f.model) q = q.eq("metadata->>model_name", f.model);
  if (omit !== "product" && f.product) q = applyProduct(q, f.product);
  if (omit !== "theme" && f.theme) q = q.eq("metadata->>theme", f.theme);
  if (omit !== "brand" && f.brand) q = q.eq("metadata->>brand", f.brand);
  if (omit !== "time" && f.time) q = q.gte("created_at", timeCutoff(f.time, f.tzOffsetMin, now));
  return { q, ors };
}

function finishOr(q: Query, ors: string[]): Query {
  if (ors.length === 0) return q;
  if (ors.length === 1) return q.or(ors[0]);
  return q.or(`and(${ors.map((o) => `or(${o})`).join(",")})`);
}

function keysetOr(c: DesignCursor, order: SortOrder): string {
  const op = order === "desc" ? "lt" : "gt";
  return `created_at.${op}."${c.createdAt}",and(created_at.eq."${c.createdAt}",id.${op}.${c.id})`;
}

async function countWhere(
  supabase: Client,
  f: DesignListFilters,
  now: Date,
  omit: FacetDim | undefined,
  extra?: (q: Query) => Query,
): Promise<number> {
  const base = supabase.from("media_assets").select("id", { count: "exact", head: true });
  const { q, ors } = applyFilters(base, f, now, omit);
  const { count, error } = await finishOr(extra ? extra(q) : q, ors);
  if (error) throw new Error(`count failed: ${error.message}`);
  return count ?? 0;
}

async function countMap(
  supabase: Client,
  f: DesignListFilters,
  now: Date,
  dim: FacetDim,
  keys: string[],
  narrow: (q: Query, key: string) => Query,
): Promise<Record<string, number>> {
  const counts = await Promise.all(keys.map((k) => countWhere(supabase, f, now, dim, (q) => narrow(q, k))));
  return Object.fromEntries(keys.map((k, i) => [k, counts[i]]));
}

/** Distinct free-text values (theme / brand) in `f`; counted afterwards in the DB. A skip scan — each query
 *  fetches the next value above the last one — so a value is never missed however many rows share the earlier
 *  ones (a single `limit(2000)` read dropped every value past row 2000, Codex 2026-10-22). Up to
 *  MAX_FACET_VALUES + 1 one-row queries. */
async function distinctValues(supabase: Client, f: DesignListFilters, now: Date, dim: "theme" | "brand"): Promise<string[]> {
  const path = `metadata->>${dim}`;
  const vals: string[] = [];
  let last: string | null = null;
  while (vals.length < MAX_FACET_VALUES) {
    const { q, ors } = applyFilters(supabase.from("media_assets").select(`v:${path}`), f, now, dim);
    let next = q.not(path, "is", null).neq(path, "");
    if (last !== null) next = next.gt(path, last);
    const { data, error } = await finishOr(next, ors).order(path, { ascending: true }).limit(1);
    if (error) throw new Error(`${dim} values failed: ${error.message}`);
    const v = ((data ?? []) as { v: unknown }[])[0]?.v;
    if (typeof v !== "string") break;
    vals.push(v);
    last = v;
  }
  return vals;
}

async function countFacets(supabase: Client, f: DesignListFilters, now: Date): Promise<{ total: number; facets: DesignFacets }> {
  // Scope = org + tab only. Which chips exist is decided here; the counts below apply the other filters.
  const scope: DesignListFilters = { ...f, model: null, product: null, theme: null, brand: null, time: null };
  const present = (m: Record<string, number>) => Object.keys(m).filter((k) => m[k] > 0);
  const [scopeProducts, themes, brands] = await Promise.all([
    countMap(supabase, scope, now, "product", Object.keys(GALLERY_PRODUCT_LABELS), applyProduct),
    distinctValues(supabase, scope, now, "theme"),
    distinctValues(supabase, scope, now, "brand"),
  ]);
  const ranges: TimeRange[] = ["today", "week", "month"];
  const [total, model, product, theme, brand, timeAll, timeRanges, rowAll] = await Promise.all([
    countWhere(supabase, f, now, undefined),
    // Model chips are all shown (showEmpty): every model key is counted.
    countMap(supabase, f, now, "model", Object.keys(GALLERY_MODEL_LABELS), (q, k) => q.eq("metadata->>model_name", k)),
    countMap(supabase, f, now, "product", present(scopeProducts), applyProduct),
    countMap(supabase, f, now, "theme", themes, (q, k) => q.eq("metadata->>theme", k)),
    countMap(supabase, f, now, "brand", brands, (q, k) => q.eq("metadata->>brand", k)),
    countWhere(supabase, f, now, "time"),
    Promise.all(ranges.map((r) => countWhere(supabase, f, now, "time", (q) => q.gte("created_at", timeCutoff(r, f.tzOffsetMin, now))))),
    Promise.all((["model", "product", "theme", "brand"] as const).map((d) => countWhere(supabase, f, now, d))),
  ]);
  return {
    total,
    facets: {
      model,
      product,
      theme,
      brand,
      time: { all: timeAll, today: timeRanges[0], week: timeRanges[1], month: timeRanges[2] },
      all: { model: rowAll[0], product: rowAll[1], theme: rowAll[2], brand: rowAll[3] },
    },
  };
}

/** One page (newest first by default) + optional totals. Order key = (created_at, id), never OFFSET. */
export async function listDesigns(
  supabase: Client,
  f: DesignListFilters,
  opts: { cursor: DesignCursor | null; order: SortOrder; withCounts: boolean; now?: Date },
): Promise<DesignListResult> {
  const now = opts.now ?? new Date();
  const ascending = opts.order === "asc";
  const { q, ors } = applyFilters(supabase.from("media_assets").select(LIST_COLUMNS), f, now);
  if (opts.cursor) ors.push(keysetOr(opts.cursor, opts.order));
  // One extra row tells whether another page exists, so the last page returns nextCursor=null
  // instead of making the client fetch an empty page.
  const { data, error } = await finishOr(q, ors)
    .order("created_at", { ascending })
    .order("id", { ascending })
    .limit(PAGE_SIZE + 1);
  if (error) throw new Error(`list failed: ${error.message}`);

  const rows = (data ?? []) as Record<string, unknown>[];
  const assets = rows.slice(0, PAGE_SIZE);
  const last = assets[assets.length - 1] as { created_at: string; id: string } | undefined;
  const nextCursor = rows.length > PAGE_SIZE && last ? encodeCursor(last) : null;

  if (!opts.withCounts || opts.cursor) return { assets, nextCursor };
  const { total, facets } = await countFacets(supabase, f, now);
  return { assets, nextCursor, total, facets };
}
