/**
 * requireClientOrg() table-driven tests.
 *
 * Critic finding M8 (2026-08-29): this is the fail-closed gate portal.aware-wave.com's ~120
 * would-be-exposed admin-console routes depend on (see middleware.ts's isClientOutsidePortal),
 * and it shipped with zero coverage. Every row here must throw PortalAccessError EXCEPT the
 * one valid case -- a regression that silently makes any of these pass through would be a
 * privilege-escalation hole, not a cosmetic bug.
 */
import { describe, it, expect } from "vitest";
import { requireClientOrg, PortalAccessError } from "../tenant-guard";

const ORG = "aaaaaaaa-0000-4000-8000-00000000000a";
const req = (headers: Record<string, string>) => new Request("http://localhost/x", { headers });

describe("requireClientOrg — fail-closed table", () => {
  it.each([
    ["no headers at all", {}],
    ["user_kind absent, org_id present", { "x-ops-org-id": ORG }],
    ["user_kind = staff (the admin-console default)", { "x-ops-user-kind": "staff", "x-ops-org-id": ORG }],
    ["user_kind = Client (wrong case -- must not be treated as a match)", { "x-ops-user-kind": "Client", "x-ops-org-id": ORG }],
    ["user_kind = client, org_id absent", { "x-ops-user-kind": "client" }],
    ["user_kind = client, org_id empty string", { "x-ops-user-kind": "client", "x-ops-org-id": "" }],
    ["user_kind = client, org_id whitespace only", { "x-ops-user-kind": "client", "x-ops-org-id": "   " }],
  ])("throws PortalAccessError: %s", (_label, headers) => {
    expect(() => requireClientOrg(req(headers))).toThrow(PortalAccessError);
  });

  it("passes for user_kind=client with a real org_id", () => {
    const result = requireClientOrg(req({ "x-ops-user-kind": "client", "x-ops-org-id": ORG }));
    expect(result).toEqual({ userKind: "client", orgId: ORG });
  });

  it("trims surrounding whitespace on a valid org_id", () => {
    const result = requireClientOrg(req({ "x-ops-user-kind": "client", "x-ops-org-id": `  ${ORG}  ` }));
    expect(result.orgId).toBe(ORG);
  });

  it("accepts the { headers } shape as well as a real Request", () => {
    const result = requireClientOrg({ headers: new Headers({ "x-ops-user-kind": "client", "x-ops-org-id": ORG }) });
    expect(result.orgId).toBe(ORG);
  });
});
