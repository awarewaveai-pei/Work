// /api/social/reports/<id> -- one saved report with its numbers: what the print page (reports/[id]) draws.
//   GET   -> { report, data }   the caller needs a role on the report's brand (the id alone says nothing about the brand)
import { ANY_ROLE, requireBrandRole } from "@/lib/social/authz";
import { handle, uuid } from "@/lib/social/http";
import { getReport, loadReportData } from "@/lib/social/reports";
import { SocialStoreError, listBrands } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const id = uuid((await ctx.params).id, "id");
    const report = await getReport(id);
    if (!report) throw new SocialStoreError(404, "no such report");
    await requireBrandRole(req, report.organization_id, ANY_ROLE);
    const [brand] = await listBrands([report.organization_id]);
    if (!brand) throw new SocialStoreError(404, "no such brand");
    const { organization_id: _org, ...shown } = report;
    void _org;
    return { report: shown, data: await loadReportData(brand, report.account_ids, report.period_from, report.period_to) };
  });
}
