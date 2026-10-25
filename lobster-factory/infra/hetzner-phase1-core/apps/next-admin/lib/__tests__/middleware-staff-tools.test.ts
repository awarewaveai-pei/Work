// Staff tool grants at the middleware (agency-os/handoffs/2026-10-24-staff-tool-grants C2): the owner is never refused,
// a path no tool claims is refused once enforced, shadow passes and logs, the cached fast path checks too, and a
// client-supplied x-ops-tools never survives.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { existsSync } from "node:fs";
import path from "node:path";

const user = vi.hoisted(() => ({ current: null as null | { id: string; app_metadata: Record<string, unknown> }, calls: 0, rotate: false }));
vi.mock("@/lib/supabase/ssr", () => ({
  isSupabaseAuthConfigured: () => true,
  createSupabaseMiddlewareClient: () => ({
    supabase: { auth: { getUser: async () => { user.calls += 1; return user.current ? { data: { user: user.current }, error: null } : { data: { user: null }, error: { status: 401 } }; } } },
    refreshedCookies: user.rotate ? [{ name: "sb-test-auth-token", value: "rotated", options: {} }] : [],
  }),
}));

import { middleware } from "../../middleware";
import { decodeToolsHeader, staffDenial, staffMayUseTool } from "../staff-access";

let n = 0;
function as(meta: Record<string, unknown>) { user.current = { id: `u-${++n}`, app_metadata: meta }; return `sb-test-auth-token=${n}`; }
const call = (cookie: string, path: string, headers: Record<string, string> = {}) =>
  middleware(new NextRequest(`https://app.aware-wave.com${path}`, { headers: { host: "app.aware-wave.com", cookie, ...headers } }));
const passed = (res: Response) => res.headers.get("x-middleware-next") === "1";
const toolsHeader = (res: Response) => res.headers.get("x-middleware-request-x-ops-tools");

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => {}); user.calls = 0; user.rotate = false; });
afterEach(() => { warn.mockRestore(); vi.unstubAllEnvs(); });
const warned = (what: string) => warn.mock.calls.some((c) => String(c[0]).includes(`[staff-tools] ${what} `));

describe("staff tool gate: enforce", () => {
  beforeEach(() => vi.stubEnv("STAFF_TOOLS_MODE", "enforce"));

  it("the owner reaches everything, whatever is ticked", async () => {
    const c = as({ ops_role: "owner", staff_tools: [] });
    for (const p of ["/ops/clients", "/api/ops/clients", "/api/nothing-here", "/tools/social"]) expect(passed(await call(c, p)), p).toBe(true);
  });

  it("a ticked tool passes; an unticked page goes to /no-access, an unticked API is 403", async () => {
    const c = as({ ops_role: "operator", staff_tools: ["social"] });
    expect(passed(await call(c, "/tools/social"))).toBe(true);
    expect(passed(await call(c, "/"))).toBe(true);            // the platform
    expect(passed(await call(c, "/no-access"))).toBe(true);   // never a redirect loop
    const page = await call(c, "/ops/clients");
    expect(page.status).toBe(307);
    const to = new URL(page.headers.get("location")!);
    expect([to.host, to.pathname, to.searchParams.get("tool")]).toEqual(["app.aware-wave.com", "/no-access", "ops/clients"]);
    const api = await call(c, "/api/ops/clients/acme/credentials");
    expect(api.status).toBe(403);
    expect(await api.json()).toEqual({ error: "tool_not_granted", tools: ["ops/clients"] });
    expect(warned("deny")).toBe(true);
  });

  it("the redirect target is a real page every staff member may open", () => {
    expect(existsSync(path.join(__dirname, "../../app/(shell)/no-access/page.tsx"))).toBe(true);
    expect(staffDenial({ role: "viewer", tools: [] }, "/no-access")).toBeNull();
  });

  it("a refusal still carries the session cookies Supabase just rotated (page and API)", async () => {
    user.rotate = true;
    for (const p of ["/ops/clients", "/api/ops/clients"]) {
      const res = await call(as({ ops_role: "operator", staff_tools: [] }), p);
      expect(res.status, p).toBeGreaterThanOrEqual(300);
      expect(res.cookies.get("sb-test-auth-token")?.value, p).toBe("rotated");
    }
  });

  it("many distinct refused paths log once per person and tool set, not once per path", async () => {
    const c = as({ ops_role: "operator", staff_tools: ["social"] });
    for (let i = 0; i < 20; i++) await call(c, `/api/nothing-${i}`);
    for (let i = 0; i < 5; i++) await call(c, `/api/ops/clients/acme-${i}/credentials`);
    expect(warn.mock.calls.filter((x) => String(x[0]).includes(`user=u-${n} `))).toHaveLength(2);
  });

  it("a path no tool claims is refused; a staff member never set gets only the platform", async () => {
    expect((await call(as({ ops_role: "admin", staff_tools: ["social"] }), "/api/nothing-here")).status).toBe(403);
    const unset = as({ ops_role: "admin" });
    expect((await call(unset, "/api/ops/clients")).status).toBe(403);
    expect(passed(await call(unset, "/"))).toBe(true);
  });

  it("the cached fast path checks too (the second request does not reach the auth server)", async () => {
    const c = as({ ops_role: "viewer", staff_tools: ["social"] });
    expect(passed(await call(c, "/tools/social"))).toBe(true);
    expect((await call(c, "/api/ops/clients")).status).toBe(403);
    expect(user.calls).toBe(1);
  });

  it("on a product door the same rule holds, and a refused page goes to the staff door's /no-access", async () => {
    const onSocial = (cookie: string, path: string) =>
      middleware(new NextRequest(`https://social.aware-wave.com${path}`, { headers: { host: "social.aware-wave.com", cookie } }));
    const res = await onSocial(as({ ops_role: "operator", staff_tools: ["content"] }), "/");
    const to = new URL(res.headers.get("location")!);
    expect([to.host, to.pathname, to.searchParams.get("tool")]).toEqual(["app.aware-wave.com", "/no-access", "social"]);
    expect((await onSocial(as({ ops_role: "operator", staff_tools: ["content"] }), "/api/social/posts")).status).toBe(403);
    expect((await onSocial(as({ ops_role: "operator", staff_tools: ["social"] }), "/")).headers.get("x-middleware-rewrite")).toContain("/social");
  });

  it("a customer is not judged by staff grants (its door rule applies)", async () => {
    const c = as({ ops_role: "owner", user_kind: "client", org_id: "o1" });
    const res = await call(c, "/ops/clients");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/launcher");
    expect(warned("deny")).toBe(false);
  });
});

