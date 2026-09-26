/**
 * CSRF guard in middleware.ts: a cookie-authenticated write must come from this app's own pages.
 * Staging sites on aware-wave.com are SAME-SITE to app.aware-wave.com, so the session cookie rides along on
 * their POSTs; a write passes only on positive same-origin evidence (Sec-Fetch-Site: same-origin, or, without
 * Fetch Metadata, an Origin with the same scheme + host). Token-authenticated callers are passed through before
 * this check and must stay unaffected.
 */
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isCrossSiteWrite, middleware } from "../../middleware";

function req(url: string, method: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { method, headers });
}
const WP_UPDATE = "https://app.aware-wave.com/api/ops/clients/acme/wp-update?wave=wave1";
const SESSION = { cookie: "sb-abc-auth-token=session-value" };

describe("isCrossSiteWrite", () => {
  it.each([
    ["same-origin POST", "POST", { "sec-fetch-site": "same-origin" }, false],
    ["'none' POST (a resubmitted form can carry it)", "POST", { "sec-fetch-site": "none" }, true],
    ["same-site POST (a staging page on aware-wave.com)", "POST", { "sec-fetch-site": "same-site" }, true],
    ["cross-site POST", "POST", { "sec-fetch-site": "cross-site" }, true],
    ["an unknown Sec-Fetch-Site value (allowlist, not denylist)", "POST", { "sec-fetch-site": "bogus" }, true],
    ["same-site DELETE", "DELETE", { "sec-fetch-site": "same-site" }, true],
    ["same-site PATCH", "PATCH", { "sec-fetch-site": "same-site" }, true],
    ["cross-site GET (safe method)", "GET", { "sec-fetch-site": "cross-site" }, false],
    ["cross-site HEAD (safe method)", "HEAD", { "sec-fetch-site": "cross-site" }, false],
    ["cross-site OPTIONS (preflight, safe method)", "OPTIONS", { "sec-fetch-site": "cross-site" }, false],
  ])("%s -> %s", (_label, method, headers, expected) => {
    expect(isCrossSiteWrite(req(WP_UPDATE, method, headers))).toBe(expected);
  });

  it("a page POST (server action) is left to Next's own origin check", () => {
    expect(isCrossSiteWrite(req("https://app.aware-wave.com/ops/inbox", "POST", { "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  it("portal API paths are covered too", () => {
    expect(isCrossSiteWrite(req("https://portal.aware-wave.com/portal/api/x", "POST", { "sec-fetch-site": "same-site" }))).toBe(true);
  });

  describe("no Fetch Metadata: Origin (scheme + host) decides", () => {
    it("Origin on the same scheme and host -> allowed", () => {
      expect(isCrossSiteWrite(req(WP_UPDATE, "POST", { origin: "https://app.aware-wave.com", host: "app.aware-wave.com" }))).toBe(false);
    });
    it("Origin on the apex (staging host) -> blocked", () => {
      expect(isCrossSiteWrite(req(WP_UPDATE, "POST", { origin: "https://aware-wave.com", host: "app.aware-wave.com" }))).toBe(true);
    });
    it("same host over plain http while the proxy says https -> blocked", () => {
      expect(isCrossSiteWrite(req(WP_UPDATE, "POST", {
        origin: "http://app.aware-wave.com", host: "app.aware-wave.com", "x-forwarded-proto": "https",
      }))).toBe(true);
    });
    it("behind the proxy, x-forwarded-host/-proto are what is compared (first value)", () => {
      expect(isCrossSiteWrite(req("http://next-admin:3000/api/ops/x", "POST", {
        origin: "https://app.aware-wave.com", host: "next-admin:3000",
        "x-forwarded-host": "app.aware-wave.com, next-admin:3000", "x-forwarded-proto": "https",
      }))).toBe(false);
    });
    it("the port is part of the host: matching port -> allowed, other port -> blocked", () => {
      const url = "https://app.aware-wave.com:8443/api/ops/x";
      expect(isCrossSiteWrite(req(url, "POST", { origin: "https://app.aware-wave.com:8443", host: "app.aware-wave.com:8443" }))).toBe(false);
      expect(isCrossSiteWrite(req(url, "POST", { origin: "https://app.aware-wave.com:8443", host: "app.aware-wave.com" }))).toBe(true);
    });
    it("Origin 'null' (sandboxed frame / file: / cross-origin redirect) -> blocked", () => {
      expect(isCrossSiteWrite(req(WP_UPDATE, "POST", { origin: "null", host: "app.aware-wave.com" }))).toBe(true);
    });
    it("neither header and no session cookie (a script) -> allowed; it gets 401 at the session gate", () => {
      expect(isCrossSiteWrite(req(WP_UPDATE, "POST"))).toBe(false);
    });
    it("neither header but a session cookie (an old browser) -> blocked", () => {
      expect(isCrossSiteWrite(req(WP_UPDATE, "POST", SESSION))).toBe(true);
    });
  });
});

describe("middleware(): the CSRF refusal sits after the token pass-throughs, before the session", () => {
  const savedSecret = process.env.OPS_PROXY_SHARED_SECRET;
  afterEach(() => {
    if (savedSecret === undefined) delete process.env.OPS_PROXY_SHARED_SECRET;
    else process.env.OPS_PROXY_SHARED_SECRET = savedSecret;
  });

  it("a same-site POST to a session-authenticated API -> 403 cross_site_request_blocked", async () => {
    const res = await middleware(req(WP_UPDATE, "POST", { "sec-fetch-site": "same-site" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "cross_site_request_blocked" });
  });

  it("the same request carrying a valid x-ops-sync-key passes through (token callers never use the cookie)", async () => {
    process.env.OPS_PROXY_SHARED_SECRET = "sync-secret-for-test";
    const res = await middleware(req(WP_UPDATE, "POST", { "sec-fetch-site": "same-site", "x-ops-sync-key": "sync-secret-for-test" }));
    expect(res.status).not.toBe(403);
  });

  it("a PUBLIC_API_PATHS endpoint is not subject to the check", async () => {
    const res = await middleware(req("https://app.aware-wave.com/api/ops/inbox/incidents", "POST", { "sec-fetch-site": "cross-site" }));
    expect(res.status).not.toBe(403);
  });

  it("portal signup (a pre-session public path) is not subject to the check", async () => {
    const res = await middleware(req("https://portal.aware-wave.com/portal/api/signup", "POST", {
      "sec-fetch-site": "same-site", host: "portal.aware-wave.com",
    }));
    expect(res.status).not.toBe(403);
  });
});
