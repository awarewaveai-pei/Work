// POST /api/ops/clients/[slug]/operations { product, operatedBy: "customer" | "awarewave" } -- the client hub's 帳務
// tab switch 「客戶自己操作／AwareWave 代操」 (lib/entitlements/operations.ts, migration 0178). Staff owner/admin with the
// 帳務 tool only, the same people who may give or take a product there (staff-grant-outcome.ts). Written on the billing
// account: a brand resolves to its root, the account can() reads; an internal account is refused. Audited.
import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { staffOnly } from "@/lib/tenant-guard";
import { staffGrantOf, staffMayUseTool, staffUnrestricted } from "@/lib/staff-access";
import { recordOpsAudit } from "@/lib/ops-audit";
import { isCustomerKind, requestActor, resolveSubject } from "@/lib/entitlements/subject";
import { isOperator, setProductOperator } from "@/lib/entitlements/operations";
import { PRODUCTS } from "@/lib/portal/products";
import { HUB_TAB_TOOL } from "@/app/(shell)/ops/clients/[slug]/hub-tab-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

export async function POST(request: Request, context: Ctx) {
  const denied = staffOnly(request);   // a client identity never reaches /api/ops (middleware); checked again here
  if (denied) return denied;
  const who = resolveOpsRole(request);
  const grant = staffGrantOf(request.headers);
  if (!canWriteTenantConfig(who.role) || (!staffUnrestricted(grant) && !staffMayUseTool(grant!, HUB_TAB_TOOL["帳務"]))) {
    return fail(403, "forbidden_role");
  }
  const body = (await request.json().catch(() => null)) as { product?: unknown; operatedBy?: unknown } | null;
  const product = PRODUCTS.find((p) => p.key === body?.product);
  const operatedBy = body?.operatedBy;
  if (!product || !isOperator(operatedBy)) return fail(400, "invalid_body");
  const { slug } = await context.params;
  const account = await resolveSubject({ slug }).catch(() => null);
  if (!account) return fail(404, "client_not_found");
  if (!isCustomerKind(account.kind)) return fail(409, "internal_account");
  const outcome = await setProductOperator({ accountId: account.orgId, productKey: product.key, operatedBy, actor: requestActor(request) })
    .catch((e: unknown) => {
      console.error(`[operations] ${slug} ${product.key}: ${e instanceof Error ? e.message : String(e)}`);
      return "db_error";
    });
  if (outcome === "db_error") return fail(503, "db_error");
  if (outcome !== "set") return fail(409, outcome);
  await recordOpsAudit(account.orgId, who.role, who.source, "client_product_operator_set", {
    slug, product: product.key, operated_by: operatedBy, actor_user_id: request.headers.get("x-ops-user-id")?.trim() || null,
  });
  return NextResponse.json({ ok: true, product: product.key, operatedBy });
}
