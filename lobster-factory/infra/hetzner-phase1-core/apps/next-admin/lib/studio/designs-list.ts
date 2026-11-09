/**
 * My Designs list query for GET /api/tools/designs: DB-side filters, keyset paging, DB-side counts.
 *
 * Why everything is in the DB: the gallery used to fetch one 60-row page and filter + count in the
 * browser, so a 78-card deck showed 「60 / 60」 and 「FLUX schnell (60)」. Filters, paging and counts
 * now all run against the same predicate set (applyFilters), so the page, the total and every chip
 * count describe one collection.
 *
 * Counting used to be one COUNT(*) request per facet value (PostgREST HEAD + count=exact) — about 40 per page load,
 * growing with the model catalog. The host's nginx allows 30 req/s per IP with a burst of 50 on supabase.aware-wave.com
 * (/etc/nginx/sites-enabled/supabase.aware-wave.com), so a page that loaded twice crossed it and PostgREST's 429 came
 * back as `[designs] list failed: count failed:` with an empty body (2026-11-09). PostgREST aggregates are disabled on
 * this stack (PGRST123 "Use of aggregate functions is not allowed"), so the counts are now tallied here: ONE scan of the
 * scope's facet columns (216 rows on 2026-11-09), paged, then every facet computed in memory. One page load is one
 * request whatever the catalog holds.
 */
import { getDesignsPublicBase } from "../storage/r2";
import { withSourceUrls } from "./design-source";
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
  /** "print" = 設計圖 minus tarot card art: what can go on a product (the mockup picker). */
  group: "design" | "print" | "mockup" | null;
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
  } else if (f.group === "design" || f.group === "print") {
    // NOT any excluded source, INCLUDING null source: jsonb ->> yields NULL for an absent key, which a
    // bare neq would drop (three-valued logic), so is.null is OR-ed in explicitly.
    const excluded = f.group === "print" ? [...MOCKUP_SOURCES, ...TAROT_SOURCES] : MOCKUP_SOURCES;
    const negated = excluded.map((s) => `metadata->>source.neq.${s}`).join(",");
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

/** Rows scanned per request while tallying facets; PostgREST's own ceiling is higher, this keeps each response small. */
const FACET_SCAN_PAGE = 1000;
/** Hard stop, so a runaway scope cannot turn one page load into a long scan. Today's design scope is 216 rows. */
export const FACET_SCAN_MAX = 20000;

interface FacetRow {
  created_at: string;
  source: string | null;
  model: string | null;
  productType: string | null;
  theme: string | null;
  brand: string | null;
}

/** The product chip a row belongs to — the inverse of applyProduct, which the chips' counts must agree with. */
export function productOf(row: FacetRow): string | null {
  if (row.source && (TAROT_SOURCES as readonly string[]).includes(row.source)) return "tarot-card";
  if (row.source && (MOCKUP_SOURCES as readonly string[]).includes(row.source)) return "mockup-composite";
  if (row.source === "pod-studio") return row.productType;
  return null;
}

/** Every row of the scope (org + tab), facet columns only, keyset-paged. */
async function scanScope(supabase: Client, scope: DesignListFilters, now: Date): Promise<FacetRow[]> {
  const out: FacetRow[] = [];
  let cursor: DesignCursor | null = null;
  while (out.length < FACET_SCAN_MAX) {
    const { q, ors } = applyFilters(supabase.from("media_assets").select("id,created_at,metadata"), scope, now);
    const all = cursor ? [...ors, keysetOr(cursor, "desc")] : ors;
    const { data, error } = await finishOr(q, all)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(FACET_SCAN_PAGE);
    if (error) throw new Error(`facet scan failed: ${error.message}`);
    const rows = (data ?? []) as { id: string; created_at: string; metadata: Record<string, unknown> | null }[];
    for (const r of rows) {
      const m = r.metadata ?? {};
      out.push({
        created_at: r.created_at,
        source: (m.source as string) ?? null,
        model: (m.model_name as string) ?? null,
        productType: (m.product_type as string) ?? null,
        theme: (m.theme as string) ?? null,
        brand: (m.brand as string) ?? null,
      });
    }
    if (rows.length < FACET_SCAN_PAGE) break;
    const last = rows[rows.length - 1];
    cursor = { createdAt: last.created_at, id: last.id };
  }
  return out;
}

/** Does this row pass every active filter except `omit`? Mirrors applyFilters' facet predicates exactly. */
function passes(row: FacetRow, f: DesignListFilters, omit: FacetDim | undefined, cutoff: string | null): boolean {
  if (omit !== "model" && f.model && row.model !== f.model) return false;
  if (omit !== "product" && f.product && productOf(row) !== f.product) return false;
  if (omit !== "theme" && f.theme && row.theme !== f.theme) return false;
  if (omit !== "brand" && f.brand && row.brand !== f.brand) return false;
  if (omit !== "time" && cutoff && row.created_at < cutoff) return false;
  return true;
}

function tally(rows: FacetRow[], f: DesignListFilters, dim: FacetDim, keyOf: (r: FacetRow) => string | null,
  keys: string[], cutoff: string | null): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const row of rows) {
    if (!passes(row, f, dim, cutoff)) continue;
    const k = keyOf(row);
    if (k !== null && k in counts) counts[k]++;
  }
  return counts;
}

