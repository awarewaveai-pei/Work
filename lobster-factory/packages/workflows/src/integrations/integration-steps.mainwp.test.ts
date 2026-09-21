// addSiteToMainWp against the contract of the installed MainWP 6.0.12 (sites controller source).
import { afterEach, describe, expect, it, vi } from "vitest";
import { addSiteToMainWp } from "./integration-steps";

const CFG = {
  dashboardUrl: "https://mainwp.example.com/",
  consumerKey: "ck_test",
  consumerSecret: "cs_test",
  adminUsername: "siteadmin",
};

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("addSiteToMainWp", () => {
  it("POSTs url, name and admin to sites/add with Basic auth", async () => {
    const fetchFn = mockFetch({ success: 1, data: { id: 42 } });
    const r = await addSiteToMainWp(CFG, "https://client.example.com", "Client Site");
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
    const r = await addSiteToMainWp(CFG, "https://client.example.com", "Client Site");
    expect(r.status).toBe("error");
    expect(r.detail).toContain("MainWP Child plugin not detected");
  });

  it("refuses to call MainWP without the child-site admin username", async () => {
    const fetchFn = mockFetch({ success: 1, data: { id: 1 } });
    const r = await addSiteToMainWp({ ...CFG, adminUsername: "  " }, "https://client.example.com", "x");
    expect(r.status).toBe("error");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("falls back to the admin the provisioner installed; an explicit username wins", async () => {
    const fetchFn = mockFetch({ success: 1, data: { id: 7 } });
    await addSiteToMainWp({ ...CFG, adminUsername: undefined }, "https://client.example.com", "x", "admin");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).admin).toBe("admin");
    await addSiteToMainWp(CFG, "https://client.example.com", "x", "admin");
    expect(JSON.parse(fetchFn.mock.calls[1][1].body).admin).toBe("siteadmin");
  });

  it("reports an HTTP error status as an error", async () => {
    mockFetch({}, 401);
    expect((await addSiteToMainWp(CFG, "https://client.example.com", "x")).detail).toBe("HTTP 401 (response body redacted)");
  });

  it("treats success:1 without a site id (or a null id) as a failure", async () => {
    mockFetch({ success: 1 });
    expect((await addSiteToMainWp(CFG, "https://client.example.com", "x")).status).toBe("error");
    mockFetch({ success: 1, data: { id: null } });
    expect((await addSiteToMainWp(CFG, "https://client.example.com", "x")).status).toBe("error");
  });

  it("reports a non-JSON 200 as an error instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>login</html>", { status: 200 })));
    expect((await addSiteToMainWp(CFG, "https://client.example.com", "x")).status).toBe("error");
  });

  it("does not call MainWP without a site URL", async () => {
    const fetchFn = mockFetch({ success: 1, data: { id: 1 } });
    expect((await addSiteToMainWp(CFG, "", "x")).status).toBe("error");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("skips when MainWP is not configured", async () => {
    const r = await addSiteToMainWp(undefined, "https://client.example.com", "x");
    expect(r.status).toBe("skipped");
  });
});
