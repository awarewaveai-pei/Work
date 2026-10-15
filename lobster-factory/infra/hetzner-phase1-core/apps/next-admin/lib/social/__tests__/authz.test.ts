import { describe, expect, it, vi } from "vitest";

const memberRoles = vi.fn();
vi.mock("../store", () => ({ memberRoles: (id: string) => memberRoles(id) }));

import { actorForViewer, actorOf, callerOf, requireBrandRole, requireStaffForNewChannel, roleOn, type Caller } from "../authz";
import type { BrandRole } from "../state";

// ADR 018 §3: a member row is an explicit per-brand grant; staff owner/admin stay owner everywhere.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const U = "33333333-3333-4333-8333-333333333333";
const caller = (kind: Caller["kind"], opsRole: Caller["opsRole"], members: Record<string, BrandRole> = {}, orgId: string | null = null): Caller =>
  ({ kind, opsRole, orgId, userId: U, members: new Map(Object.entries(members)) });

describe("roleOn", () => {
  it.each([
    ["client member of A", caller("client", "viewer", { [A]: "editor" }), A, "editor"],
    ["client on its own organization, no row", caller("client", "viewer", {}, A), A, "client"],
    ["client, someone else's brand", caller("client", "viewer", { [A]: "reviewer" }, A), B, null],
    ["staff owner with a reviewer row", caller("staff", "owner", { [A]: "reviewer" }), A, "owner"],
    ["staff admin", caller("staff", "admin"), B, "owner"],
    ["staff operator with a reviewer row", caller("staff", "operator", { [A]: "reviewer" }), A, "reviewer"],
    ["staff operator, no row", caller("staff", "operator", { [A]: "reviewer" }), B, "editor"],
    ["staff viewer, no row", caller("staff", "viewer"), A, "client"],
  ])("%s -> %s", (_label, c, brand, expected) => {
    expect(roleOn(c, brand)).toBe(expected);
  });
});

const req = (headers: Record<string, string>) => new Request("https://social.aware-wave.com/api/social/posts", { headers });

describe("callerOf / requireBrandRole", () => {
  it("no middleware identity -> no caller, and the members table is not read", async () => {
    memberRoles.mockReset();
    expect(await callerOf(req({}))).toBeNull();
    await expect(requireBrandRole(req({}), A, ["owner"])).rejects.toThrow(/not your brand/);
    expect(memberRoles).not.toHaveBeenCalled();
  });

  it("a client's member row grants that brand only", async () => {
    memberRoles.mockReset().mockResolvedValue(new Map([[A, "editor"]]));
    const r = req({ "x-ops-user-kind": "client", "x-ops-org-id": B, "x-ops-user-id": U, "x-ops-claims-role": "viewer" });
    expect(await requireBrandRole(r, A, ["owner", "editor"])).toBe("editor");
    expect(memberRoles).toHaveBeenCalledWith(U);
    await expect(requireBrandRole(r, B, ["owner", "editor"])).rejects.toThrow(/client may not/);
    await expect(requireBrandRole(r, "44444444-4444-4444-8444-444444444444", ["client"])).rejects.toThrow(/not your brand/);
  });

  it("actorOf carries the user id when middleware set one", () => {
    expect(actorOf(req({ "x-ops-user-kind": "staff", "x-ops-claims-role": "operator", "x-ops-user-id": U }))).toBe(`ops:operator:${U}`);
    expect(actorOf(req({ "x-ops-user-kind": "client", "x-ops-org-id": A, "x-ops-user-id": U }))).toBe(`client:${A}:${U}`);
    expect(actorOf(req({ "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" }))).toBe("ops:operator");
  });
});

describe("what customers may do and see (critic 2026-10-15 M1, L2)", () => {
  it("only staff open a new-channel attempt (channels are matched to a brand by timing)", () => {
    expect(() => requireStaffForNewChannel(req({ "x-ops-user-kind": "client", "x-ops-org-id": A }))).toThrow(/staff/);
    expect(() => requireStaffForNewChannel(req({ "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" }))).not.toThrow();
  });

  it("customers see no staff role or auth user id in the log", () => {
    expect(actorForViewer(`ops:operator:${U}`, "client")).toBe("ops");
    expect(actorForViewer(`client:${A}:${U}`, "client")).toBe(`client:${A}`);
    expect(actorForViewer("system:social-dispatch", "client")).toBe("system:social-dispatch");
    expect(actorForViewer(`ops:operator:${U}`, "staff")).toBe(`ops:operator:${U}`);
  });
});
