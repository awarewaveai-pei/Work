// Shapes shared by the schedules API and ScheduleTable (client component) — no server imports here.

export interface FrequencyOption {
  value: string;
  label: string;
  /** The hour picker applies to this frequency. */
  usesHour: boolean;
  /** The weekday picker applies to this frequency. */
  usesDay: boolean;
  /** The day-of-month picker (1-28, Taipei) applies to this frequency (monthly / quarterly / yearly). */
  usesDayOfMonth?: boolean;
}

export interface JobMeta {
  key: string;
  label: string;
  /** One sentence shown under the job's name: what it does. */
  description: string;
  /** What one run costs (paid APIs only; our own server is not counted). */
  cost: string;
  frequencies: FrequencyOption[];
}

/** One (job, client) cell of the schedules table. */
export interface ScheduleCell {
  jobKey: string;
  organizationId: string;
  /** false = no row yet; the values below are the job's defaults. */
  stored: boolean;
  enabled: boolean;
  frequency: string;
  hourUtc: number;
  dayOfWeekUtc: number;
  /** 1-28, Taipei calendar day; only meaningful for a frequency with usesDayOfMonth. */
  dayOfMonth: number;
  lastRunAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  /** Optimistic-concurrency version for jobs that have one (site_watch); null otherwise. */
  version: number | null;
  /** Why this cell cannot run even when enabled (no site URL, global switch off); null = can run. */
  unavailable: string | null;
}

/** A host-side schedule the app can only read (backup coverage, site-watch heartbeat, every host cron/timer). */
export interface SystemRow {
  key: string;
  label: string;
  /** What it does (static). `detail` is what it last reported. */
  description: string;
  /** In Taipei time, like the rest of the page. */
  cadence: string;
  lastAt: string | null;
  /** unregistered = on the host but not in HOST_JOBS; untracked = runs but reports no outcome (run-parts). */
  state: "ok" | "stale" | "missing" | "failed" | "unregistered" | "untracked";
  detail: string;
  /** Section the row is listed under (lib/schedules/host-jobs.ts HOST_GROUP_ORDER); none = listed first. */
  group?: "backup" | "deploy" | "site";
  /** Shown when the row is clicked. Values written by GPT to the operator's rule (WORKLOG 2026-10-16). */
  details: { what: string; when: string; where: string; look: string; lookHref: string; fail: string };
}

export interface ScheduleOrg {
  id: string;
  slug: string;
  name: string;
}

export interface SchedulesView {
  jobs: JobMeta[];
  orgs: ScheduleOrg[];
  cells: ScheduleCell[];
  system: SystemRow[];
  summary: { enabled: number; ranToday: number; failing: number };
}
