/**
 * Regression tests for the middleware.ts logic that took portal.aware-wave.com down live
 * (critic finding M-4, 2026-08-29): before this file existed, blockedResponse()'s loop
 * invariant and isPortalPath()'s boundary were covered by nothing but a comment.
 *
 * NOTE: middleware.ts is not co-located under __tests__ (Next.js requires it at the app root),
 * so this file imports it by relative path.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isPortalPath, isWrongHostForPortal, isWrongHostForProductPage, isClientOutsideDoor, blockedResponse, middleware, config } from "../../middleware";
import { doorForHost, servedNextAdminProducts, productHost, type Door, type NextAdminProduct } from "@/lib/portal/doors";
import { PRODUCTS } from "@/lib/portal/products";

describe("isPortalPath — boundary (mirrors the nginx portal(?:/|$) fix)", () => {
  it.each([
    ["/portal", true],
    ["/portal/", true],
    ["/portal/login", true],
    ["/portal/launcher", true],
    ["/portalx", false],
    ["/portal-something", false],
    ["/", false],
    ["/ops", false],
  ])("isPortalPath(%s) -> %s", (path, expected) => {
    expect(isPortalPath(path)).toBe(expected);
  });
});

describe("isClientOutsideDoor", () => {
  const portal: Door = { kind: "portal" };
  const staff: Door = { kind: "staff" };
  const social = doorForHost("social.aware-wave.com", {});
  it("client outside /portal -> true (must be blocked)", () => {
    expect(isClientOutsideDoor("/ops/inbox", "client", portal)).toBe(true);
    expect(isClientOutsideDoor("/ops/inbox", "client", staff)).toBe(true);
  });
  it("client on bare /portal (no trailing slash) -> false (must NOT be blocked)", () => {
    expect(isClientOutsideDoor("/portal", "client", portal)).toBe(false);
  });
  it("client under /portal/ -> false", () => {
    expect(isClientOutsideDoor("/portal/launcher", "client", portal)).toBe(false);
  });
  it("staff anywhere -> false (this check only restricts client identities)", () => {
    expect(isClientOutsideDoor("/ops/inbox", "staff", staff)).toBe(false);
  });
  it("on a product door a client reaches that product's page and API only (ADR 018)", () => {
    expect(social.kind).toBe("product");
    expect(isClientOutsideDoor("/social", "client", social)).toBe(false);
    expect(isClientOutsideDoor("/api/social/posts", "client", social)).toBe(false);
    expect(isClientOutsideDoor("/portal/launcher", "client", social)).toBe(true);
    expect(isClientOutsideDoor("/api/ops/clients", "client", social)).toBe(true);
    expect(isClientOutsideDoor("/tools/social", "client", social)).toBe(true);
  });
  it("on the tarot door a client reaches tarot, the platform APIs, and nothing staff or another product serves", () => {
    // built but not live yet (enabled: false), so the door is constructed rather than resolved from its host
    const tarot: Door = { kind: "product", product: PRODUCTS.find((p) => p.key === "tarot") as NextAdminProduct };
    for (const p of ["/tarot", "/api/tools/tarot/generate", "/api/tools/designs", "/api/entitlements/features"]) expect(isClientOutsideDoor(p, "client", tarot), p).toBe(false);
    for (const p of ["/api/ops/clients", "/api/tools/studio/generate", "/api/social/posts", "/tools/tarot", "/ops/inbox"]) expect(isClientOutsideDoor(p, "client", tarot), p).toBe(true);
  });
});

function req(url: string): NextRequest {
  return new NextRequest(url);
}

describe("isWrongHostForPortal", () => {
  it("non-portal path -> false regardless of host", () => {
    expect(isWrongHostForPortal(req("https://app.aware-wave.com/ops"))).toBe(false);
  });
  it("portal path on app.aware-wave.com -> true (must be rejected)", () => {
    expect(isWrongHostForPortal(req("https://app.aware-wave.com/portal/login"))).toBe(true);
  });
  it("portal path on portal.aware-wave.com -> false", () => {
    const request = req("https://portal.aware-wave.com/portal/launcher");
    Object.defineProperty(request, "headers", { value: new Headers({ host: "portal.aware-wave.com" }) });
    expect(isWrongHostForPortal(request)).toBe(false);
  });
});

describe("blockedResponse — loop invariant (critic finding C-A)", () => {
  function nextParamOf(res: Response): string | null {
    const location = res.headers.get("location");
    if (!location) return null;
    return new URL(location).searchParams.get("next");
  }

  it("ordinary protected page -> redirects to /login with next= set", () => {
    const res = blockedResponse(req("https://app.aware-wave.com/ops/inbox"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(nextParamOf(res)).toBe("/ops/inbox");
  });

  it("already login-shaped (/login) -> no next= appended (breaks the fixed-point case)", () => {
    const res = blockedResponse(req("https://app.aware-wave.com/login"));
    expect(nextParamOf(res)).toBeNull();
  });

  it("already login-shaped (/portal/login) -> no next= appended (the exact live-incident path)", () => {
    const res = blockedResponse(req("https://portal.aware-wave.com/portal/login"));
    expect(nextParamOf(res)).toBeNull();
  });

  it("request already carries a next= param -> not compounded onto a new one", () => {
    const res = blockedResponse(req("https://app.aware-wave.com/portal/launcher?next=%2Fportal%2Flaunche"));
    expect(nextParamOf(res)).toBeNull();
  });

  it("oversized candidate next (>512 chars) -> dropped rather than carried forward", () => {
    const longPath = "/ops/" + "a".repeat(600);
    const res = blockedResponse(req(`https://app.aware-wave.com${longPath}`));
    expect(nextParamOf(res)).toBeNull();
  });

  it("api path -> 401 JSON, not a redirect", () => {
    const res = blockedResponse(req("https://app.aware-wave.com/api/ops/repairs"));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });

  it("portal api path -> 401 JSON (isApiPath covers /portal/api/* too)", () => {
    const res = blockedResponse(req("https://portal.aware-wave.com/portal/api/launcher"));
    expect(res.status).toBe(401);
  });
});

function hostReq(url: string, method = "GET"): NextRequest {
  return new NextRequest(url, { method, headers: { host: new URL(url).host } });
}

describe("product door (ADR 018): its page prefix answers only on its own host, other APIs 404 before auth", () => {
  it("/social on the staff host -> wrong host; on social.aware-wave.com -> fine", () => {
    expect(isWrongHostForProductPage(hostReq("https://app.aware-wave.com/social"))).toBe(true);
    expect(isWrongHostForProductPage(hostReq("https://app.aware-wave.com/social/x"))).toBe(true);
    expect(isWrongHostForProductPage(hostReq("https://social.aware-wave.com/social"))).toBe(false);
    expect(isWrongHostForProductPage(hostReq("https://app.aware-wave.com/tools/social"))).toBe(false);
  });

  it.each([
    ["https://social.aware-wave.com/api/ops/clients", 404],
    ["https://social.aware-wave.com/portal/login", 404],
    ["https://app.aware-wave.com/social", 404],
  ])("%s -> %s", async (url, status) => {
    const res = await middleware(hostReq(url));
    expect(res.status).toBe(status);
  });

  it("an unauthenticated page on the product door goes to that host's /login", async () => {
    const res = await middleware(hostReq("https://social.aware-wave.com/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).host).toBe("social.aware-wave.com");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });
});

// Paths the matcher skips never reach the door check, so each product door's nginx block must refuse them itself
// (Codex 2026-10-15 F1). A door may keep only what every page needs: Next assets, the favicon, /login and the public
// static image folders (no data; served without login on the app host as well).
describe("product door nginx block refuses every path the middleware matcher skips", () => {
  const DOOR_NEEDS = new Set(["_next/static", "_next/image", "favicon.ico", "login", "tarot-frames", "edge-masks/"]);
  const skipped = /\(\?!([^)]*)\)/.exec(config.matcher[0])![1].split("|").filter((p) => !DOOR_NEEDS.has(p));
  const conf = readFileSync(path.join(__dirname, "../../../../nginx/default.conf"), "utf8");

  it.each(servedNextAdminProducts().map((p) => [productHost(p, {})]))("%s", (host) => {
    // one block may serve several doors: find the server_name line that lists this host
    const start = new RegExp(`server_name[^;\\n]*\\s${host.replace(/\./g, "\\.")}[\\s;]`).exec(conf)?.index ?? -1;
    expect(start, `no server block for ${host} in nginx/default.conf`).toBeGreaterThan(-1);
    const block = conf.slice(start, conf.indexOf(String.fromCharCode(10) + "}", start));
    // run nginx's own pattern (PCRE; this subset reads the same in JS) against real paths, not its token names
    const deny = /location ~ (\S+) \{ return 404; \}/.exec(block);
    expect(deny, `${host}: no deny location`).not.toBeNull();
    const refuses = (p: string) => new RegExp(deny![1]).test(p);
    expect(skipped.length).toBeGreaterThan(3);
    for (const p of skipped) {
      const base = `/${p.replace(/\/$/, "")}`;
      for (const probe of p.endsWith("/") ? [`${base}/x`] : [base, `${base}/x`, `${base}?a=1`]) {
        expect(refuses(probe), `${host} must refuse ${probe}`).toBe(true);
      }
    }
    // the encoded-path guard ($request_uri, so path AND query): refuse traversal in the path, never in the query
    const enc = /if \(\$request_uri ~\* "([^"]+)"\) \{ return 400; \}/.exec(block);
    expect(enc, `${host}: no encoded-path guard`).not.toBeNull();
    const rejects = (uri: string) => new RegExp(enc![1], "i").test(uri);
    for (const bad of ["/api/video/%2e%2e/social/brands", "/a%2Fb", "/a%5cb", "/x/../social", "/x/..", "/x/.?y=1"]) {
      expect(rejects(bad), `${host} must reject ${bad}`).toBe(true);
    }
    const kept = ["/", "/social", "/social/x", "/api/social/brands", "/login", "/_next/static/x.js", "/favicon.ico",
      "/login?next=%2F", "/login?next=%2Fsocial%2Fx", "/_next/image?url=%2F_next%2Fstatic%2Fa.png&w=64", "/.well-known/x",
      "/edge-masks/torn.png", "/tarot-frames/gold.png"];
    for (const k of kept) {
      expect(refuses(k.split("?")[0]) || rejects(k), `${host} must keep ${k}`).toBe(false);
    }
  });
});
