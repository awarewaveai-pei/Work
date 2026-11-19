// N1: a topic's finished video passes the workbench's four-check review and is approved (one Release per ratio) before
// it goes into the article or onto the social draft. Same deps as a 「④ 後自動」 project (project-advance-deps.ts rows /
// qaProblems / release) and the same review loop (project-advance.ts reviewProblems): one gate, not a copy of it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { reviewProblems } from "@/lib/content/video/project-advance";
import { advanceDeps } from "@/lib/content/video/project-advance-deps";
import { FINISHED_VIDEO_MIME } from "@/lib/content/video/projects";
import { topicProjectId } from "@/lib/content/video/topic-project";

/** Reviews and releases every ratio of the topic's video and returns the Release id of `url` (the video being embedded).
 *  Throws a Chinese reason when anything stands against it, so nothing unreviewed is embedded. Safe to repeat: the
 *  checks are re-run on the same file and an approved ratio is not approved again (release()). */
export async function releaseTopicVideo(sb: SupabaseClient | null, t: { id: string; organization_id: string }, url: string, actor: string): Promise<string> {
  if (!sb) throw new Error("資料庫連不上，影片沒有審片，所以沒有嵌入");
  const org = t.organization_id;
  const projectId = await topicProjectId(sb, org, t.id);
  if (!projectId) throw new Error("這個題目沒有影片專案，影片沒有審片，所以沒有嵌入");
  const deps = advanceDeps(sb, org, actor);
  const rows = await deps.rows(projectId);
  const { data: asset, error } = await sb.from("media_assets").select("id").eq("organization_id", org).eq("media_project_id", projectId)
    .eq("object_url", url).eq("is_current", true).eq("mime_type", FINISHED_VIDEO_MIME).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`media_assets: ${error.message}`);
  const primary = rows.find((r) => r.id === asset?.id);
  if (!primary) throw new Error("影片做好了，但沒有記到這個題目的影片專案，沒有審片，所以沒有嵌入");
  const problems = await reviewProblems(deps, rows);
  if (problems.length) throw new Error(`影片審片沒過，沒有嵌入：${problems.join("；")}`);
  for (const r of rows) await deps.release(r);
  const { data: rel, error: relError } = await sb.from("media_releases").select("id").eq("organization_id", org).eq("candidate_asset_id", primary.id)
    .eq("candidate_checksum", primary.checksum).eq("status", "release_approved").limit(1).maybeSingle();
  if (relError) throw new Error(`media_releases: ${relError.message}`);
  if (!rel?.id) throw new Error("找不到主成片的核准紀錄（Release），影片沒有嵌入");
  return String(rel.id);
}
