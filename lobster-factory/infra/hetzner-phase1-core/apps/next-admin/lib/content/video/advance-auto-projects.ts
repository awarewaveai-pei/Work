// 「做到草稿」 projects (autonomy = auto_after_render) move on by themselves: every run-due firing (host cron, every
// 5 minutes) advances them for every organization that has one. Pressing the button is the consent and carries the
// spend cap (brief_json.autoBudget), so no client_schedules row has to be switched on as well -- it used to be a client
// job (video_project_advance) that no organization had enabled, and every such project stopped at the finished video.
// guided and full_auto projects are not touched here (full_auto belongs to the topic queue, lib/content/topics).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdvanceOutcome } from "./project-advance";

export const AUTO_ADVANCE_STAGES = ["create", "produce", "review", "release"] as const;
/** Projects that actually move (done or stopped) per organization per firing, oldest update first (as the client job did). */
export const AUTO_ADVANCE_PER_ORG = 3;
/** Candidates read per page. A project still `waiting` for its video does not use up a slot, so a firing reads page after
 *  page (oldest update first) until three have moved or none are left: a fixed cap would let that many waiting
 *  projects hide every later one forever. Paged because PostgREST returns at most 1000 rows per request. */
export const AUTO_ADVANCE_CANDIDATES = 20;
export const AUTO_ADVANCE_ACTOR = "system:video_project_advance";

/** An outcome plus what the operator notice needs to name the project. */
export type ProjectOutcome = AdvanceOutcome & { title: string; sourceRef: string; episodeId: string };
/** One stopped project (stage + why, already in its last_error), or an advance that failed outright (a read error: its
 *  projects would sit there unseen). */
export type AdvanceReport = { kind: "stopped"; projectId: string; title: string; stage: string; why: string; sourceRef: string; episodeId: string } | { kind: "failed"; error: string };

export interface AutoAdvanceDeps {
  advanceOrganization(organizationId: string): Promise<ProjectOutcome[]>;
  /** How the operator hears of a stop: one call per stopped project, so each is its own notice. */
  report(organizationId: string, r: AdvanceReport): Promise<void>;
  log(message: string): void;
}

const PAGE = 1000; // PostgREST's default max-rows (infra/supabase/docker-compose.yml): read every page, or orgs past it are never seen

/** The organizations that have a project to advance now. Throws on a read error. */
export async function autoAdvanceOrganizations(sb: SupabaseClient): Promise<string[]> {
  const orgs = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from("media_production_projects").select("organization_id")
      .eq("autonomy", "auto_after_render").in("lifecycle_stage", [...AUTO_ADVANCE_STAGES]).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`video_project_advance:organizations:${error.message}`);
    for (const r of data ?? []) orgs.add(String(r.organization_id));
    if ((data ?? []).length < PAGE) return [...orgs];
  }
}

// Organizations being advanced by this process. A firing still writing drafts when the next one (5 minutes on) starts
// must not advance the same projects twice (two paid copy asks, two drafts). next-admin runs as one container.
const inFlight = new Set<string>();

/** Advances each organization in turn; one organization failing does not stop the next. Never throws. */
export async function advanceAutoProjects(deps: AutoAdvanceDeps, organizations: readonly string[]): Promise<string> {
  const lines: string[] = [];
  for (const org of organizations) {
    if (inFlight.has(org)) { lines.push(`${org.slice(0, 8)}: still advancing from an earlier firing`); continue; }
    inFlight.add(org);
    try {
      const outcomes = await deps.advanceOrganization(org);
      const stopped = outcomes.filter((o) => o.result === "stopped");
      for (const o of stopped) {
        await deps.report(org, { kind: "stopped", projectId: o.projectId, title: o.title, stage: o.stage ?? "review", why: o.note, sourceRef: o.sourceRef, episodeId: o.episodeId })
          .catch((x) => deps.log(`[video_project_advance] incident not raised: ${String(x)}`));
      }
      const waiting = outcomes.filter((o) => o.result === "waiting").length;
      lines.push(`${org.slice(0, 8)}: ${outcomes.map((o) => `${o.projectId.slice(0, 8)} ${o.result}`).join(", ") || "no projects"}${waiting ? ` (skipped ${waiting} waiting)` : ""}`);
    } catch (e) {
      const error = String(e).slice(0, 200);
      lines.push(`${org.slice(0, 8)}: error ${error}`);
      await deps.report(org, { kind: "failed", error }).catch((x) => deps.log(`[video_project_advance] incident not raised: ${String(x)}`));
    } finally {
      inFlight.delete(org);
    }
  }
  const summary = lines.join("; ") || "no projects";
  deps.log(`[video_project_advance] ${summary}`);
  return summary;
}

/** The database-backed deps (the body of the former client job, lib/schedules/jobs.ts). */
export function autoAdvanceDeps(sb: SupabaseClient, raise: (organizationId: string, r: AdvanceReport) => Promise<void>): AutoAdvanceDeps {
  return {
    async advanceOrganization(organizationId) {
      const [{ advanceProject }, { advanceDeps }, { parseAutoBudget }] = await Promise.all([import("./project-advance"), import("./project-advance-deps"), import("./auto-run-budget")]);
      const deps = advanceDeps(sb, organizationId, AUTO_ADVANCE_ACTOR);
      const outcomes: ProjectOutcome[] = [];
      let moved = 0;
      let waiting = 0; // moved projects leave the auto set (stage measure / guided), waiting ones stay: the next page starts after them
      while (moved < AUTO_ADVANCE_PER_ORG) {
        const { data, error } = await sb.from("media_production_projects").select("id, title, source_ref, updated_at, brief_json").eq("organization_id", organizationId)
          .eq("autonomy", "auto_after_render").in("lifecycle_stage", [...AUTO_ADVANCE_STAGES]).order("updated_at").order("id").range(waiting, waiting + AUTO_ADVANCE_CANDIDATES - 1);
        if (error) throw new Error(`video_project_advance:${error.message}`);
        const page = data ?? [];
        for (const p of page) {
          if (moved >= AUTO_ADVANCE_PER_ORG) break;
          const outcome: ProjectOutcome = { ...await advanceProject(deps, { id: String(p.id), organizationId, title: String(p.title), updatedAtMs: Date.parse(String(p.updated_at)), runId: parseAutoBudget((p.brief_json as { autoBudget?: unknown } | null)?.autoBudget)?.runId }), title: String(p.title), sourceRef: String(p.source_ref ?? ""), episodeId: parseAutoBudget((p.brief_json as { autoBudget?: unknown } | null)?.autoBudget)?.episodeId ?? "" };
          outcomes.push(outcome);
          if (outcome.result === "waiting") waiting++; else moved++;
        }
        if (page.length < AUTO_ADVANCE_CANDIDATES) break;
      }
      return outcomes;
    },
    report: raise,
    log: (message) => console.info(message),
  };
}
