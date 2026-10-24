// The periods a report can cover (mock v16 renderReporting: 上週 / 上個月 / 上一季; 去年 for the yearly report), as whole calendar days in the
// brand's time zone. Pure: the page and the server both ask here, so the preview and the saved report agree.
import { addDays, weekday } from "./time";

export const PRESETS = ["lastw", "lastm", "lastq", "lasty"] as const;
/** the longest period a report may cover: a year (the yearly report, leap years included); its daily rows are read page by page */
export const MAX_DAYS = 366;
export type Preset = (typeof PRESETS)[number];
export const isPreset = (v: unknown): v is Preset => (PRESETS as readonly unknown[]).includes(v);

const first = (y: number, m: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;

/** The scheduled reports (lib/social/reports.ts runPeriodReport, lib/schedules/jobs.ts): each kind is its own client job,
 *  switched and timed on its own. Pure data, so the browser page can list them too. */
export const REPORT_JOBS = {
  weekly: { job: "social_weekly_report", preset: "lastw", noun: "週報" },
  monthly: { job: "social_monthly_report", preset: "lastm", noun: "月報" },
  quarterly: { job: "social_quarterly_report", preset: "lastq", noun: "季報" },
  yearly: { job: "social_yearly_report", preset: "lasty", noun: "年報" },
} as const satisfies Record<string, { job: string; preset: Preset; noun: string }>;
export type ReportKind = keyof typeof REPORT_JOBS;

/** `today` = the brand's date now; the period always ends before today, so every day in it is over. */
export function presetPeriod(today: string, preset: Preset): { from: string; to: string } {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  if (preset === "lastw") {
    const monday = addDays(today, -(weekday(today) - 1));   // weekday(): 1 = Monday .. 7 = Sunday
    return { from: addDays(monday, -7), to: addDays(monday, -1) };
  }
  if (preset === "lasty") return { from: first(y - 1, 1), to: `${String(y - 1).padStart(4, "0")}-12-31` };
  if (preset === "lastm") return { from: m === 1 ? first(y - 1, 12) : first(y, m - 1), to: addDays(first(y, m), -1) };
  const q = Math.floor((m - 1) / 3);   // 0..3, this quarter
  return { from: q === 0 ? first(y - 1, 10) : first(y, (q - 1) * 3 + 1), to: addDays(first(y, q * 3 + 1), -1) };
}

/** Days from `from` to `to`, both included. */
export function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** A report's colour key (the mock's swatches, stored as a..e in social_reports.colour) -> the app token it paints with. */
export const COLOUR_VAR = { a: "--accent", b: "--p-ig", c: "--green", d: "--p-li", e: "--yellow" } as const;
export const REPORT_COLOURS = ["a", "b", "c", "d", "e"] as const;
