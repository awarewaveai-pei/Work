// /api/social/reports -- 報表管理 (SOCIAL_MANAGER_PLAN.md C25): a brand's saved reports (0105 social_reports; PDF = the print page).
//   GET     ?brand                                  the saved reports, newest first
//   GET     ?brand&preview=1&from&to&accounts=a,b   the numbers a report over these channels and days would show (the first-page preview)
//   POST    { brand, name, period_from, period_to, colour, account_ids, sections }   make one -> { id }
//   DELETE  ?brand&id
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { COLOURS, MAX_DAYS, REPORT_PARTS, createReport, deleteReport, listReports, loadReportData, type ReportColour, type ReportPart } from "@/lib/social/reports";
import { spanDays } from "@/lib/social/report-period";
import { SocialStoreError, listBrands } from "@/lib/social/store";
import { zoned } from "@/lib/social/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function day(v: unknown, name: string): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw new BadRequest(`${name} must be a date YYYY-MM-DD`);
  return v;
}
function period(from: unknown, to: unknown): { from: string; to: string } {
  const f = day(from, "from"), t = day(to, "to");
  const n = spanDays(f, t);
  if (n < 1 || n > MAX_DAYS) throw new BadRequest(`a report covers 1 to ${MAX_DAYS} days`);
  return { from: f, to: t };
}
function accountIds(v: unknown): string[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > 100) throw new BadRequest("pick at least one channel");
  return [...new Set(v.map((x) => uuid(x, "account")))];
}

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brandId = uuid(q.get("brand"), "brand");
    await requireBrandRole(req, brandId, ANY_ROLE);
    if (q.get("preview") !== "1") return { reports: await listReports(brandId) };
    const { from, to } = period(q.get("from"), q.get("to"));
    const [brand] = await listBrands([brandId]);
    if (!brand) throw new SocialStoreError(404, "no such brand");
    return { data: await loadReportData(brand, accountIds((q.get("accounts") ?? "").split(",").filter(Boolean)), from, to) };
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 1 || name.length > 120) throw new BadRequest("name must be 1..120 characters");
    const { from, to } = period(body.period_from, body.period_to);
    // a report covers whole days: one ending today or later could be saved but never opened (loadReportData refuses it)
    const [b] = await listBrands([brand]);
    if (!b) throw new SocialStoreError(404, "no such brand");
    if (to >= zoned(new Date(), b.default_timezone).date) throw new BadRequest("the last day must be before today");
    if (!COLOURS.includes(body.colour as ReportColour)) throw new BadRequest(`colour must be one of ${COLOURS.join(", ")}`);
    const sections = Array.isArray(body.sections) ? body.sections : [];
    if (!sections.every((s) => REPORT_PARTS.includes(s as ReportPart))) throw new BadRequest(`sections must be from ${REPORT_PARTS.join(", ")}`);
    const id = await createReport(brand, { name, period_from: from, period_to: to, colour: body.colour as ReportColour, account_ids: accountIds(body.account_ids), sections: [...new Set(sections)] as ReportPart[] }, actorOf(req));
    return { id };
  });
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    await deleteReport(brand, uuid(q.get("id"), "id"), actorOf(req));
    return {};
  });
}
