// K31: a topic a person started (「核准並開始」) or pressed 「發布」 on is finished by the system whether or not its brand's
// content_pipeline schedule is on. Every run-due firing (host cron, every 5 minutes) moves on the started topics of every
// organization whose schedule is off (tick.ts advanceStartedTopics: nothing started or planned; going out follows the
// site's publish mode, as with the schedule on); an
// organization whose schedule is on is left to its own content_pipeline run, which does the same and more. The press is
// the consent, so no client_schedules row is needed -- the same rule as the 「做到草稿」 video projects
// (lib/content/video/advance-auto-projects.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { STARTED_STATUSES } from "./tick";

export const TOPIC_ADVANCE_ACTOR = "system:content_topic_advance";

const PAGE = 1000; // PostgREST's default max-rows: read every page, or organizations past it are never seen

/** The organizations that have a started topic now. Throws on a read error. */
export async function startedTopicOrganizations(sb: SupabaseClient): Promise<string[]> {
  const orgs = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from("content_topics").select("organization_id")
      .in("status", STARTED_STATUSES).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`content_topic_advance:organizations:${error.message}`);
    for (const r of data ?? []) orgs.add(String(r.organization_id));
    if ((data ?? []).length < PAGE) return [...orgs];
  }
}

export interface TopicAdvanceDeps {
  /** One push of the organization's started topics (advanceStartedTopics with its stop notices); returns the summary. */
  advanceOrganization(organizationId: string): Promise<string>;
  /** The push itself failed (a read error): its topics would sit there unseen, so the operator hears of it. */
  failed(organizationId: string, error: string): Promise<void>;
  log(message: string): void;
}

// Organizations being advanced by this process: a firing still waiting on a video prepare when the next one starts must
// not prepare the same topic twice (the row guards keep it correct; this keeps it from being paid for twice).
const inFlight = new Set<string>();

/** Advances each organization in turn; one failing does not stop the next. Never throws. */
export async function advanceStartedOrganizations(deps: TopicAdvanceDeps, organizations: readonly string[]): Promise<string> {
  const lines: string[] = [];
  for (const org of organizations) {
    if (inFlight.has(org)) { lines.push(`${org.slice(0, 8)}: still advancing from an earlier firing`); continue; }
    inFlight.add(org);
    try {
      lines.push(`${org.slice(0, 8)}: ${await deps.advanceOrganization(org)}`);
    } catch (e) {
      const error = String(e).slice(0, 200);
      lines.push(`${org.slice(0, 8)}: error ${error}`);
      await deps.failed(org, error).catch((x) => deps.log(`[content_topic_advance] incident not raised: ${String(x)}`));
    } finally {
      inFlight.delete(org);
    }
  }
  const summary = lines.join("; ") || "no topics";
  deps.log(`[content_topic_advance] ${summary}`);
  return summary;
}
