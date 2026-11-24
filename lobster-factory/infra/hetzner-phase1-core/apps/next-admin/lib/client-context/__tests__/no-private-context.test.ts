// K13 (ADR 020, plan CLIENT-CONTEXT-PLAN-20261121 F12): the current client/site comes only from the URL (`org`/`site`),
// registered through useClientContext. A page that finds its own source -- reads org/site/slug/brand from searchParams,
// stores one in localStorage, draws a site <select>, lists every site, or draws its own OrgPicker -- fails here.
// Scope: components/ (pages import them) and every page directory a door or the staff host serves (STAFF_ROUTE_GROUPS + each door.page), api routes excluded.
// LEGACY = files not moved yet (plan 4d, L1-L8): shrink only. The last test fails when an entry no longer violates.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { STAFF_ROUTE_GROUPS, nextAdminProducts } from "@/lib/portal/doors";
import { ROOT, posix, sources } from "@/lib/portal/__tests__/code-scan";

const PARAMS = new Set(["org", "site", "siteId", "slug", "client_slug", "brand"]);
const STORE_KEY = /site|org|client/i;
const PICKERS = new Set(["OrgPicker", "OrgUrlPicker"]);

/** Allowed to own the source: the context layer itself (hook, provider, rail, contract). */
const EXEMPT = (f: string) => f.startsWith("lib/client-context/") || f === "app/ClientRail.tsx" || f === "app/ClientContextProvider.tsx";

/** The client block itself, and pages that use it for something other than "the current client". One reason each; they
 *  must still use it (last test), so a page that stops does not keep a stale entry. */
const BLOCK_USES: Readonly<Record<string, string>> = {
  "app/(shell)/ops/clients/OrgPicker.tsx": "the block's own file: OrgUrlPicker renders OrgPicker",
  "app/(shell)/ops/clients/ClientPanelNav.tsx": "the /ops/clients sidebar: the client is the path slug (/ops/clients/<slug>), links navigate, no context layer",
  "app/(shell)/ops/sites/new/NewSiteForm.tsx": "a form field (onPick) choosing the owner of a site being created, not the page's current client",
};

/** File -> plan 4d batch (CLIENT-CONTEXT-PLAN-20261121.md:295) or K card that moves it. Only files that still violate;
 *  shrink, never grow. */
const LEGACY: Readonly<Record<string, string>> = {
  "app/(shell)/tools/outreach/OrgSwitcher.tsx": "L1 outreach: ?org and its own switcher (use-active-org)",
  "app/(shell)/ops/collect/page.tsx": "L2 data collection: OrgUrlPicker on ?slug",
  "app/(shell)/ops/integrations/page.tsx": "L2 integrations: OrgUrlPicker on ?slug",
  "app/(shell)/tools/banner/BannerStudio.tsx": "L5 banner: reads ?org",
  "app/(shell)/tools/banner/BannerStudioStaff.tsx": "L5 banner: own OrgPicker",
  "app/(shell)/tools/video/OrganizationPicker.tsx": "L6 workbench pages: own OrgPicker over /api/video/workbench/bootstrap",
};

export const scanDirs = (): string[] => {
  const dirs = ["components", ...STAFF_ROUTE_GROUPS.map((g) => `app/${g}`), ...nextAdminProducts().map((p) => `app${p.door.page}`)];
  return [...new Set(dirs)].filter((d) => existsSync(path.join(ROOT, d)));   // a reserved door has no directory yet
};
const sourceFiles = (): string[] => scanDirs().flatMap((d) => sources(path.join(ROOT, d)).map(posix)).filter((f) => !f.startsWith("app/api/"));

const str = (n: ts.Node | undefined): string | null => (n && ts.isStringLiteralLike(n) ? n.text : null);

