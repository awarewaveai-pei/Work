/**
 * V7.1: the video a content topic makes is also a video project (source content_topic, autonomy full_auto), so the
 * result pages list hand-made and automatic videos together. The project is only a record: the pipeline (topics/tick.ts)
 * still drives the video and its embeds. One project per topic, found again by source_ref on a retry.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type TopicRef = { id: string; organization_id: string; title: string };

export async function ensureTopicProject(sb: SupabaseClient, t: TopicRef, formats: readonly string[]): Promise<string> {
  const found = await sb.from("media_production_projects").select("id").eq("organization_id", t.organization_id)
    .eq("source", "content_topic").eq("source_ref", t.id).limit(1);
  if (found.error) throw new Error(`media_production_projects: ${found.error.message}`);
  if (found.data?.length) return String(found.data[0].id);
  const made = await sb.from("media_production_projects").insert({
    organization_id: t.organization_id, title: (t.title.trim() || "影片").slice(0, 180), production_mode: "quick_video",
    lifecycle_stage: "produce", source: "content_topic", source_ref: t.id, autonomy: "full_auto", formats: [...formats],
    brief_json: { title: t.title, topicId: t.id },
  }).select("id").single();
  if (made.error || !made.data) throw new Error(`media_production_projects: ${made.error?.message ?? "no row"}`);
  return String(made.data.id);
}

/** The topic's project follows its video: review once the video is in the drafts, last_error when it failed. Best effort: a record must not fail the topic. */
export async function updateTopicProject(sb: SupabaseClient | null, orgId: string, topicId: string, patch: { lifecycle_stage?: "review"; last_error?: string | null }): Promise<void> {
  if (!sb) return;
  const { error } = await sb.from("media_production_projects").update({ ...patch, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId).eq("source", "content_topic").eq("source_ref", topicId);
  if (error) console.warn("[topic-project] update failed:", error.message);
}
