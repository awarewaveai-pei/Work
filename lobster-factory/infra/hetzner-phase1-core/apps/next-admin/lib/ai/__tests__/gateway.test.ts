import { describe, expect, it, vi } from "vitest";
import { can, EntitlementRequired } from "@/lib/entitlements/can";
import { CUSTOMER, INTERNAL, gateFixture } from "@/lib/entitlements/__tests__/gate-fixtures";
import { loadAnthropic, loadGoogleGenerativeAI } from "../gateway";

describe("provider gateway", () => {
  it("gateway refuses a call without a grant", async () => {
    await expect(loadAnthropic(undefined as never)).rejects.toBeInstanceOf(EntitlementRequired);
    await expect(loadGoogleGenerativeAI(undefined as never)).rejects.toBeInstanceOf(EntitlementRequired);
    await expect(loadAnthropic({ allowed: true } as never)).rejects.toMatchObject({ code: "missing_grant" });
  });

  it("refuses a denied grant and loads the SDK for an allowed one", async () => {
    const denied = await can(CUSTOMER, "content.title", "ops:operator:u", gateFixture({ entitlement: null }).deps);
    await expect(loadAnthropic(denied)).rejects.toMatchObject({ code: "no_credits" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const allowed = await can(INTERNAL, "ops.inbox-ai", "system", gateFixture().deps);
    expect(typeof (await loadAnthropic(allowed))).toBe("function");
  });
});
