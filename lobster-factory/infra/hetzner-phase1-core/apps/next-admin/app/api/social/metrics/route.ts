// /api/social/metrics -- 數據分析 (SOCIAL_MANAGER_PLAN.md C24): a brand's channel numbers for the last 7 / 28 / 90 days
// and the period before, from the daily snapshots (lib/social/metrics.ts; 0105 social_metrics_daily). Read only.
//   GET ?brand&days=7|28|90[&account=<channel id>]   account absent = every channel of the brand
import { ANY_ROLE, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, uuid } from "@/lib/social/http";
import { PERIODS, loadAnalytics } from "@/lib/social/metrics";
import { SocialStoreError, listBrands } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    await requireBrandRole(req, brand, ANY_ROLE);
    const days = Number(q.get("days") ?? "28");
    if (!(PERIODS as readonly number[]).includes(days)) throw new BadRequest(`days must be one of ${PERIODS.join(", ")}`);
    const account = q.get("account") ? uuid(q.get("account"), "account") : null;
    const [b] = await listBrands([brand]);
    if (!b) throw new SocialStoreError(404, "no such brand");
    return { analytics: await loadAnalytics(brand, b.default_timezone, account, days) };
  });
}
