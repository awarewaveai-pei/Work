// Assembles the schedules table: every client x (registry jobs + site-watch), plus the read-only host
// rows on the all-clients view. One loader for /ops/schedules and the client page's 維護 tab.
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteWatchCells, SITE_WATCH_JOB } from "./adapters/site-watch";
import { hostStatusRows } from "./adapters/host-status";
import { CLIENT_JOBS } from "./jobs";
import { listSchedules } from "./store";
import type { ScheduleCell, SchedulesView } from "./types";

interface OrgRow {
  id: string;
  slug: string;
  name: string | null;
  status: string | null;
  site_url: unknown;
  chatwoot: unknown;
}

/** null = the slug names no client. */
export async function loadSchedulesView(sb: SupabaseClient, opts: { slug?: string; now?: Date } = {}): Promise<SchedulesView | null> {
  const now = opts.now ?? new Date();
  let q = sb.from("organizations").select("id, slug, name, status, site_url:metadata->client_config->site_url, chatwoot:metadata->client_config->chatwoot").order("name");
  if (opts.slug) q = q.eq("slug", opts.slug);
  const { data, error } = await q;
  if (error) throw new Error(`schedules_db:orgs:${error.message}`);
  const orgs = (data ?? []) as OrgRow[];
  if (opts.slug && !orgs.length) return null;

  const stored = await listSchedules(opts.slug ? orgs[0].id : undefined);
  const cells: ScheduleCell[] = [];
  for (const job of CLIENT_JOBS) {
    for (const org of orgs) {
      const row = stored.find((s) => s.organizationId === org.id && s.jobKey === job.key);
      const unavailable = job.unavailable?.({ siteUrl: org.site_url, chatwoot: org.chatwoot }) ?? null;
      cells.push(
        row
          ? { ...row, stored: true, version: null, unavailable }
          : {
              jobKey: job.key,
              organizationId: org.id,
              stored: false,
              enabled: false,
              ...job.defaults,
              lastRunAt: null,
              lastError: null,
              lastErrorAt: null,
              updatedBy: null,
              updatedAt: null,
              version: null,
              unavailable,
            },
      );
    }
  }
  cells.push(...(await siteWatchCells(sb, orgs.map((o) => ({ id: o.id, status: o.status, siteUrl: o.site_url })))));

  const today = now.toISOString().slice(0, 10);
  return {
    jobs: [...CLIENT_JOBS.map(({ key, label, description, cost, frequencies }) => ({ key, label, description, cost, frequencies })), SITE_WATCH_JOB],
    orgs: orgs.map((o) => ({ id: o.id, slug: o.slug, name: o.name ?? o.slug })),
    cells,
    system: opts.slug ? [] : await hostStatusRows(sb, now.getTime()),
    summary: {
      enabled: cells.filter((c) => c.enabled && !c.unavailable).length,
      ranToday: cells.filter((c) => c.lastRunAt?.slice(0, 10) === today).length,
      failing: cells.filter((c) => c.lastError).length,
    },
  };
}
