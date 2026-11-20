// Card R3: the saved designs (我的設計: media_assets rows the designs route made, metadata.source set) a video can open
// with -- a banner-tool card as a 片頭. Every read names the organization: another organization's design is never listed,
// never found by id (the ownership guard; app/api/internal/video/workbench/designs and the site setting use these).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OpenerDesign { id: string; url: string; name: string; source: string; createdAt: string }
const COLUMNS = "id, object_url, mime_type, created_at, metadata";
export const DESIGNS_LIMIT = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = { id: string; object_url: string | null; mime_type: string | null; created_at: string | null; metadata: Record<string, unknown> | null };
const toDesign = (r: Row): OpenerDesign | null =>
  r.object_url && String(r.mime_type ?? "").startsWith("image/") && r.metadata?.source
    ? { id: r.id, url: r.object_url, name: String(r.metadata.prompt || r.metadata.card_name || r.metadata.subject || r.metadata.source).slice(0, 60), source: String(r.metadata.source), createdAt: String(r.created_at ?? "") }
    : null;

// The rows 我的設計 shows (lib/studio/designs-list.ts applyFilters: our storage, made in the tools, the current version, not
// a per-ratio copy), images only, of one organization. Workbench shots and uploads are other domains and never listed.
const designRows = (db: SupabaseClient, organizationId: string) =>
  db.from("media_assets").select(COLUMNS).eq("organization_id", organizationId).eq("storage_backend", "r2")
    .eq("asset_domain", "ai_generated").eq("is_current", true).is("metadata->>variantOf", null).like("mime_type", "image/%");
const designsOf = (data: unknown) => ((data ?? []) as Row[]).map(toDesign).filter((d): d is OpenerDesign => !!d);

/** The organization's saved image designs, banner-tool cards first, each group newest first (at most `limit`). */
export async function orgDesigns(db: SupabaseClient, organizationId: string, limit = DESIGNS_LIMIT): Promise<OpenerDesign[]> {
  const banners = await designRows(db, organizationId).eq("metadata->>source", "banner").order("created_at", { ascending: false }).limit(limit);
  if (banners.error) throw new Error(`design lookup failed: ${banners.error.message}`);
  const first = designsOf(banners.data);
  if (first.length >= limit) return first;
  const rest = await designRows(db, organizationId).not("metadata->>source", "is", null).neq("metadata->>source", "banner")
    .order("created_at", { ascending: false }).limit(limit - first.length);
  if (rest.error) throw new Error(`design lookup failed: ${rest.error.message}`);
  return [...first, ...designsOf(rest.data)];
}

/** One design of this organization by id; null = not there (deleted, another organization's, not a design). */
export async function orgDesign(db: SupabaseClient, organizationId: string, id: string): Promise<OpenerDesign | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await designRows(db, organizationId).eq("id", id).maybeSingle();
  if (error) throw new Error(`design lookup failed: ${error.message}`);
  return data ? toDesign(data as Row) : null;
}

/** Which of `ids` are designs of this organization (one query). */
export async function orgDesignIds(db: SupabaseClient, organizationId: string, ids: string[]): Promise<Set<string>> {
  const wanted = ids.filter((id) => UUID.test(id));
  if (!wanted.length) return new Set();
  const { data, error } = await designRows(db, organizationId).in("id", wanted);
  if (error) throw new Error(`design lookup failed: ${error.message}`);
  return new Set(designsOf(data).map((d) => d.id));
}
