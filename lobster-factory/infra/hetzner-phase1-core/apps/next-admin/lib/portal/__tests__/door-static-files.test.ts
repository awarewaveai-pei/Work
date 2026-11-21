// Card R9: content.aware-wave.com/sites showed every intro style preview broken. On a product door a path that is not the
// product's own is served under its page prefix, so /editor-shared/intro-styles/title-card.jpg became
// /content/editor-shared/... (no such file: 404). The data-free public/ files every page loads by fixed URL (STATIC_PAGES,
// the one list the staff door uses too) pass on every product door for a signed-in identity -- nothing else widens.
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const user = vi.hoisted(() => ({ current: null as null | { id: string; app_metadata: Record<string, unknown> } }));
vi.mock("@/lib/supabase/ssr", () => ({
  isSupabaseAuthConfigured: () => true,
  createSupabaseMiddlewareClient: () => ({
    supabase: { auth: { getUser: async () => (user.current ? { data: { user: user.current }, error: null } : { data: { user: null }, error: { status: 401 } }) } },
    refreshedCookies: [],
  }),
}));

import { middleware } from "../../../middleware";
import { STAFF_ROUTE_GROUPS, STATIC_PAGES } from "../doors";
import { STAFF_PLATFORM } from "../staff-tools";

let n = 0;
const on = (host: string, path: string, who: "client" | null) => {
  n += 1;   // a fresh cookie each call: the middleware caches a validated session by its token
  user.current = who ? { id: `u-${n}`, app_metadata: { user_kind: "client", org_id: "11111111-1111-4111-8111-111111111111", ops_role: "viewer" } } : null;
  return middleware(new NextRequest(`https://${host}${path}`, { headers: { host, cookie: `sb-test-auth-token=r9-${n}-${path}` } }));
};

describe("data-free static files on a product door", () => {
  it("a signed-in customer on content.aware-wave.com gets the intro previews as they are; data paths do not widen", async () => {
    const res = await on("content.aware-wave.com", "/editor-shared/intro-styles/title-card.jpg", "client");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();   // was /content/editor-shared/... -> 404 (broken picture)
    expect(res.headers.get("x-middleware-next")).toBe("1");
    // no session: still the login gate (nothing opens to anonymous)
    expect((await on("content.aware-wave.com", "/editor-shared/intro-styles/title-card.jpg", null)).status).toBe(307);
    // data stays where it was: another API is 404, a staff page is still served under the product prefix
    expect((await on("content.aware-wave.com", "/api/ops/clients", "client")).status).toBe(404);
    expect((await on("content.aware-wave.com", "/ops/clients", "client")).headers.get("x-middleware-rewrite")).toBe("https://content.aware-wave.com/content/ops/clients");
    // one list: the staff door's platform pages are the same static paths
    for (const p of STATIC_PAGES) expect(STAFF_PLATFORM.pages).toContain(p);
    // only static files: no name in the list is an app route (a customer would reach that page on every door), and each is
    // a public/ folder or a location nginx serves itself
    const app = path.join(process.cwd(), "app"), nginx = readFileSync(path.join(process.cwd(), "../../nginx/default.conf"), "utf8");
    for (const p of STATIC_PAGES) {
      for (const dir of ["", ...STAFF_ROUTE_GROUPS, "(public)"]) expect(existsSync(path.join(app, dir, p)), `app/${dir}${p}`).toBe(false);
      expect(existsSync(path.join(process.cwd(), "public", p)) || nginx.includes(`location ^~ ${p}/ {`), p).toBe(true);
    }
  });
});
