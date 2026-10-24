import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../../middleware";
import { productPageOwner } from "../doors";

describe("host visibility boundary", () => {
  it("a forged or missing Host returns 404 before authentication", async () => {
    for (const headers of [{ host: "attacker.example" }, { host: "app.aware-wave.com", "x-forwarded-host": "attacker.example" }, {}]) {
      const request = new NextRequest("https://app.aware-wave.com/api/ops/probe", { headers });
      expect((await middleware(request)).status).toBe(404);
    }
  });
  it("the tarot door serves the export bar's image API and still refuses studio's paid edit-prompt", async () => {
    const post = (p: string) => middleware(new NextRequest(`https://tarot.aware-wave.com${p}`, { method: "POST", headers: { host: "tarot.aware-wave.com" } }));
    expect((await post("/api/tools/image/process")).status).toBe(401);   // reaches the session gate (was 404 before 2026-10-24)
    expect((await post("/api/tools/studio/edit-prompt")).status).toBe(404);
  });
  it("a reserved product door leaves its existing staff route available", () => {
    expect(productPageOwner("/outreach")).toBeNull();
    expect(productPageOwner("/outreach/campaigns")).toBeNull();
  });
  it("a product's no-login path passes only on its own door, with no identity header", async () => {
    const get = (url: string) => middleware(new NextRequest(url, { headers: { host: new URL(url).host, "x-ops-claims-role": "owner", "x-ops-user-kind": "staff" } }));
    for (const p of ["/smartlink/soulful", "/smartlink/soulful/go/11111111-1111-4111-8111-111111111111"]) {
      const res = await get(`https://social.aware-wave.com${p}`);
      expect(res.headers.get("x-middleware-next"), p).toBe("1");
      expect(res.headers.get("x-middleware-rewrite"), p).toBeNull();
      expect(res.headers.get("x-middleware-request-x-ops-claims-role"), p).toBeNull();
      expect(res.headers.get("x-middleware-request-x-ops-user-kind"), p).toBeNull();
    }
    for (const host of ["app.aware-wave.com", "portal.aware-wave.com"]) expect((await get(`https://${host}/smartlink/soulful`)).status, host).toBe(404);
    expect((await get("https://social.aware-wave.com/smartlinkx")).status).toBe(307);   // not the prefix: the login gate
    // nginx prefixes every portal path with /portal (nginx/default.conf portal server): never the no-login branch
    expect((await get("https://portal.aware-wave.com/portal/smartlink/soulful")).status).toBe(307);
  });
  it("loopback probes keep the existing liveness paths but cannot enter staff routes", async () => {
    const request = (pathname: string, method = "GET") => new NextRequest(`http://127.0.0.1:3000${pathname}`, {
      method, headers: { host: "127.0.0.1:3000", "x-ops-claims-role": "owner" },
    });
    const root = await middleware(request("/"));
    expect(root.status).toBe(307);
    expect(new URL(root.headers.get("location")!).pathname).toBe("/login");
    const summary = await middleware(request("/api/ops/summary"));
    expect(summary.headers.get("x-middleware-next")).toBe("1");
    expect(summary.headers.get("x-middleware-request-x-ops-claims-role")).toBeNull();
    for (const p of ["/ops/clients", "/tools/social", "/api/ops/probe"]) expect((await middleware(request(p))).status).toBe(404);
    expect((await middleware(request("/api/ops/summary", "POST"))).status).toBe(404);
  });
});
