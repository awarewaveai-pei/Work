import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ memberRoles: vi.fn() }));
vi.mock("../store", () => ({ memberRoles: mocks.memberRoles }));
import { actorFor, actorOf, NotAuthorizedForOrgError } from "../authz";

const req = (headers: Record<string, string>) => new Request("http://localhost/api/social", { headers });
const staff = (role: string, userId = "staff-1") => req({ "x-ops-user-kind": "staff", "x-ops-claims-role": role, "x-ops-user-id": userId });

beforeEach(() => { mocks.memberRoles.mockReset().mockResolvedValue(new Map()); });

describe("acting on behalf of an organization (ADR 017 §3)", () => {
  it("a staff owner/admin acts for any org, and the actor stays the staff user", async () => {
    const acting = await actorFor(staff("owner"), "org-x");
    expect(acting.orgId).toBe("org-x");
    expect(acting.actor).toBe(actorOf(staff("owner")));
    expect(acting.actor).toContain("staff-1");
  });

  it("a staff member with a member row on the org may act for it", async () => {
    mocks.memberRoles.mockResolvedValue(new Map([["org-x", "editor"]]));
    expect((await actorFor(staff("operator"), "org-x")).orgId).toBe("org-x");
  });

  it("a staff actor without a role on the org is refused", async () => {
    mocks.memberRoles.mockResolvedValue(new Map([["other-org", "editor"]]));
    const failure = await actorFor(staff("operator"), "org-x").catch((e) => e);
    expect(failure).toBeInstanceOf(NotAuthorizedForOrgError);
    expect(failure).toMatchObject({ status: 403, code: "not_authorized_for_org" });
  });

  it("a client acts only for its own org", async () => {
    const client = req({ "x-ops-user-kind": "client", "x-ops-org-id": "org-x", "x-ops-user-id": "c-1" });
    expect((await actorFor(client, "org-x")).orgId).toBe("org-x");
    await expect(actorFor(client, "org-y")).rejects.toBeInstanceOf(NotAuthorizedForOrgError);
  });
});
