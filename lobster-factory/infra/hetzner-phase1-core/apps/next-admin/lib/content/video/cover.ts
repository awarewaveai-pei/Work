/**
 * Video covers (cards VD.2-VD.8, video-workbench/docs/video-deliverable-pack-spec-20261114.md §2). A cover is its own
 * media_assets image row with metadata.coverOf = the video row's id and coverKind = how it was made. Which cover a video
 * shows is decided here only, from the cover rows themselves: the newest metadata.chosenAt wins; none chosen = the
 * earliest-registered auto cover (the workbench registers its candidates best-first, one after another: video-workbench
 * backend/cover.cjs pickTimes + api.cjs settleOnce); none of those = the oldest cover. Every rule is "first by
 * (created_at, id)" or "newest chosenAt", so the bounded queries below can express it exactly. The video row is never written, so choosing
 * a cover can never clobber its title/script/ratio (written by other routes) and never changes what a Release pinned.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const COVER_KINDS = ["auto", "ai", "upload"] as const;
export type CoverKind = (typeof COVER_KINDS)[number];

export type CoverRow = { id: string; object_url: string | null; mime_type?: string | null; created_at?: string | null; metadata: { coverOf?: unknown; coverKind?: unknown; chosenAt?: unknown; vwJobId?: unknown } | null };
export type Cover = { id: string; url: string; kind: CoverKind; chosen: boolean };

const time = (v: unknown) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? Date.parse(v) : NaN);
const kindOf = (r: CoverRow): CoverKind => (COVER_KINDS.includes(r.metadata?.coverKind as CoverKind) ? r.metadata!.coverKind as CoverKind : "upload");

/** Every usable cover of one video, the chosen one marked (at most one). Rows of other videos or without a url are ignored. */
export function coversOf(videoId: string, rows: readonly CoverRow[]): Cover[] {
  const mine = rows.filter((r) => r.metadata?.coverOf === videoId && !!r.object_url && (!r.mime_type || r.mime_type.startsWith("image/")))
    .sort((a, b) => (time(a.created_at) || 0) - (time(b.created_at) || 0) || a.id.localeCompare(b.id));
  if (!mine.length) return [];
  const picked = [...mine].filter((r) => Number.isFinite(time(r.metadata?.chosenAt))).sort((a, b) => time(b.metadata?.chosenAt) - time(a.metadata?.chosenAt))[0]
    ?? mine.find((r) => kindOf(r) === "auto")
    ?? mine[0];
  return mine.map((r) => ({ id: r.id, url: r.object_url as string, kind: kindOf(r), chosen: r.id === picked.id }));
}

export const COVER_COLUMNS = "id, object_url, mime_type, created_at, metadata";

/** The chosen cover of one video, from at most three bounded queries (never an unbounded list a row cap could cut):
 *  the newest chosenAt, the oldest auto cover, the oldest cover. coversOf over those rows gives the same answer
 *  as coversOf over every cover row (each of its three rules picks one of them), so the rule stays in one place. */
export async function chosenCover(db: SupabaseClient, organizationId: string, videoId: string): Promise<Cover | null> {
  const base = () => db.from("media_assets").select(COVER_COLUMNS).eq("organization_id", organizationId).eq("metadata->>coverOf", videoId).like("mime_type", "image/%");
  const rows: CoverRow[] = [];
  for (const q of [
    base().not("metadata->>chosenAt", "is", null).order("metadata->>chosenAt", { ascending: false }).limit(1),
    base().eq("metadata->>coverKind", "auto").order("created_at", { ascending: true }).order("id", { ascending: true }).limit(1),
    base().order("created_at", { ascending: true }).order("id", { ascending: true }).limit(1),
  ]) {
    const { data, error } = await q;
    if (error) throw new Error(`cover lookup failed: ${error.message}`);
    rows.push(...((data ?? []) as CoverRow[]));
  }
  return coversOf(videoId, rows).find((c) => c.chosen) ?? null;
}

/** The chosen cover's url per video id (absent = the video has no cover). */
export async function chosenCovers(db: SupabaseClient, organizationId: string, videoIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of new Set(videoIds)) {
    const chosen = await chosenCover(db, organizationId, id);
    if (chosen) out.set(id, chosen.url);
  }
  return out;
}

/** The chosen cover of the video an approved Release delivers (card VD.8: the WordPress poster); null = none.
 *  Invariant: the Release belongs to the organization AND delivers the very file being embedded (its candidate row's
 *  object_url = videoUrl); a release id from the client never puts another video's cover on this one (Codex 52914185). */
export async function coverForRelease(db: SupabaseClient, organizationId: string, releaseId: string, videoUrl: string): Promise<string | null> {
  const { data, error } = await db.from("media_releases").select("candidate_asset_id").eq("id", releaseId).eq("organization_id", organizationId).maybeSingle();
  if (error) throw new Error(`release lookup failed: ${error.message}`);
  const video = (data as { candidate_asset_id?: string } | null)?.candidate_asset_id;
  if (!video) return null;
  const row = await db.from("media_assets").select("object_url").eq("id", video).eq("organization_id", organizationId).maybeSingle();
  if (row.error) throw new Error(`video lookup failed: ${row.error.message}`);
  if ((row.data as { object_url?: string } | null)?.object_url !== videoUrl) return null;
  return (await chosenCover(db, organizationId, video))?.url ?? null;
}
