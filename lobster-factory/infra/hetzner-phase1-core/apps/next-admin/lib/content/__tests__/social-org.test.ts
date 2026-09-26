// resolveSocialOrg: the org every Postiz call acts for. siteId -> the WordPress site's owning org
// (ContentStudio); clientId -> an org id as given (Client Hub, release delivery panel).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrgAccessError } from "@/lib/tenant-guard";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000002";

type Site = { site: { id: string; organizationId: string | null } } | null;
const resolveWpSite = vi.hoisted(() => vi.fn(async (_req: unknown, _id: string): Promise<Site> => null));
vi.mock("@/lib/content/wp-sites", () => ({ resolveWpSite }));

const { resolveSocialOrg } = await import("../social-org");

function staff() {
  return new Request("http://localhost/api/content/social-publish", { headers: { "x-ops-user-kind": "staff" } });
}
function client(org: string) {
  return new Request("http://localhost/api/content/social-publish", {
    headers: { "x-ops-user-kind": "client", "x-ops-org-id": org },
  });
}
async function statusOf(p: ReturnType<typeof resolveSocialOrg>) {
  const r = await p;
  if (!("response" in r)) throw new Error(`expected a failure, got org ${r.organizationId}`);
  return { status: r.response.status, body: await r.response.json() };
}

beforeEach(() => resolveWpSite.mockReset());

describe("resolveSocialOrg", () => {
  it("siteId: answers the site's owning org, never the site id", async () => {
    resolveWpSite.mockResolvedValueOnce({ site: { id: "7f000000-0000-4000-8000-000000000009", organizationId: ORG } });
    expect(await resolveSocialOrg(staff(), { siteId: " 7f000000-0000-4000-8000-000000000009 " })).toEqual({ ok: true, organizationId: ORG });
    expect(resolveWpSite.mock.calls[0][1]).toBe("7f000000-0000-4000-8000-000000000009");
  });

  it("siteId of an env-configured site (no org): 422, no guess", async () => {
    resolveWpSite.mockResolvedValueOnce({ site: { id: "1", organizationId: null } });
    expect((await statusOf(resolveSocialOrg(staff(), { siteId: "1" }))).status).toBe(422);
  });

  it("unknown siteId: 404", async () => {
    expect((await statusOf(resolveSocialOrg(staff(), { siteId: "9" }))).status).toBe(404);
  });

  it("siteId of another tenant's site: 403 from resolveWpSite's own org check", async () => {
    resolveWpSite.mockRejectedValueOnce(new OrgAccessError());
    expect((await statusOf(resolveSocialOrg(client(ORG), { siteId: "2" }))).status).toBe(403);
  });

  it("empty siteId is not 'the first accessible site': 400", async () => {
    expect((await statusOf(resolveSocialOrg(staff(), { siteId: "  " }))).status).toBe(400);
    expect(resolveWpSite).not.toHaveBeenCalled();
  });

  it("clientId: an org uuid the caller may access", async () => {
    expect(await resolveSocialOrg(client(ORG), { clientId: ORG })).toEqual({ ok: true, organizationId: ORG });
    expect((await statusOf(resolveSocialOrg(client(ORG), { clientId: OTHER_ORG }))).status).toBe(403);
  });

  it("clientId that is not a uuid: 400 (Postiz connections key on organizations.id)", async () => {
    expect((await statusOf(resolveSocialOrg(staff(), { clientId: "1" }))).status).toBe(400);
  });

  it("neither or both: 400", async () => {
    expect((await statusOf(resolveSocialOrg(staff(), {}))).status).toBe(400);
    expect((await statusOf(resolveSocialOrg(staff(), { siteId: "1", clientId: ORG }))).status).toBe(400);
    expect(resolveWpSite).not.toHaveBeenCalled();
  });
});