describe("staff tool gate: shadow (the default)", () => {
  it("unset or any other value passes everything and logs would_deny", async () => {
    for (const mode of [undefined, "Enforce", "on"]) {
      if (mode) vi.stubEnv("STAFF_TOOLS_MODE", mode);
      const c = as({ ops_role: "operator", staff_tools: [] });
      expect(passed(await call(c, "/ops/clients")), String(mode)).toBe(true);
      expect(passed(await call(c, "/api/ops/clients")), String(mode)).toBe(true);
    }
    expect(warned("would_deny")).toBe(true);
    expect(warned("deny")).toBe(false);
  });
});

describe("x-ops-tools header", () => {
  it("a client-supplied value is stripped; the grant comes only from app_metadata", async () => {
    const forged = { "x-ops-tools": "ops/clients,ops/backups" };
    expect(toolsHeader(await call(as({ ops_role: "operator" }), "/", forged))).toBeNull();
    expect(toolsHeader(await call(as({ ops_role: "operator", staff_tools: ["social", "not-a-tool"] }), "/", forged))).toBe("social");
    expect(toolsHeader(await call(as({ ops_role: "operator", staff_tools: [] }), "/", forged))).toBe("");
  });

  it("decodes back to the grant; an empty value is set-but-empty, absent is never set", () => {
    expect(decodeToolsHeader("social,ops/clients")).toEqual(["social", "ops/clients"]);
    expect(decodeToolsHeader("")).toEqual([]);
    expect(decodeToolsHeader(null)).toBeNull();
  });
});

describe("staffDenial / staffMayUseTool", () => {
  it("owner short-circuits; any one owning tool suffices for a shared API", () => {
    expect(staffDenial({ role: "owner", tools: [] }, "/api/nothing-here")).toBeNull();
    expect(staffDenial({ role: "operator", tools: ["design"] }, "/api/ops/org-search")).toBeNull();
    expect(staffDenial({ role: "operator", tools: ["design"] }, "/api/ops/clients")).toMatchObject({ reason: "not_granted" });
    expect(staffDenial({ role: "operator", tools: ["design"] }, "/api/ops/clients/acme")).toMatchObject({ reason: "not_granted" });
    expect(staffDenial({ role: "operator", tools: null }, "/ops/clients")).toMatchObject({ reason: "not_configured" });
  });
  it("a link shows for the owner, a ticked tool, and (shadow only) a person never set", () => {
    expect(staffMayUseTool({ role: "owner", tools: [] }, "ops/clients", "enforce")).toBe(true);
    expect(staffMayUseTool({ role: "viewer", tools: ["social"] }, "social", "enforce")).toBe(true);
    expect(staffMayUseTool({ role: "viewer", tools: ["social"] }, "ops/clients", "shadow")).toBe(false);
    expect(staffMayUseTool({ role: "viewer", tools: null }, "ops/clients", "shadow")).toBe(true);
    expect(staffMayUseTool({ role: "viewer", tools: null }, "ops/clients", "enforce")).toBe(false);
  });
});
