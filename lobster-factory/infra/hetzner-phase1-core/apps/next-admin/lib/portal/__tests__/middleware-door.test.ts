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
  it("a reserved product door leaves its existing staff route available", () => {
    expect(productPageOwner("/outreach")).toBeNull();
    expect(productPageOwner("/outreach/campaigns")).toBeNull();
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
