// runForOrg: a schedule that works for one organization bills that organization, as the named actor, and cannot name
// another organization from inside.
import { describe, expect, it } from "vitest";
import { grantFor, runForOrg } from "../grant";
import type { SubjectStore } from "../subject";
import { CUSTOMER, INTERNAL, gateFixture } from "./gate-fixtures";

const OTHER = "33333333-3333-4333-8333-333333333333";
const store: SubjectStore = {
  byId: async (id) => (id === CUSTOMER.orgId || id === OTHER ? { id, parent_organization_id: null, kind: "customer" as const } : null),
  bySlug: async () => null,
  internal: async () => ({ id: INTERNAL.orgId, parent_organization_id: null, kind: "internal" as const }),
};

describe("runForOrg", () => {
  it("a library grantFor inside bills the organization the job works for, as the job's actor", async () => {
    const deps = gateFixture({ credits: true, balance: 50 }).deps;
    const grant = await runForOrg(CUSTOMER.orgId, "schedule:content_pipeline", () => grantFor("social.rewrite"), { deps, subjects: store });
    expect(grant.subject).toEqual(CUSTOMER);
    expect(grant.actor).toBe("schedule:content_pipeline");
  });

  it("naming another organization inside is refused", async () => {
    const deps = gateFixture({ credits: true, balance: 50 }).deps;
    await expect(runForOrg(CUSTOMER.orgId, "schedule:x", () => grantFor("social.rewrite", { orgId: OTHER }), { deps, subjects: store }))
      .rejects.toMatchObject({ code: "not_authorized_for_org" });
  });

  it("refuses an empty organization or the anonymous system actor", async () => {
    await expect(runForOrg("", "schedule:x", async () => 1)).rejects.toThrow("runForOrg");
    await expect(runForOrg(CUSTOMER.orgId, "system", async () => 1)).rejects.toThrow("runForOrg");
  });
});
