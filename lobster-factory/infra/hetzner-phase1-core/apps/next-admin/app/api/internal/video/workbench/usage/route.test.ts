// video-workbench usage report (P6 L3): token deny paths fail closed; a report charges the billing account through
// Grant.report once per job id (a retry reuses the debit key); shadow never debits; scope = the video product only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CUSTOMER, INTERNAL, gateFixture } from "@/lib/entitlements/__tests__/gate-fixtures";
import type { SubjectStore } from "@/lib/entitlements/subject";

const gate = vi.hoisted(() => ({ deps: null as unknown }));
vi.mock("@/lib/entitlements/runtime", () => ({ runtimeGateDependencies: () => gate.deps }));
vi.mock("@/lib/entitlements/subject", async (orig) => {
  const real = await orig<typeof import("@/lib/entitlements/subject")>();
  const store: SubjectStore = {
    byId: async (id) => (id === CUSTOMER.orgId ? { id, parent_organization_id: null, kind: "customer" as const } : null),
    bySlug: async () => null,
    internal: async () => ({ id: INTERNAL.orgId, parent_organization_id: null, kind: "internal" as const }),
  };
  return { ...real, supabaseSubjectStore: () => store, resolveSubject: (hint: Parameters<typeof real.resolveSubject>[0], s?: SubjectStore) => real.resolveSubject(hint, s ?? store) };
});
import { POST } from "./route";
import { reportForService } from "@/lib/entitlements/service-usage";

const at = "http://next-admin:3000/api/internal/video/workbench/usage";
const post = (headers: Record<string, string>, body: unknown) => POST(new Request(at, { method: "POST", headers, body: JSON.stringify(body) }));
const auth = { authorization: "Bearer right-token" };
const report = { organization_id: CUSTOMER.orgId, feature_key: "video.bg-remove", actor: "video:user-1", job_id: "job-1", cost_usd: 0.011 };

beforeEach(() => { vi.stubEnv("VW_INTERNAL_TOKEN", "right-token"); });
afterEach(() => vi.unstubAllEnvs());

describe("/api/internal/video/workbench/usage", () => {
  it("VW_INTERNAL_TOKEN unset, no bearer or a wrong one: refused and nothing is charged", async () => {
    const f = gateFixture({ credits: true, balance: 50 }); gate.deps = f.deps;
    vi.stubEnv("VW_INTERNAL_TOKEN", "");
    expect((await post(auth, report)).status).toBe(401);
    vi.stubEnv("VW_INTERNAL_TOKEN", "right-token");
    for (const h of [{}, { authorization: "Bearer wrong" }]) expect((await post(h, report)).status).toBe(401);
    expect(f.debit).not.toHaveBeenCalled();
  });

  it("enforce + credits: debits the billing account once per job id and records the usage", async () => {
    const f = gateFixture({ credits: true, balance: 50 }); gate.deps = f.deps;
    const res = await post(auth, report);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, charged: 2 });   // 0.011 USD x 32 x 3 = 1.056 -> 2 credits
    expect(f.debit).toHaveBeenCalledWith({ orgId: CUSTOMER.orgId, units: 2, idempotencyKey: "video-job:job-1", featureKey: "video.bg-remove" });
    await post(auth, report);
    expect(f.debit.mock.calls.map((c) => c[0].idempotencyKey)).toEqual(["video-job:job-1", "video-job:job-1"]);   // ledger RPC is idempotent on the key
    expect(f.audit).toHaveBeenCalledWith(expect.objectContaining({ event: "entitlement.usage", featureKey: "video.bg-remove", actor: "video:user-1" }));
  });

  it("shadow records the usage but never debits", async () => {
    const f = gateFixture({ mode: "shadow", credits: true, balance: 50 }); gate.deps = f.deps;
    expect((await post(auth, report)).status).toBe(200);
    expect(f.debit).not.toHaveBeenCalled();
  });

  it("refuses a feature, actor or org outside the video product, and a bad cost", async () => {
    const f = gateFixture({ credits: true, balance: 50 }); gate.deps = f.deps;
    expect((await post(auth, { ...report, feature_key: "studio.remove-bg" })).status).toBe(400);
    expect((await post(auth, { ...report, actor: "cognitive:user-1" })).status).toBe(400);
    expect((await post(auth, { ...report, organization_id: "nope" })).status).toBe(400);
    expect((await post(auth, { ...report, cost_usd: -1 })).status).toBe(400);
    // Even an ask table that would ask it: another product's feature is never charged through this product's service.
    const asked = vi.fn();
    expect((await reportForService("video", { ...report, feature_key: "studio.remove-bg" }, () => asked)).status).toBe(400);
    expect(asked).not.toHaveBeenCalled();
    expect(f.debit).not.toHaveBeenCalled();
  });
});
