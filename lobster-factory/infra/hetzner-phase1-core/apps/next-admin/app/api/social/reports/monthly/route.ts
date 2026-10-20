// /api/social/reports/monthly -- the brand's 「每月 1 號自動寄給客戶」 switch. It is the brand's client_schedules row for
// social_monthly_report (lib/schedules/jobs.ts), so the staff schedules page shows and controls the same row. OFF until set.
//   GET   ?brand                -> { monthly: { enabled, lastRunAt, lastError } }
//   PUT   { brand, enabled }    owners and editors
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { MONTHLY_JOB } from "@/lib/social/reports";
import { SocialStoreError } from "@/lib/social/store";
import { listSchedules, upsertSchedule } from "@/lib/schedules/store";
import { clientJob } from "@/lib/schedules/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rowOf = async (brand: string) => (await listSchedules(brand)).find((s) => s.jobKey === MONTHLY_JOB);
const view = async (brand: string) => {
  const row = await rowOf(brand);
  return { enabled: row?.enabled ?? false, lastRunAt: row?.lastRunAt ?? null, lastError: row?.lastError ?? null };
};

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    await requireBrandRole(req, brand, ANY_ROLE);
    return { monthly: await view(brand) };
  });
}

export async function PUT(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    if (typeof body.enabled !== "boolean") throw new BadRequest("enabled must be true or false");
    // an hour the staff set on the schedules page stays; a brand with no row yet gets the job's default
    const d = (await rowOf(brand)) ?? clientJob(MONTHLY_JOB)!.defaults;
    const r = await upsertSchedule({ organizationId: brand, jobKey: MONTHLY_JOB, enabled: body.enabled, frequency: d.frequency, hourUtc: d.hourUtc, dayOfWeekUtc: d.dayOfWeekUtc, updatedBy: actorOf(req) });
    if (!r.ok) throw new SocialStoreError(500, `schedule: ${r.errors.join(",")}`);
    return { monthly: await view(brand) };
  });
}