/** Why `src` privately sources the current client or site; empty = clean. */
export function privateSources(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const { name, expression: recv } = n.expression;
      const arg = str(n.arguments[0]);
      if (name.text === "get" && arg && PARAMS.has(arg)) hits.push(`param:${arg}`);
      if (["getItem", "setItem"]   /* removeItem cleans a retired key: not a source */.includes(name.text) && /^(?:window\.)?(?:localStorage|sessionStorage)$/.test(recv.getText(sf)) && arg && STORE_KEY.test(arg)) hits.push(`storage:${arg}`);
    }
    // server pages: props.searchParams.org / searchParams?.org
    if (ts.isPropertyAccessExpression(n) && PARAMS.has(n.name.text) && /^(?:\w+\.)?searchParams$/.test(n.expression.getText(sf).replace(/\?/g, ""))) hits.push(`param:${n.name.text}`);
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sf);
      if (PICKERS.has(tag)) hits.push(`picker:${tag}`);
      if (tag === "select" && /site/i.test((ts.isJsxOpeningElement(n) ? n.parent : n).getText(sf))) hits.push("select:site");
    }
    // a list request: the URL is a call's first argument and the call is not a write (POST creates a site, no list)
    if (ts.isCallExpression(n)) {
      const a = n.arguments[0];
      const lit = a && (ts.isStringLiteralLike(a) ? a.text : ts.isTemplateExpression(a) ? a.head.text : null);
      const write = /method\s*:\s*["'](?!GET)/i.test(n.arguments[1]?.getText(sf) ?? "");
      if (lit && /^\/api\/content\/sites(?:$|[?#])/.test(lit) && !write && !/organizationId|siteId/.test(a.getText(sf))) hits.push("fetch:/api/content/sites unfiltered");
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return [...new Set(hits)];
};

const violations = (f: string) => privateSources(f, readFileSync(path.join(ROOT, f), "utf8"));

describe("no page keeps its own current client or site (ADR 020)", () => {
  it("scans every door page directory", () => {
    const files = sourceFiles();
    for (const p of nextAdminProducts().filter((x) => existsSync(path.join(ROOT, `app${x.door.page}`)))) expect(files.some((f) => f.startsWith(`app${p.door.page}/`)), p.key).toBe(true);
    for (const f of [
      "app/(shell)/tools/content/ContentStudio.tsx", "app/(shell)/tools/content/sites/SiteManager.tsx", "app/(shell)/tools/content/topics/TopicsBoard.tsx",
    ]) expect(files, f).toContain(f);
    expect(files.some((f) => f.startsWith("app/(shell)/tools/video/")) && files.some((f) => f.startsWith("app/(shell)/ops/clients/"))).toBe(true);
  });

  it("no file outside the context layer and LEGACY reads, stores, lists or picks the client itself", () => {
    const bad = sourceFiles().filter((f) => !EXEMPT(f) && !(f in LEGACY) && !(f in BLOCK_USES)).map((f) => [f, violations(f)] as const).filter(([, v]) => v.length);
    expect(bad.map(([f, v]) => `${f}: ${v.join(", ")}`)).toEqual([]);
  });

  it("detector catches each source (private searchParams, storage, select, unfiltered sites, own picker)", () => {
    const hit = (code: string) => privateSources("x.tsx", code);
    expect(hit(`const a = searchParams.get("siteId");`)).toContain("param:siteId");
    expect(hit(`new URLSearchParams(location.search).get("client_slug")`)).toContain("param:client_slug");
    expect(hit(`localStorage.setItem("sf_site", id)`)).toContain("storage:sf_site");
    expect(hit(`const x = <select value={siteId} />`)).toContain("select:site");
    expect(hit(`fetch("/api/content/sites")`)).toContain("fetch:/api/content/sites unfiltered");
    expect(hit(`fetch(\`/api/content/sites?organizationId=\${o}\`)`)).toEqual([]);
    expect(hit(`const x = <OrgPicker orgs={o} />`)).toContain("picker:OrgPicker");
    expect(hit(`const t = searchParams.get("tab")`)).toEqual([]);
    expect(hit(`localStorage.removeItem("sf_site")`)).toEqual([]);
    expect(hit(`fetch("/api/content/sites", { method: "POST" })`)).toEqual([]);
    expect(hit(`const p = { sitesPath: "/api/content/sites" }`)).toEqual([]);
  });

  it("every BLOCK_USES file still uses the block", () => {
    for (const f of Object.keys(BLOCK_USES)) expect(violations(f), `${f}: no longer uses the block -- remove it`).toEqual(expect.arrayContaining([expect.stringMatching(/^picker:/)]));
  });

  it("every LEGACY file exists, still violates, and names its batch", () => {
    const files = new Set(sourceFiles());
    for (const [f, why] of Object.entries(LEGACY)) {
      expect(files.has(f), `${f}: not a scanned file any more -- remove it`).toBe(true);
      expect(violations(f).length, `${f}: clean now -- remove it from LEGACY`).toBeGreaterThan(0);
      expect(why, f).toMatch(/^(?:L[1-8]|K\d+)\b/);
    }
  });
});
