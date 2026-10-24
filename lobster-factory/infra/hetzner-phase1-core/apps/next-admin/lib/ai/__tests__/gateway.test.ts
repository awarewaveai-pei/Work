import { describe, expect, it, vi } from "vitest";
import { can, EntitlementRequired } from "@/lib/entitlements/can";
import { CUSTOMER, INTERNAL, gateFixture } from "@/lib/entitlements/__tests__/gate-fixtures";
import { loadAnthropic, loadGoogleGenerativeAI, providerUrl } from "../gateway";

describe("provider gateway", () => {
  it("gateway refuses a call without a grant", async () => {
    await expect(loadAnthropic(undefined as never)).rejects.toBeInstanceOf(EntitlementRequired);
    await expect(loadGoogleGenerativeAI(undefined as never)).rejects.toBeInstanceOf(EntitlementRequired);
    await expect(loadAnthropic({ allowed: true } as never)).rejects.toMatchObject({ code: "missing_grant" });
  });

  it("refuses a denied grant and loads the SDK for an allowed one", async () => {
    const denied = await can(CUSTOMER, "content.title", "ops:operator:u", gateFixture({ entitlement: null }).deps);
    await expect(loadAnthropic(denied)).rejects.toMatchObject({ code: "no_entitlement" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const allowed = await can(INTERNAL, "ops.inbox-ai", "system", gateFixture().deps);
    expect(typeof (await loadAnthropic(allowed))).toBe("function");
  });

  it("a grant reaching any paid seam records one usage row however often it is used, and never debits", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, audit, debit } = gateFixture({ credits: true, balance: 50 });
    const usage = () => audit.mock.calls.filter(([e]) => e.event === "entitlement.usage");
    const grant = await can(CUSTOMER, "content.title", "client:c:u", deps);
    await loadAnthropic(grant);
    await loadGoogleGenerativeAI(grant);
    providerUrl(grant, "replicate", "/v1/predictions/x");
    providerUrl(grant, "replicate", "/v1/predictions/x");
    expect(usage()).toHaveLength(1);
    expect(usage()[0][0]).toMatchObject({ featureKey: "content.title", subject: CUSTOMER, actor: "client:c:u", payload: { units: 0, source: "credits", provider: "anthropic" } });
    providerUrl(await can(CUSTOMER, "content.title", "client:c:u", deps), "openai", "/v1/x");
    expect(usage()).toHaveLength(2);
    expect(debit).not.toHaveBeenCalled();
  });
});
