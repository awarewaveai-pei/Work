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
import { requireClientOrg, PortalAccessError, effectiveOrgId, OrgAccessError } from "../tenant-guard";

const ORG = "aaaaaaaa-0000-4000-8000-00000000000a";
const ORG2 = "bbbbbbbb-0000-4000-8000-00000000000b";
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

/**
 * effectiveOrgId() uuid-format guard (2026-09-11). Root-cause fix for the class of bug found
 * in app/api/outreach/**: a client-supplied non-uuid string passed straight into
 * `.eq("organization_id", ...)` made Postgres throw 22P02, leaked as a raw 500. Every call site
 * of effectiveOrgId() already wraps it in `catch (e) { if (e instanceof OrgAccessError) ... }`,
 * so this reuses that error class rather than introducing a second one no caller catches yet.
 */
describe("effectiveOrgId — uuid-format guard (staff)", () => {
  const staffReq = req({ "x-ops-user-kind": "staff" });

  it("passes through a well-formed uuid unchanged", () => {
    expect(effectiveOrgId(staffReq, ORG)).toBe(ORG);
  });

  it("returns null when requestedOrgId is null (list-all, unchanged pre-existing behavior)", () => {
    expect(effectiveOrgId(staffReq, null)).toBeNull();
  });

  it("returns null when requestedOrgId is undefined (unchanged pre-existing behavior)", () => {
    expect(effectiveOrgId(staffReq, undefined)).toBeNull();
  });

  it("returns null (not empty string) when requestedOrgId is an empty string", () => {
    expect(effectiveOrgId(staffReq, "")).toBeNull();
  });

  it("returns null (not empty string) when requestedOrgId is whitespace-only", () => {
    expect(effectiveOrgId(staffReq, "   ")).toBeNull();
  });

  it("trims surrounding whitespace on an otherwise-valid uuid instead of rejecting it", () => {
    expect(effectiveOrgId(staffReq, `  ${ORG}  `)).toBe(ORG);
  });

  it.each([
    ["garbage text", "not-a-uuid"],
    ["sql-injection-shaped string", "'; DROP TABLE co_leads; --"],
    ["truncated uuid", "aaaaaaaa-0000-4000-8000"],
  ])("throws OrgAccessError for a malformed requestedOrgId: %s", (_label, bad) => {
    expect(() => effectiveOrgId(staffReq, bad)).toThrow(OrgAccessError);
  });
});

describe("effectiveOrgId — client callers are unaffected by the uuid guard", () => {
  it("ignores a malformed requestedOrgId entirely and returns the client's own org (IDOR guard predates and dominates the format check)", () => {
    const clientReq = req({ "x-ops-user-kind": "client", "x-ops-org-id": ORG });
    expect(effectiveOrgId(clientReq, "not-a-uuid")).toBe(ORG);
  });

  it("ignores a foreign well-formed uuid and returns the client's own org (unchanged pre-existing IDOR guard)", () => {
    const clientReq = req({ "x-ops-user-kind": "client", "x-ops-org-id": ORG });
    expect(effectiveOrgId(clientReq, ORG2)).toBe(ORG);
  });

  it("still throws OrgAccessError for a client account with no org binding (unchanged pre-existing behavior)", () => {
    const clientReq = req({ "x-ops-user-kind": "client" });
    expect(() => effectiveOrgId(clientReq, ORG)).toThrow(OrgAccessError);
  });
});
