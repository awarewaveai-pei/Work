/**
 * V7.1: the video a content topic makes is also a video project (source content_topic, autonomy full_auto), so the
 * result pages list hand-made and automatic videos together. The project is only a record: the pipeline (topics/tick.ts)
 * still drives the video and its embeds. One project per topic, found again by source_ref on a retry.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

/** Keep the actual generated scenes after temporary render inputs and the job expire. Old rows stay intact. */
export async function saveTopicVideoScenes(org: string, project: string, scenes: { narration: string; image_prompt: string }[]): Promise<void> {
  try {
    const sb = getSupabaseWriteClient();
    if (!sb) throw Error("db unavailable");
    for (let i = 0; i < 3; i++) {
      const row = await sb.from("media_production_projects").select("brief_json,updated_at").eq("id", project).eq("organization_id", org).eq("source", "content_topic").maybeSingle();
      if (row.error) throw Error(row.error.message);
      if (!row.data) return;
      const saved = await sb.from("media_production_projects").update({ brief_json: { ...row.data.brief_json, videoScenes: scenes }, updated_at: new Date().toISOString() })
        .eq("id", project).eq("organization_id", org).eq("source", "content_topic").eq("updated_at", row.data.updated_at).select("id");
      if (saved.error) throw Error(saved.error.message);
      if (saved.data?.length) return;
    }
    throw Error("project changed during scene save");
  } catch (e) { console.warn("[topic-project] scenes not saved; editing unavailable:", e instanceof Error ? e.message : e); }
}

type TopicRef = { id: string; organization_id: string; title: string };

/** The topic's video project, null = none was made (startVideoJob logs a failed projectFor and goes on). */
export async function topicProjectId(sb: SupabaseClient, orgId: string, topicId: string): Promise<string | null> {
  const found = await sb.from("media_production_projects").select("id").eq("organization_id", orgId)
    .eq("source", "content_topic").eq("source_ref", topicId).limit(1);
  if (found.error) throw new Error(`media_production_projects: ${found.error.message}`);
  return found.data?.length ? String(found.data[0].id) : null;
}

export async function ensureTopicProject(sb: SupabaseClient, t: TopicRef, formats: readonly string[]): Promise<string> {
  const existing = await topicProjectId(sb, t.organization_id, t.id);
  if (existing) return existing;
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
