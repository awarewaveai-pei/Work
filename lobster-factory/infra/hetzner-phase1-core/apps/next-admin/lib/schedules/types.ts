// Shapes shared by the schedules API and ScheduleTable (client component) — no server imports here.

export interface FrequencyOption {
  value: string;
  label: string;
  /** The hour picker applies to this frequency. */
  usesHour: boolean;
  /** The weekday picker applies to this frequency. */
  usesDay: boolean;
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

/** A host-side schedule the app can only read (backup coverage, site-watch heartbeat). */
export interface SystemRow {
  key: string;
  label: string;
  /** What it does (static). `detail` is what it last reported. */
  description: string;
  /** In Taipei time, like the rest of the page. */
  cadence: string;
  lastAt: string | null;
  state: "ok" | "stale" | "missing" | "failed";
  detail: string;
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
