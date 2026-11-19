// One operator notice per stopped item (a video project, a topic): which one, where it stopped, why, where to deal with it.
// The single home of the Chinese step/status names, titles and fingerprints, so the video advance, the topic queue and the
// schedule sweep all word a stop the same way. Same channel as every schedule incident: ingestIncident -> Telegram/Slack.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestIncident } from "@/lib/ops-inbox/ingest";
import { productHost, staffHosts } from "@/lib/portal/hosts";
import { PRODUCTS } from "@/lib/portal/products";
import type { TickDeps } from "@/lib/content/topics/tick";

/** lifecycle_stage of a video project, as the operator knows the step. */
export const VIDEO_STAGE_LABEL: Record<string, string> = { create: "建立", produce: "製作影片", review: "審核", release: "發布", measure: "成效" };
/** The topic statuses that stop a topic and ask for a person. */
export const TOPIC_STOP_LABEL: Record<string, string> = { failed: "失敗", proposed: "退回待確認" };

export interface Notice { title: string; message: string; fingerprint: string; jobKey: string; raw: Record<string, unknown> }

/** The workbench opens one project only with both project and episode (video-workbench scripts/index-1.js). */
export function videoProjectUrl(sourceRef: string, episodeId: string): string {
  const host = productHost(PRODUCTS.find((p) => p.key === "video")!);
  return `https://${host}/?${new URLSearchParams({ open: "projects", project: sourceRef, episode: episodeId })}`;
}

/** Same project + same step = same fingerprint (one notice); a later stop at another step notifies again. */
export function videoStopNotice(p: { projectId: string; title: string; stage: string; why: string; sourceRef: string; episodeId: string }): Notice {
  const step = VIDEO_STAGE_LABEL[p.stage] ?? p.stage;
  return {
    jobKey: "video_project_advance",
    fingerprint: `video_project_advance:${p.projectId}:${p.stage}`,
    title: `影片〈${p.title}〉停在${step}：${p.why}`.slice(0, 200),
    message: `影片〈${p.title}〉停在${step}\n原因：${p.why}\n處理：${videoProjectUrl(p.sourceRef, p.episodeId)}`,
    raw: { project_id: p.projectId, stage: p.stage, why: p.why },
  };
}

export function topicStopNotice(t: { id: string; title: string; status: string; why: string }): Notice {
  const state = TOPIC_STOP_LABEL[t.status] ?? t.status;
  return {
    jobKey: "content_pipeline",
    fingerprint: `content_pipeline:${t.id}:${t.status}`,
    title: `題目〈${t.title}〉停在${state}：${t.why}`.slice(0, 200),
    message: `題目〈${t.title}〉停在${state}\n原因：${t.why}\n處理：https://${staffHosts()[0]}/tools/content/topics`,
    raw: { topic_id: t.id, status: t.status, why: t.why },
  };
}

export async function raiseNotice(sb: SupabaseClient, organizationId: string, n: Notice): Promise<void> {
  const { data: org } = await sb.from("organizations").select("slug").eq("id", organizationId).maybeSingle();
  const r = await ingestIncident(sb, {
    source: "schedule",
    external_id: n.fingerprint,
    fingerprint: n.fingerprint,
    signal_type: "error",
    severity: "medium",
    service: "schedules",
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    title: n.title,
    message: n.message,
    raw: { ...n.raw, organization_id: organizationId },
    tags: { job_key: n.jobKey },
    client_slug: (org?.slug as string | undefined) ?? null,
  });
  if (r.error) console.error(`[schedules] notice for ${n.fingerprint} failed: ${r.error}`);
}

/** tickTopics' deps with one notice for every topic that lands in failed / proposed with a reason (the tick's state machine
 *  is untouched: only the write is watched). A notice that cannot be raised never fails the move. */
export function withTopicStopNotices(deps: TickDeps, raise: (n: Notice) => Promise<void>): TickDeps {
  return {
    ...deps,
    async move(t, to, patch) {
      const moved = await deps.move(t, to, patch);
      const why = patch?.last_error;
      if (moved && why && (to === "failed" || to === "proposed")) {
        await raise(topicStopNotice({ id: moved.id, title: moved.title, status: to, why })).catch((e) => console.error(`[content_pipeline] notice not raised: ${String(e)}`));
      }
      return moved;
    },
  };
}
