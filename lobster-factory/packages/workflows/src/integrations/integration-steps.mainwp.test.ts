// addSiteToMainWp against the contract of the installed MainWP 6.0.12 (sites controller source),
// and the rule that MainWP credentials come from the environment, never from the run payload.
import { afterEach, describe, expect, it, vi } from "vitest";
import { addSiteToMainWp, mainWpConfigFromEnv, newMainWpChildUniqueId, runAllIntegrations } from "./integration-steps";

const CFG = {
  dashboardUrl: "https://mainwp.example.com/",
  consumerKey: "ck_test",
  consumerSecret: "cs_test",
};
const SITE = { siteUrl: "https://client.example.com", adminUrl: "", clientName: "Client Site", profile: "profile_b" };

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function stubMainWpEnv() {
  vi.stubEnv("MAINWP_DASHBOARD_URL", CFG.dashboardUrl);
  vi.stubEnv("MAINWP_CONSUMER_KEY", CFG.consumerKey);
  vi.stubEnv("MAINWP_CONSUMER_SECRET", CFG.consumerSecret);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("addSiteToMainWp", () => {
  it("POSTs url, name and admin to sites/add with Basic auth", async () => {
    const fetchFn = mockFetch({ success: 1, data: { id: 42 } });
    const r = await addSiteToMainWp(CFG, "https://client.example.com", "Client Site", "siteadmin");
    expect(r.status).toBe("ok");
    expect(r.resourceId).toBe("42");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://mainwp.example.com/wp-json/mainwp/v2/sites/add");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("ck_test:cs_test").toString("base64")}`);
    expect(JSON.parse(init.body)).toEqual({ url: "https://client.example.com", name: "Client Site", admin: "siteadmin" });
  });

  it("treats HTTP 200 with success:0 as a failure, carrying MainWP's reason", async () => {
    mockFetch({ success: 0, error: "MainWP Child plugin not detected" });
    const r = await addSiteToMainWp(CFG, "https://client.example.com", "x", "admin");
    expect(r.status).toBe("error");
    expect(r.detail).toContain("MainWP Child plugin not detected");
  });

  it("refuses to call MainWP without an admin username or a site URL", async () => {
    const fetchFn = mockFetch({ success: 1, data: { id: 1 } });
    expect((await addSiteToMainWp(CFG, "https://client.example.com", "x", "  ")).status).toBe("error");
    expect((await addSiteToMainWp(CFG, "", "x", "admin")).status).toBe("error");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("reports an HTTP error status as an error", async () => {
    mockFetch({}, 401);
    expect((await addSiteToMainWp(CFG, "https://client.example.com", "x", "admin")).detail).toBe("HTTP 401 (response body redacted)");
  });

  it("treats success:1 without a site id (or a null id) as a failure", async () => {
    mockFetch({ success: 1 });
    expect((await addSiteToMainWp(CFG, "https://client.example.com", "x", "admin")).status).toBe("error");
    mockFetch({ success: 1, data: { id: null } });
    expect((await addSiteToMainWp(CFG, "https://client.example.com", "x", "admin")).status).toBe("error");
  });

  it("reports a non-JSON 200 as an error instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>login</html>", { status: 200 })));
    expect((await addSiteToMainWp(CFG, "https://client.example.com", "x", "admin")).status).toBe("error");
  });

  it("skips when MainWP is not configured", async () => {
    expect((await addSiteToMainWp(undefined, "https://client.example.com", "x", "admin")).status).toBe("skipped");
  });
});

describe("MainWP registration inside runAllIntegrations", () => {
  const mainwp = (rs: Awaited<ReturnType<typeof runAllIntegrations>>) => rs.find((r) => r.service === "mainwp")!;

  it("reads credentials only from the environment", () => {
    expect(mainWpConfigFromEnv({})).toBeUndefined();
    expect(mainWpConfigFromEnv({ MAINWP_DASHBOARD_URL: "u", MAINWP_CONSUMER_KEY: "k", MAINWP_CONSUMER_SECRET: "s" }))
      .toEqual({ dashboardUrl: "u", consumerKey: "k", consumerSecret: "s" });
  });

  it("is on by default, even with no integrations payload, using the admin the provisioner installed", async () => {
    stubMainWpEnv();
    const fetchFn = mockFetch({ success: 1, data: { id: 9 } });
    const r = mainwp(await runAllIntegrations(undefined, { ...SITE, wpAdminUser: "admin" }));
    expect(r.status).toBe("ok");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).admin).toBe("admin");
  });

  it("an explicit adminUsername overrides the provisioner's", async () => {
    stubMainWpEnv();
    const fetchFn = mockFetch({ success: 1, data: { id: 9 } });
    await runAllIntegrations({ mainWp: { adminUsername: "owner" } }, { ...SITE, wpAdminUser: "admin" });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).admin).toBe("owner");
  });

  it("does nothing when the operator unchecked it", async () => {
    stubMainWpEnv();
    const fetchFn = mockFetch({ success: 1, data: { id: 9 } });
    const r = mainwp(await runAllIntegrations({ mainWp: { enabled: false } }, { ...SITE, wpAdminUser: "admin" }));
    expect(r.status).toBe("skipped");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("an adopted site with no known admin is skipped, unless registration was explicitly requested", async () => {
    stubMainWpEnv();
    const fetchFn = mockFetch({ success: 1, data: { id: 9 } });
    expect(mainwp(await runAllIntegrations(undefined, SITE)).status).toBe("skipped");
    expect(mainwp(await runAllIntegrations({ mainWp: { enabled: true } }, SITE)).status).toBe("error");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sends the run's Unique Security ID so mainwp-child can verify without the admin password", async () => {
    stubMainWpEnv();
    const fetchFn = mockFetch({ success: 1, data: { id: 9 } });
    await runAllIntegrations(undefined, { ...SITE, wpAdminUser: "admin", mainWpChildUniqueId: "u1" });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).uniqueid).toBe("u1");
  });

  it("generates a fresh id only when registration will actually run", () => {
    expect(newMainWpChildUniqueId(undefined)).toBeUndefined(); // no server credentials
    stubMainWpEnv();
    const a = newMainWpChildUniqueId(undefined);
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(newMainWpChildUniqueId(undefined)).not.toBe(a);
    expect(newMainWpChildUniqueId({ enabled: false })).toBeUndefined();
  });

  it("skips cleanly when the server has no MainWP credentials, but errors when it was explicitly requested", async () => {
    expect(mainwp(await runAllIntegrations(undefined, { ...SITE, wpAdminUser: "admin" })).status).toBe("skipped");
    expect(mainwp(await runAllIntegrations({ mainWp: { enabled: true } }, { ...SITE, wpAdminUser: "admin" })).status).toBe("error");
  });
});