/** Values of a free-text dimension present anywhere in the scope, newest first, capped like the old skip scan. */
function presentValues(rows: FacetRow[], keyOf: (r: FacetRow) => string | null): string[] {
  const seen: string[] = [];
  for (const row of rows) {
    const v = keyOf(row);
    if (v && v !== "" && !seen.includes(v)) seen.push(v);
    if (seen.length >= MAX_FACET_VALUES) break;
  }
  return seen.sort();
}

async function countFacets(supabase: Client, f: DesignListFilters, now: Date): Promise<{ total: number; facets: DesignFacets }> {
  // Scope = org + tab only. Which chips exist is decided here; the counts below apply the other filters.
  const scope: DesignListFilters = { ...f, model: null, product: null, theme: null, brand: null, time: null };
  const rows = await scanScope(supabase, scope, now);
  const cutoff = f.time ? timeCutoff(f.time, f.tzOffsetMin, now) : null;
  const countIf = (omit: FacetDim | undefined, extra?: (r: FacetRow) => boolean) =>
    rows.reduce((n, r) => n + (passes(r, f, omit, cutoff) && (!extra || extra(r)) ? 1 : 0), 0);

  const themes = presentValues(rows, (r) => r.theme);
  const brands = presentValues(rows, (r) => r.brand);
  const products = presentValues(rows, productOf).filter((k) => k in GALLERY_PRODUCT_LABELS);
  const ranges: TimeRange[] = ["today", "week", "month"];
  const rangeCutoffs = ranges.map((r) => timeCutoff(r, f.tzOffsetMin, now));

  return {
    total: countIf(undefined),
    facets: {
      // Model chips are all shown (showEmpty): every model key is counted, present or not.
      model: tally(rows, f, "model", (r) => r.model, Object.keys(GALLERY_MODEL_LABELS), cutoff),
      product: tally(rows, f, "product", productOf, products, cutoff),
      theme: tally(rows, f, "theme", (r) => r.theme, themes, cutoff),
      brand: tally(rows, f, "brand", (r) => r.brand, brands, cutoff),
      time: {
        all: countIf("time"),
        today: countIf("time", (r) => r.created_at >= rangeCutoffs[0]),
        week: countIf("time", (r) => r.created_at >= rangeCutoffs[1]),
        month: countIf("time", (r) => r.created_at >= rangeCutoffs[2]),
      },
      all: {
        model: countIf("model"),
        product: countIf("product"),
        theme: countIf("theme"),
        brand: countIf("brand"),
      },
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
  const assets = withSourceUrls(rows.slice(0, PAGE_SIZE), () => getDesignsPublicBase()); // rows with a saved original file also get source_url
  const last = assets[assets.length - 1] as { created_at: string; id: string } | undefined;
  const nextCursor = rows.length > PAGE_SIZE && last ? encodeCursor(last) : null;

  if (!opts.withCounts || opts.cursor) return { assets, nextCursor };
  const { total, facets } = await countFacets(supabase, f, now);
  return { assets, nextCursor, total, facets };
}
