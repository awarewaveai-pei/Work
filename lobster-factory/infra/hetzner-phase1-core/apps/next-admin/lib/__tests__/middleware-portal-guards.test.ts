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
import { isPortalPath, isWrongHostForPortal, isClientOutsidePortal, blockedResponse } from "../../middleware";

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

describe("isClientOutsidePortal", () => {
  it("client outside /portal -> true (must be blocked)", () => {
    expect(isClientOutsidePortal("/ops/inbox", "client")).toBe(true);
  });
  it("client on bare /portal (no trailing slash) -> false (must NOT be blocked)", () => {
    expect(isClientOutsidePortal("/portal", "client")).toBe(false);
  });
  it("client under /portal/ -> false", () => {
    expect(isClientOutsidePortal("/portal/launcher", "client")).toBe(false);
  });
  it("staff anywhere -> false (this check only restricts client identities)", () => {
    expect(isClientOutsidePortal("/ops/inbox", "staff")).toBe(false);
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
    expect(isWrongHostForPortal(req("https://app.aware-wave.com/portal/api/signup"))).toBe(true);
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
    const res = blockedResponse(req("https://portal.aware-wave.com/portal/api/signup"));
    expect(res.status).toBe(401);
  });
});
