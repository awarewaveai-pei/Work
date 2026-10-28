// Video projects (media_production_projects, 0071/0138): the one check every writer runs before linking work to a project.
import { getSupabaseWriteClient } from "@/lib/supabase-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True only when the project exists and belongs to orgId; a bad id or an unreadable database is false (fail closed). */
export async function projectBelongsTo(projectId: string, orgId: string): Promise<boolean> {
  if (!UUID.test(projectId)) return false;
  const db = getSupabaseWriteClient();
  if (!db) return false;
  const { data, error } = await db.from("media_production_projects").select("organization_id").eq("id", projectId).maybeSingle();
  return !error && !!data && data.organization_id === orgId;
}
