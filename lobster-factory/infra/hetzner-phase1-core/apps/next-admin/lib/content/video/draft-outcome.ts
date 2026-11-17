import type { SupabaseClient } from "@supabase/supabase-js";

/** U6.4: read actual drafts, never infer completion from an approved Release alone. */
export async function readDraftOutcome(db: SupabaseClient, org: string, candidate: string) {
  const primary = await db.from("media_assets").select("id, object_url, checksum_sha256").eq("organization_id", org).eq("id", candidate).maybeSingle();
  if (primary.error) throw Error(primary.error.message);
  if (!primary.data) return null;
  const variants = await db.from("media_assets").select("id, object_url, checksum_sha256").eq("organization_id", org).eq("metadata->>variantOf", candidate);
  if (variants.error) throw Error(variants.error.message);
  const rows = [primary.data, ...(variants.data || [])], urls = rows.map((r) => r.object_url).filter(Boolean);
  const posts = urls.length ? await db.from("social_posts").select("id, state").eq("organization_id", org).in("source_url", urls) : { data: [], error: null };
  if (posts.error) throw Error(posts.error.message);
  const releases = await db.from("media_releases").select("id, candidate_asset_id, candidate_checksum").eq("organization_id", org).eq("status", "release_approved").in("candidate_asset_id", rows.map((r) => r.id));
  if (releases.error) throw Error(releases.error.message);
  const ids = (releases.data || []).filter((r) => rows.some((a) => a.id === r.candidate_asset_id && a.checksum_sha256 === r.candidate_checksum)).map((r) => r.id);
  const receipts = ids.length ? await db.from("media_delivery_attempts").select("id, external_id, status, response_json").eq("organization_id", org).eq("destination", "wordpress").in("release_id", ids) : { data: [], error: null };
  if (receipts.error) throw Error(receipts.error.message);
  const articles = (receipts.data || []).filter((r) => ["drafted", "published"].includes(r.status)).map((r) => ({
    title: String(r.response_json?.postTitle || "文章 #" + r.external_id),
    editUrl: typeof r.response_json?.editUrl === "string" && /^https:\/\//.test(r.response_json.editUrl) ? r.response_json.editUrl : null,
  }));
  return { drafts: (posts.data || []).filter((p) => p.state !== "deleted").map((p) => ({ id: String(p.id) })), articles };
}
