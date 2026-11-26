// K28: the full bake-off pages on the 實測紀錄 tab. Staff only (middleware + staffOnly), a fixed slug list, served
// sandboxed; the tab embeds each one; the copies in content/ match agency-os/reports/model-bakeoff/.
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

const user = vi.hoisted(() => ({ current: null as null | { id: string; app_metadata: Record<string, unknown> } }));
vi.mock("@/lib/supabase/ssr", () => ({
  isSupabaseAuthConfigured: () => true,
  createSupabaseMiddlewareClient: () => ({
    supabase: { auth: { getUser: async () => (user.current ? { data: { user: user.current }, error: null } : { data: { user: null }, error: { status: 401 } }) } },
    refreshedCookies: [],
  }),
}));

import { middleware } from "../../../../../middleware";
import { GET } from "../bakeoff/[slug]/route";
import MeasuredRuns from "../MeasuredRuns";
import { BAKEOFF_SLUGS } from "../bakeoff-pages";

const APP = path.resolve(__dirname, "../../../../..");
const REPO = path.resolve(APP, "../../../../..");
let n = 0;
const viaMiddleware = (meta: Record<string, unknown> | null) => {
  user.current = meta ? { id: `u-${++n}`, app_metadata: meta } : null;
  return middleware(new NextRequest("https://app.aware-wave.com/tools/ai-models/bakeoff/article",
    { headers: { host: "app.aware-wave.com", ...(meta ? { cookie: `sb-test-auth-token=k28-${n}` } : {}) } }));
};
const get = (slug: string, kind = "staff") =>
  GET(new Request(`https://app.aware-wave.com/tools/ai-models/bakeoff/${encodeURIComponent(slug)}`, { headers: { "x-ops-user-kind": kind } }),
    { params: Promise.resolve({ slug }) });

describe("bakeoff route", () => {
  it("not signed in: middleware sends the caller to /login", async () => {
    const res = await viaMiddleware(null);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("a customer is refused by middleware and by the route itself", async () => {
    const res = await viaMiddleware({ user_kind: "client", org_id: "00000000-0000-4000-8000-000000000001" });
    expect(res.headers.get("x-middleware-next")).not.toBe("1");
    expect((await get("article", "client")).status).toBe(403);
  });

  it("a slug outside the list is 404, path tricks included", async () => {
    for (const slug of ["nope", "../article", "..%2Farticle", "article/../../package.json", "Article"]) expect((await get(slug)).status, slug).toBe(404);
  });

  it("each listed slug is 200 html, sandboxed and nosniff", async () => {
    for (const slug of BAKEOFF_SLUGS) {
      const res = await get(slug);
      expect(res.status, slug).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(res.headers.get("content-security-policy")).toBe("sandbox allow-scripts");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect((await res.text()).startsWith("<!doctype html>")).toBe(true);
    }
  });
});

describe("實測紀錄 tab", () => {
  it("embeds each full page in a sandboxed iframe, each with an open-in-full link", () => {
    const html = renderToStaticMarkup(MeasuredRuns());
    for (const slug of BAKEOFF_SLUGS) {
      const href = `/tools/ai-models/bakeoff/${slug}`;
      expect(html, slug).toMatch(new RegExp(`<iframe src="${href}" sandbox="allow-scripts"`));
      expect(html, slug).toMatch(new RegExp(`<a href="${href}" target="_blank"[^>]*>另開完整頁面</a>`));
    }
  });
});

// The source lives outside the app; sg-deploy ships the app alone, so the host has no source to compare with.
describe.skipIf(!existsSync(path.join(REPO, "agency-os/reports/model-bakeoff")))("content/model-bakeoff copies", () => {
  it("match what scripts/sync-model-bakeoff-pages.mjs writes from the source; the article page fetches nothing", () => {
    execFileSync(process.execPath, [path.join(REPO, "scripts/sync-model-bakeoff-pages.mjs"), "--check"], { stdio: "pipe" });
    const article = readFileSync(path.join(APP, "content/model-bakeoff/article/index.html"), "utf8");
    expect(article).not.toContain('fetch("articles.json")');
  });
});
