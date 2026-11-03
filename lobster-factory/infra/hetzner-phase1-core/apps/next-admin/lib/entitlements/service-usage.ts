import { PRODUCTS } from "@/lib/portal/products";
import { creditsForCost } from "./ledger";
import { EntitlementRequired, type GateDependencies, type Grant } from "./can";
import { runForOrg } from "./grant";
import type { SubjectStore } from "./subject";

// Usage a separate product service delivered (ADR 017 §4; the issuer.ts counterpart): the service asked for a permit
// before the work, and reports here once it succeeded. The charge goes through the same Grant.report every next-admin
// seam uses (one entitlement.usage row; credits debited from the billing account in enforce, never in shadow).
// Idempotent per job: the debit key is `<product>-job:<jobId>`, so a retried report never charges twice.
// `ask` = the product's own table of literal grantFor calls (registry-code.test.ts reads literal keys); null = not paid.

type Answer = { status: number; body: { ok: true; charged: number; shortfall: number } | { ok: false; reason: string } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOB = /^[A-Za-z0-9._:-]{1,128}$/;

export async function reportForService(productKey: string, input: unknown, ask: (featureKey: string) => (() => Promise<Grant>) | null,
  opts: { deps?: GateDependencies; subjects?: SubjectStore } = {}): Promise<Answer> {
  const refuse = (status: number, reason: string): Answer => ({ status, body: { ok: false, reason } });
  const body = (input ?? {}) as Record<string, unknown>;
  const { organization_id: org, feature_key: featureKey, actor, job_id: jobId, cost_usd: cost } = body;
  if (typeof org !== "string" || !UUID.test(org) || typeof featureKey !== "string" || typeof actor !== "string" || typeof jobId !== "string" || !JOB.test(jobId))
    return refuse(400, "invalid_request");
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0 || cost > 10_000) return refuse(400, "invalid_cost");
  if (!actor.startsWith(`${productKey}:`) || actor.length <= productKey.length + 1) return refuse(400, "actor_outside_product");
  if (!PRODUCTS.find((p) => p.key === productKey)?.features.some((f) => f.feature_key === featureKey)) return refuse(400, "feature_outside_product");
  const asker = ask(featureKey);
  if (!asker) return refuse(400, "feature_not_metered");
  try {
    const result = await runForOrg(org, actor, async () => {
      const grant = await asker();   // inside runForOrg: bills `org` as `actor`
      const meta = { job_id: jobId, cost_usd: cost };
      await grant.recordUse(meta);
      return grant.report({ units: creditsForCost(cost), idempotencyKey: `${productKey}-job:${jobId}`, meta });
    }, opts);
    return { status: 200, body: { ok: true, ...result } };
  } catch (error) {
    // Refused at report time (enforce): the wallet ran dry after the permit; the delivered work stays uncharged.
    if (error instanceof EntitlementRequired) return refuse(403, error.code);
    console.warn(`[entitlement] service usage failed: ${String(error).slice(0, 200)}`);
    return refuse(503, "infrastructure_error");
  }
}
