import { afterEach, describe, expect, it, vi } from "vitest";
import { provisionSentry } from "../providers/sentry";

describe("provisionSentry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SENTRY_AUTH_TOKEN;
    delete process.env.SENTRY_ORG_SLUG;
    delete process.env.SENTRY_TEAM_SLUG;
    delete process.env.SENTRY_API_BASE_URL;
  });

  it("creates project and key when team slug is set", async () => {
    process.env.SENTRY_AUTH_TOKEN = "tok";
    process.env.SENTRY_ORG_SLUG = "acme";
    process.env.SENTRY_TEAM_SLUG = "platform";

    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/teams/acme/platform/projects/") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "p1", slug: "tenant-111111111111", name: "Tenant 111111111111" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/projects/acme/tenant-111111111111/keys/") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            dsn: { public: "abcd1234efgh5678" },
            id: "k1",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await provisionSentry({
      organizationId: "11111111-1111-1111-1111-111111111111",
      customerEmail: "u@example.com",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.apiMetadata.sentry_project_slug).toBe("tenant-111111111111");
      expect(fetchMock).toHaveBeenCalled();
    }
  });

  it("lists teams when team slug missing", async () => {
    process.env.SENTRY_AUTH_TOKEN = "tok";
    process.env.SENTRY_ORG_SLUG = "acme";

    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/organizations/acme/teams/") && !init?.method) {
        return new Response(JSON.stringify([{ slug: "alpha" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/teams/acme/alpha/projects/") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "p1", slug: "tenant-11111111", name: "x" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/projects/acme/tenant-11111111/keys/") && init?.method === "POST") {
        return new Response(JSON.stringify({ dsn: { public: "pub" } }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await provisionSentry({
      organizationId: "11111111-1111-1111-1111-111111111111",
      customerEmail: "u@example.com",
    });

    expect(res.ok).toBe(true);
  });
});
