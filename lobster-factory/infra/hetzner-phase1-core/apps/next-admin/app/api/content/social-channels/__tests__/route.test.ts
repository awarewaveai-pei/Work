// social-channels lists the Postiz connections of the org resolved by resolveSocialOrg: ContentStudio
// passes ?siteId (the site's org is used), the Client Hub passes ?clientId (an org id).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }), canCreateAiImageJob: () => true }));

const SITE_ORG = "00000000-0000-4000-8000-000000000003";
const resolveWpSite = vi.hoisted(() =>
  vi.fn(async (_req: unknown, _id: string) => ({ site: { id: "site-a", organizationId: SITE_ORG as string | null } })),
);
vi.mock("@/lib/content/wp-sites", () => ({ resolveWpSite }));

const listIntegrations = vi.hoisted(() => vi.fn(async (_org: string) => []));
vi.mock("@/lib/content/postiz", () => ({ getPostizConfig: vi.fn(), listIntegrations }));

const { GET } = await import("../route");

const get = (qs: string) => GET(new Request(`http://localhost/api/content/social-channels?${qs}`));

beforeEach(() => {
  listIntegrations.mockClear();
  resolveWpSite.mockClear();
});

describe("GET /api/content/social-channels", () => {
  it("?siteId: lists the site's org connections", async () => {
    const res = await get("siteId=site-a");
    expect(res.status).toBe(200);
    expect(listIntegrations).toHaveBeenCalledWith(SITE_ORG);
  });

  it("?clientId: lists that org's connections", async () => {
    const org = "00000000-0000-4000-8000-000000000001";
    await get(`clientId=${org}`);
    expect(listIntegrations).toHaveBeenCalledWith(org);
    expect(resolveWpSite).not.toHaveBeenCalled();
  });

  it("?siteId of a site with no org: 422, no lookup", async () => {
    resolveWpSite.mockResolvedValueOnce({ site: { id: "1", organizationId: null } });
    expect((await get("siteId=1")).status).toBe(422);
    expect(listIntegrations).not.toHaveBeenCalled();
  });

  it("no parameter: 400", async () => {
    expect((await get("")).status).toBe(400);
  });
});
