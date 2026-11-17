// Video projects (media_production_projects, 0071/0138/0164): the one check every writer runs before linking work to a project.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PROJECT_COLUMNS = "id, organization_id, title, production_mode, lifecycle_stage, autonomy, source, source_ref, formats, last_error, brief_json, active_story_bible_revision_id, active_candidate_asset_id, active_release_id, created_at, updated_at";
/** A finished video (成片) in a project: the one mime project-advance rows() and attachVideoAssets accept. */
export const FINISHED_VIDEO_MIME = "video/mp4";
type Row = Record<string, unknown>;
type Failure = { ok: false; error: string };

/** True only when the project exists and belongs to orgId; a bad id or an unreadable database is false (fail closed). */
export async function projectBelongsTo(projectId: string, orgId: string): Promise<boolean> {
  if (!UUID.test(projectId)) return false;
  const db = getSupabaseWriteClient();
  if (!db) return false;
  const { data, error } = await db.from("media_production_projects").select("organization_id").eq("id", projectId).maybeSingle();
  return !error && !!data && data.organization_id === orgId;
}

/**
 * The one project row of a workbench project (source='video_workbench', source_ref = its id): found, or created with
 * `insert` (production_mode etc.). 0164's unique index decides a race: the loser's 23505 reads the winner's row.
 * A changed title is written back; nothing else on an existing row changes.
 */
export async function ensureWorkbenchProject(db: SupabaseClient, org: string, sourceRef: string, title: string, insert: Row, options: { retitle?: boolean } = {}): Promise<{ ok: true; item: Row; created: boolean } | Failure> {
  const find = () => db.from("media_production_projects").select(PROJECT_COLUMNS)
    .eq("organization_id", org).eq("source", "video_workbench").eq("source_ref", sourceRef).maybeSingle();
  const retitle = async (row: Row): Promise<{ ok: true; item: Row; created: false } | Failure> => {
    if (row.title === title || options.retitle === false) return { ok: true, item: row, created: false };
    const updated = await db.from("media_production_projects").update({ title, updated_at: new Date().toISOString() })
      .eq("id", String(row.id)).eq("organization_id", org).select(PROJECT_COLUMNS).single();
    return updated.error ? { ok: false, error: updated.error.message } : { ok: true, item: updated.data as Row, created: false };
  };
  const found = await find();
  if (found.error) return { ok: false, error: found.error.message };
  if (found.data) return retitle(found.data as Row);
  const inserted = await db.from("media_production_projects").insert({
    lifecycle_stage: "create", brief_json: {}, ...insert,
    organization_id: org, source: "video_workbench", source_ref: sourceRef, title,
  }).select(PROJECT_COLUMNS).single();
  if (!inserted.error) return { ok: true, item: inserted.data as Row, created: true };
  if (inserted.error.code !== "23505") return { ok: false, error: inserted.error.message };
  const winner = await find();
  if (winner.error || !winner.data) return { ok: false, error: winner.error?.message ?? inserted.error.message };
  return retitle(winner.data as Row);
}

/** Links finished videos to a project: only org's own mp4 assets still unlinked (null → projectId, never a move). */
export async function attachVideoAssets(db: SupabaseClient, org: string, projectId: string, assetIds: string[]): Promise<{ ok: true; attached: string[] } | Failure> {
  if (!assetIds.length) return { ok: true, attached: [] };
  const { data, error } = await db.from("media_assets").update({ media_project_id: projectId })
    .eq("organization_id", org).in("id", assetIds).is("media_project_id", null).eq("mime_type", FINISHED_VIDEO_MIME).select("id");
  return error ? { ok: false, error: error.message } : { ok: true, attached: (data ?? []).map((r) => String(r.id)) };
}
