// /api/social/reports/monthly -- the brand's automatic report switches (週報 / 月報 / 季報 / 年報). Each is the brand's
// client_schedules row for that report job (lib/social/reports.ts REPORT_JOBS, lib/schedules/jobs.ts), so the staff schedules
// page shows and controls the same rows (and sets the send day and hour). OFF until set. The path keeps its first name
// ("monthly") because lib/portal/__tests__/registry-code.test.ts lists it; it serves every report kind.
//   GET   ?brand                  -> { schedules: { weekly|monthly|quarterly|yearly: { enabled, lastRunAt, lastError, when } } }
//   PUT   { brand, kind, enabled } owners and editors; no kind = monthly (a page loaded before the four kinds existed)
// Both answers also carry `monthly` (that page reads it).
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { REPORT_JOBS, type ReportKind } from "@/lib/social/reports";
import { SocialStoreError } from "@/lib/social/store";
import { listSchedules, setScheduleEnabled, type StoredSchedule } from "@/lib/schedules/store";
import { clientJob } from "@/lib/schedules/jobs";
import { taipeiFromUtc } from "@/lib/schedules/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = Object.keys(REPORT_JOBS) as ReportKind[];
const DAYS = ["日", "一", "二", "三", "四", "五", "六"];

type Setting = Pick<StoredSchedule, "frequency" | "hourUtc" | "dayOfWeekUtc" | "dayOfMonth">;
/** When it is sent, in Taipei time: "每週一 09:00" / "每月 1 號 09:00" / "每季第一個月 1 號 09:00" / "每年 1 月 1 號 09:00". */
function whenText(kind: ReportKind, s: Setting): string {
  const tp = taipeiFromUtc(s.dayOfWeekUtc, s.hourUtc);
  const at = `${String(tp.hour).padStart(2, "0")}:00`;
  if (kind === "weekly") return `每週${DAYS[tp.day]} ${at}`;
  const lead = kind === "monthly" ? "每月" : kind === "quarterly" ? "每季第一個月" : "每年 1 月";
  return `${lead} ${s.dayOfMonth} 號 ${at}`;
}

const settingOf = (kind: ReportKind, rows: StoredSchedule[]) => rows.find((s) => s.jobKey === REPORT_JOBS[kind].job) ?? null;
const view = async (brand: string) => {
  const rows = await listSchedules(brand);
  return Object.fromEntries(KINDS.map((kind) => {
    const row = settingOf(kind, rows);
    const s: Setting = row ?? clientJob(REPORT_JOBS[kind].job)!.defaults;
    return [kind, { enabled: row?.enabled ?? false, lastRunAt: row?.lastRunAt ?? null, lastError: row?.lastError ?? null, when: whenText(kind, s) }];
  })) as Record<ReportKind, { enabled: boolean; lastRunAt: string | null; lastError: string | null; when: string }>;
};

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    await requireBrandRole(req, brand, ANY_ROLE);
    const schedules = await view(brand);
    return { schedules, monthly: schedules.monthly };
  });
}

export async function PUT(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    const kind = (body.kind ?? "monthly") as ReportKind;
    if (!KINDS.includes(kind)) throw new BadRequest(`kind must be one of ${KINDS.join(", ")}`);
    if (typeof body.enabled !== "boolean") throw new BadRequest("enabled must be true or false");
    const job = REPORT_JOBS[kind].job;
    // only the switch: the day and hour the staff set on the schedules page are never written from here
    const r = await setScheduleEnabled(brand, job, body.enabled, actorOf(req), clientJob(job)!.defaults);
    if (!r.ok) throw new SocialStoreError(500, `schedule: ${r.errors.join(",")}`);
    const schedules = await view(brand);
    return { schedules, monthly: schedules.monthly };
  });
}
