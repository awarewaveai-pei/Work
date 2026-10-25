// Host-schedule alerts (handoffs/2026-10-25-schedules-off-trigger C4.2/C4.3): one message when a row on /ops/schedules
// turns red, one when it recovers, nothing while it stays red; plus a daily line, so silence means "alerts broken",
// never "all fine". The judge is hostStatusRows -- the rows the page shows. The episode is an ops_incidents row
// (fingerprint host-schedule:<key>; open = alerted), written only after the message went out, so a failed send is
// retried by the next run. Sent directly, not via the inbox dispatcher: it re-sends a still-open incident every
// 15 min (notify/rules.ts duplicate_occurrence), which is exactly the repeat this must not do (same as site_watch).
import { HOST_UI } from "./host-jobs";
import type { SystemRow } from "./types";

export const ALERT_STATES: ReadonlyArray<SystemRow["state"]> = ["failed", "stale"];
export const FINGERPRINT_PREFIX = "host-schedule:";
/** Rows whose fault makes every other host row unreliable: the inventory file is unreadable, or its producer stalled. */
const REPORTER_KEYS = ["host_schedules", "host_schedules_report"];

export interface OpenEpisode {
  id: string;
  key: string;
  title: string;
}

export interface AlertPlan {
  red: SystemRow[];
  recovered: OpenEpisode[];
}

/** host_schedules is the "list file unreadable" row (state missing): a fault of its own, not a job without a record. */
export const isRed = (r: SystemRow): boolean => ALERT_STATES.includes(r.state) || (r.key === "host_schedules" && r.state !== "ok");
const settled = (r: SystemRow): boolean => r.state === "ok" || r.state === "untracked";

/**
 * Pure. Red = a row now red with no episode (open, investigating or ignored -- an ignore is the operator's call).
 * Recovered = an episode whose row is listed AND settled; a row that is missing, unregistered or gone keeps its
 * episode, because nothing proves it recovered. When the reporter itself is down every other row only echoes that,
 * so the reporter alone is alerted and nothing else changes.
 */
export function planAlerts(rows: SystemRow[], open: OpenEpisode[]): AlertPlan {
  const openKeys = new Set(open.map((o) => o.key));
  const reporter = rows.find((r) => REPORTER_KEYS.includes(r.key) && isRed(r));
  if (reporter) return { red: openKeys.has(reporter.key) ? [] : [reporter], recovered: [] };
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return {
    red: rows.filter((r) => isRed(r) && !openKeys.has(r.key)),
    recovered: open.filter((o) => {
      const r = byKey.get(o.key);
      return !!r && settled(r);
    }),
  };
}

const STATE_TEXT: Record<SystemRow["state"], string> = {
  ok: HOST_UI.state_ok,
  failed: HOST_UI.state_failed,
  stale: HOST_UI.state_stale,
  missing: HOST_UI.state_missing,
  unregistered: HOST_UI.state_unregistered,
  untracked: HOST_UI.state_untracked,
};

function line(r: SystemRow): string {
  return `• ${r.label}：${STATE_TEXT[r.state]}${r.detail ? `（${r.detail}）` : ""}`;
}

export function formatChange(plan: AlertPlan, pageUrl: string): string {
  const parts: string[] = [];
  if (plan.red.length) parts.push([`⚠️ 排程異常（${plan.red.length}）`, ...plan.red.map(line)].join("\n"));
  if (plan.recovered.length) parts.push([`✅ 排程恢復（${plan.recovered.length}）`, ...plan.recovered.map((o) => `• ${o.title}`)].join("\n"));
  return `${parts.join("\n\n")}\n\n${pageUrl}`;
}

/** Rows that need a look: anything not ok, except the two states that are not faults (untracked = by design). */
export function formatDigest(rows: SystemRow[], pageUrl: string): string {
  const attention = rows.filter((r) => r.state !== "ok" && r.state !== "untracked");
  const head = attention.length
    ? `📋 每日排程報告：共 ${rows.length} 個排程，${attention.length} 個需要注意`
    : `📋 每日排程報告：${rows.length} 個排程全部正常`;
  return [head, ...attention.map(line), "", pageUrl].join("\n");
}

export interface Delivery {
  /** At least one configured channel took the message. */
  delivered: boolean;
  /** Every configured channel took it, and at least one was configured. */
  complete: boolean;
  channels: Record<string, string>;
}

export interface AlertDeps {
  rows: () => Promise<SystemRow[]>;
  openEpisodes: () => Promise<OpenEpisode[]>;
  /** Keys that ever had an episode (any status): a red row with one is a reopen. */
  knownKeys: () => Promise<Set<string>>;
  send: (text: string) => Promise<Delivery>;
  openEpisode: (row: SystemRow, reopen: boolean) => Promise<string | null>;
  resolveEpisode: (id: string) => Promise<string | null>;
  pageUrl: string;
}

export interface AlertResult {
  ok: boolean;
  red: number;
  recovered: number;
  channels?: Record<string, string>;
  errors?: string[];
}

/** One run: plan, send, then record. Nothing changed = nothing sent. Nothing delivered = nothing recorded (retried). */
export async function runScheduleAlerts(deps: AlertDeps): Promise<AlertResult> {
  try {
    const plan = planAlerts(await deps.rows(), await deps.openEpisodes());
    if (!plan.red.length && !plan.recovered.length) return { ok: true, red: 0, recovered: 0 };
    const d = await deps.send(formatChange(plan, deps.pageUrl));
    if (!d.delivered) return { ok: false, red: plan.red.length, recovered: plan.recovered.length, channels: d.channels, errors: ["not_delivered"] };
    const known = await deps.knownKeys();
    const errors: string[] = [];
    for (const r of plan.red) {
      const e = await deps.openEpisode(r, known.has(r.key));
      if (e) errors.push(`open:${r.key}:${e}`);
    }
    for (const o of plan.recovered) {
      const e = await deps.resolveEpisode(o.id);
      if (e) errors.push(`resolve:${o.key}:${e}`);
    }
    // ok = delivered and recorded. A channel that stays broken is the digest's to report (it needs every channel):
    // failing here would turn this job's own row red, alert about itself, and loop.
    return { ok: !errors.length, red: plan.red.length, recovered: plan.recovered.length, channels: d.channels, ...(errors.length ? { errors } : {}) };
  } catch (e) {
    return { ok: false, red: 0, recovered: 0, errors: [String(e).slice(0, 200)] };
  }
}

export async function runScheduleDigest(deps: Pick<AlertDeps, "rows" | "send" | "pageUrl">): Promise<AlertResult> {
  try {
    const rows = await deps.rows();
    const d = await deps.send(formatDigest(rows, deps.pageUrl));
    return { ok: d.complete, red: rows.filter((r) => ALERT_STATES.includes(r.state)).length, recovered: 0, channels: d.channels };
  } catch (e) {
    return { ok: false, red: 0, recovered: 0, errors: [String(e).slice(0, 200)] };
  }
}
