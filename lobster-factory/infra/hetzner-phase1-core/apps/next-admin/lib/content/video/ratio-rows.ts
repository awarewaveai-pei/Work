/**
 * Which finished videos ARE one video's ratios -- the one rule behind the release page, the social drafts (social-drafts-deps),
 * the draft outcome and the project auto-advance rows().
 *  - A video that belongs to a workbench project: every ratio is its own main row (no variantOf), so the ratios are the
 *    project's current finished videos, the newest of each ratio (plan U0.4: a re-render replaces the older one of its ratio).
 *  - A video without a project (the old pipeline): the row itself plus the rows whose metadata.variantOf points at it.
 *  - An old pipeline video later attached to a project is both: its project's cuts, plus its own variantOf rows for the ratios the project has no cut of.
 * The decision is pure (ratioRowsOf) so the page, which already holds the org's asset list, runs the SAME function as the server.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ratioOfAsset } from "./platform-ratio";

/** A finished video (成片) in a project: the one mime project-advance rows() and attachVideoAssets accept. */
export const FINISHED_VIDEO_MIME = "video/mp4";
export const RATIO_ROW_COLUMNS = "id, object_url, checksum_sha256, metadata, media_project_id, mime_type";

export type VideoRow = { id: string; object_url: string | null; checksum_sha256: string | null; metadata: { title?: string; script?: string; ratio?: unknown; variantOf?: string } | null; media_project_id?: string | null; mime_type?: string | null };
type Rated = { object_url?: string | null; metadata?: { ratio?: unknown } | null };
const ratioOf = (a: Rated) => (a.object_url ? ratioOfAsset({ object_url: a.object_url, metadata: a.metadata }) : undefined);

/** Newest first in, one row per ratio out (the first of each); a row with no readable ratio or no checksum never claims one. */
export function newestPerRatio<T extends Rated & { checksum_sha256?: string | null }>(rows: readonly T[]): Array<T & { ratio: string }> {
  const seen = new Set<string>();
  return rows.flatMap((a) => {
    const ratio = ratioOf(a);
    if (!ratio || !a.checksum_sha256 || seen.has(ratio)) return [];
    seen.add(ratio);
    return [{ ...a, ratio }];
  });
}

/** The ratio rows of `candidate` out of `pool` (rows newest first, as the queries return them). */
export function ratioRowsOf<T extends Rated & { id: string; checksum_sha256?: string | null; metadata?: { ratio?: unknown; variantOf?: string } | null; media_project_id?: string | null; mime_type?: string | null }>(candidate: { id: string; media_project_id?: string | null }, pool: readonly T[]): Array<T & { ratio: string }> {
  const project = candidate.media_project_id;
  const own = pool.filter((a) => a.id === candidate.id || a.metadata?.variantOf === candidate.id).flatMap((a) => { const ratio = ratioOf(a); return ratio ? [{ ...a, ratio }] : []; });
  if (!project) return own;
  const cuts = newestPerRatio(pool.filter((a) => a.media_project_id === project && a.mime_type === FINISHED_VIDEO_MIME));
  return [...cuts, ...own.filter((o) => !cuts.some((c) => c.ratio === o.ratio))];
}

/** A project's current finished videos, newest first -- the pool of ratioRowsOf for a project video, and what auto-advance rows() reads. */
export async function projectVideoRows(db: SupabaseClient, org: string, projectId: string): Promise<VideoRow[]> {
  const { data, error } = await db.from("media_assets").select(RATIO_ROW_COLUMNS).eq("organization_id", org).eq("media_project_id", projectId).eq("is_current", true).eq("mime_type", FINISHED_VIDEO_MIME).order("created_at", { ascending: false });
  if (error) throw new Error(`media_assets: ${error.message}`);
  return (data ?? []) as VideoRow[];
}

/** This video's ratio rows. Every query carries organization_id: another tenant's video id or project id yields nothing. */
export async function loadVideoRows(db: SupabaseClient, org: string, candidate: string): Promise<VideoRow[]> {
  const own = await db.from("media_assets").select(RATIO_ROW_COLUMNS).eq("organization_id", org).eq("mime_type", FINISHED_VIDEO_MIME).eq("id", candidate).maybeSingle();
  if (own.error) throw new Error(`media_assets: ${own.error.message}`);
  if (!own.data) return [];
  const row = own.data as VideoRow;
  const variants = await db.from("media_assets").select(RATIO_ROW_COLUMNS).eq("organization_id", org).eq("mime_type", FINISHED_VIDEO_MIME).eq("metadata->>variantOf", candidate);
  if (variants.error) throw new Error(`media_assets: ${variants.error.message}`);
  const pool = row.media_project_id ? [...(await projectVideoRows(db, org, row.media_project_id)), ...((variants.data ?? []) as VideoRow[])] : [row, ...((variants.data ?? []) as VideoRow[])];
  return ratioRowsOf(row, pool);
}
