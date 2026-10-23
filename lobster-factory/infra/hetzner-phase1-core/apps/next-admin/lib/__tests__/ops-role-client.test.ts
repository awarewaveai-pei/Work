import { describe, expect, it } from "vitest";
import { CLIENT_PRODUCT_ROLE, canApproveCommand, canApproveMediaRelease, canChangeSystemMode, canCreateAiImageJob, canWriteTenantConfig, resolveOpsRole } from "../ops-role";

const req = (headers: Record<string, string>) => new Request("https://tarot.aware-wave.com/api/tools/tarot/generate", { headers });

// ADR 018 §2 開門規則 2: a customer uses its product door's features; staff roles stay staff-only.
describe("resolveOpsRole for a customer identity", () => {
  it("a client gets the product role whatever role it claims", () => {
    for (const claims of [{}, { "x-ops-claims-role": "owner" }, { "x-ops-claims-role": "admin" }, { "x-user-role": "viewer" }]) {
      expect(resolveOpsRole(req({ "x-ops-user-kind": "client", "x-ops-org-id": "org-1", ...claims }))).toEqual({ role: CLIENT_PRODUCT_ROLE, source: "client" });
    }
  });

  it("a client with no organization binding gets nothing", () => {
    expect(resolveOpsRole(req({ "x-ops-user-kind": "client", "x-ops-claims-role": "owner" }))).toEqual({ role: "viewer", source: "client" });
    expect(canCreateAiImageJob(resolveOpsRole(req({ "x-ops-user-kind": "client", "x-ops-org-id": " " })).role)).toBe(false);
  });

  it("a client may use paid product features but holds no owner/admin power", () => {
    const { role } = resolveOpsRole(req({ "x-ops-user-kind": "client", "x-ops-org-id": "org-1" }));
    expect(canCreateAiImageJob(role)).toBe(true);
    for (const staffOnly of [canApproveMediaRelease, canChangeSystemMode, canApproveCommand, canWriteTenantConfig]) expect(staffOnly(role), staffOnly.name).toBe(false);
  });

  it("staff resolution is unchanged: claims win, otherwise least privilege", () => {
    expect(resolveOpsRole(req({ "x-ops-user-kind": "staff", "x-ops-claims-role": "owner" }))).toEqual({ role: "owner", source: "claims" });
    expect(resolveOpsRole(req({ "x-ops-claims-role": "admin" }))).toEqual({ role: "admin", source: "claims" });
    // only the exact value middleware sets marks a client (lib/tenant-guard.ts userKindOf)
    expect(resolveOpsRole(req({ "x-ops-user-kind": "Client", "x-ops-claims-role": "viewer" }))).toEqual({ role: "viewer", source: "claims" });
  });
});
