// What products.ts claims, checked against the code: a door API is a real route prefix (ADR 018 §1); every declared
// feature is asked by a grantFor/withFeature call site (ADR 017 §4); a product whose code calls another product's
// routes or bills its features declares it in dependsOn or optional (ADR 017 §0b). Plain library imports across
// lib/<key>/ are not dependencies: one app ships whole (ADR 017 §5), so code location is not what must be installed.
// Limits: an /api URL built without a literal "/api/..." prefix, a template whose later parts leave that prefix
// (".."), or a key passed through a variable, is not seen.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { BACK_OFFICE_FEATURES } from "../../entitlements/can";
import { ROUTE_FEATURES } from "../../entitlements/route-features";
import { PLATFORM_APIS, doorApis, nextAdminProducts, type NextAdminProduct } from "../doors";
import { PRODUCTS, type PortalProduct } from "../products";

const ROOT = path.join(__dirname, "../../..");
const posix = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const under = (p: string, prefix: string) => p === prefix || p.startsWith(`${prefix}/`);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (["node_modules", ".next", "__tests__"].includes(e.name)) return [];
    const f = path.join(dir, e.name);
    if (e.isDirectory()) return sources(f);
    return /\.[cm]?[jt]sx?$/.test(e.name) && !/\.(?:test|spec|d)\.[cm]?[jt]sx?$/.test(e.name) ? [f] : [];
  });
}

// apis: every "/api/..." literal (registry tables included); calls: only those passed to a call or `new`, or set as a
// JSX attribute -- what a page actually requests. Type-only imports are erased at build, so they are not imports.
interface Scan { asked: string[]; apis: string[]; calls: string[]; imports: string[]; meters: boolean }
const unwrap = (n: ts.Node | undefined): ts.Node | undefined =>
  n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isNonNullExpression(n) || ts.isTypeAssertionExpression(n)) ? unwrap(n.expression) : n;
const apiText = (node: ts.Node | undefined) => {
  const n = unwrap(node);
  const t = n && (ts.isStringLiteralLike(n) ? n.text : ts.isTemplateExpression(n) ? n.head.text : null);
  return t?.startsWith("/api/") ? t.split(/[?#]/)[0].replace(/\/$/, "") : null;
};
const typeOnly = (n: ts.ImportDeclaration | ts.ExportDeclaration) => ts.isExportDeclaration(n) ? n.isTypeOnly
  : !!n.importClause && (n.importClause.isTypeOnly || (!n.importClause.name && !!n.importClause.namedBindings
    && ts.isNamedImports(n.importClause.namedBindings) && n.importClause.namedBindings.elements.length > 0
    && n.importClause.namedBindings.elements.every((e) => e.isTypeOnly)));
function scan(file: string, text: string): Scan {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Scan = { asked: [], apis: [], calls: [], imports: [], meters: false };
  const spec = (s: string) => {
    const r = s.startsWith("@/") ? s.slice(2) : s.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), s)) : null;
    if (r) out.imports.push(r);
  };
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteralLike(n.moduleSpecifier) && !typeOnly(n)) spec(n.moduleSpecifier.text);
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) for (const a of n.arguments ?? []) { const u = apiText(a); if (u) out.calls.push(u); }
    if (ts.isJsxAttribute(n) && n.initializer) {
      const u = apiText(ts.isJsxExpression(n.initializer) ? n.initializer.expression : n.initializer);
      if (u) out.calls.push(u);
    }
    if (ts.isCallExpression(n)) {
      const arg = n.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) {
        if (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require")) spec(arg.text);
        if (ts.isIdentifier(n.expression) && ["grantFor", "withFeature"].includes(n.expression.text)) out.asked.push(arg.text);
      }
      if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "recordUse") out.meters = true;
      const featureArg = n.arguments[1];
      if (ts.isIdentifier(n.expression) && n.expression.text === "can" && featureArg && ts.isStringLiteralLike(featureArg)) out.asked.push(featureArg.text);
    }
    const u = apiText(n);
    if (u) out.apis.push(u);
    ts.forEachChild(n, visit);
  };
  visit(source);
  return out;
}

const FILES = new Map(["app", "lib"].flatMap((d) => sources(path.join(ROOT, d))).map((f) => {
  const rel = posix(f);
  return [rel, scan(rel, readFileSync(f, "utf8"))] as const;
}));
const resolve = (spec: string) => {
  const r = spec.replace(/\.[cm]?js$/, "");   // ESM-style "./x.js" names the x.ts source
  return [r, `${r}.ts`, `${r}.tsx`, `${r}/index.ts`, `${r}/index.tsx`].find((c) => FILES.has(c)) ?? null;
};

// Code a product owns: lib/<key>/, its staff paths, its door page and door API directories (longest prefix wins).
const OWNED = PRODUCTS.flatMap((p) => [`lib/${p.key}`, ...p.staffPaths.map((s) => `app/(shell)/${s}`),
  ...(p.door.app === "next-admin" ? [`app${p.door.page}`, ...p.door.api.map((a) => `app${a}`)] : [])].map((dir) => ({ dir, key: p.key })))
  .sort((a, b) => b.dir.length - a.dir.length);
const ownerOfFile = (rel: string) => OWNED.find((o) => rel.startsWith(`${o.dir}/`))?.key ?? null;
const FEATURE_OWNER = new Map(PRODUCTS.flatMap((p) => p.features.map((f) => [f.feature_key, p.key] as const)));
const ownerOfApi = (url: string) => nextAdminProducts().find((p) => p.door.api.some((a) => under(url, a)))?.key
  ?? FEATURE_OWNER.get(ROUTE_FEATURES[url] ?? "") ?? null;

function closure(key: string, seen = new Set<string>()): Set<string> {
  for (const d of PRODUCTS.find((p) => p.key === key)?.modules.dependsOn ?? []) if (!seen.has(d)) { seen.add(d); closure(d, seen); }
  return seen;
}
const optional = (p: PortalProduct): readonly string[] => p.modules.optional ?? [];

/** What a door renders from these directories: every file imported, transitively, from the pages under them. Routes
 *  are not in it (pages fetch them; each route authorizes itself). */
const loginPages = (p: NextAdminProduct) => [`app${p.door.page}/`];
const allPages = (p: NextAdminProduct) => [...loginPages(p), ...(p.door.anonymous ?? []).map((a) => `app/(public)${a}/`)];
/** Doors whose page exists, open or not: the gates hold from the day a door page is built, before it goes live
 *  (going live = enabled + DNS + nginx, middleware-portal-guards.test.ts). */
const builtDoors = () => nextAdminProducts().filter((p) => existsSync(path.join(ROOT, "app", p.door.page.slice(1), "page.tsx")));
const isRoute = (f: string) => /\/route\.[cm]?[jt]sx?$/.test(f);
function doorFiles(roots: readonly string[]): Set<string> {
  return importClosure([...FILES.keys()].filter((f) => roots.some((r) => f.startsWith(r)) && !isRoute(f)));
}
function importClosure(start: readonly string[], stopAt: ReadonlySet<string> = new Set()): Set<string> {
  const todo = [...start];
  const seen = new Set<string>();
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    if (stopAt.has(f)) continue;
    for (const r of FILES.get(f)!.imports) { const g = resolve(r); if (g) todo.push(g); }
  }
  return seen;
}

/** Every place a product's code reaches another product: its routes, or a feature it asks for (directly, or in a file it imports). */
function edges(): Array<{ from: string; to: string; why: string }> {
  const out: Array<{ from: string; to: string; why: string }> = [];
  for (const [rel, s] of FILES) {
    const from = ownerOfFile(rel);
    if (!from) continue;
    const add = (to: string | null | undefined, why: string) => { if (to && to !== from) out.push({ from, to, why: `${rel}: ${why}` }); };
    for (const u of s.apis) add(ownerOfApi(u), u);
    for (const k of s.asked) add(FEATURE_OWNER.get(k), `asks ${k}`);
    for (const r of s.imports) {
      const f = resolve(r);
      const to = f && ownerOfFile(f);
      if (f && to) for (const k of FILES.get(f)!.asked) if (FEATURE_OWNER.get(k) === to) add(to, `imports ${f}, which asks ${k}`);
    }
  }
  return out;
}

describe("registry claims match the code", () => {
  it("every door API prefix is an existing route directory a door can serve, owned by one product", () => {
    const doors = nextAdminProducts();
    const routeFile = (dir: string): boolean => readdirSync(dir, { withFileTypes: true })
      .some((e) => (e.isDirectory() ? routeFile(path.join(dir, e.name)) : /^route\.[cm]?[jt]sx?$/.test(e.name)));
    for (const p of doors) for (const a of p.door.api) {
      // middleware's matcher skips these, so no door ever routes them (ADR 018 §1)
      expect(under(a, "/api/webhooks") || under(a, "/api/internal"), `${p.key} ${a}`).toBe(false);
      const dir = path.join(ROOT, "app", ...a.split("/").filter(Boolean));
      expect(existsSync(dir) && routeFile(dir), `${p.key} ${a}: no route under app${a}`).toBe(true);
      for (const q of doors) if (q !== p) for (const b of q.door.api) expect(under(a, b), `${p.key} ${a} inside ${q.key} ${b}`).toBe(false);
    }
  });

  it("every feature of a next-admin product is asked by a call site, and every asked key is declared", () => {
    const asked = new Set([...FILES.values()].flatMap((s) => s.asked));
    for (const p of PRODUCTS.filter((x) => x.door.app === "next-admin")) {
      for (const f of p.features) expect(asked.has(f.feature_key), `${f.feature_key}: no grantFor/withFeature asks it`).toBe(true);
    }
    for (const k of BACK_OFFICE_FEATURES) expect(asked.has(k), `${k}: back-office key nothing asks`).toBe(true);
    for (const k of asked) expect(FEATURE_OWNER.has(k) || BACK_OFFICE_FEATURES.has(k), `${k}: asked but not declared`).toBe(true);
  });

  // ADR 017 §4: usage is recorded where a grant reaches paid work (Grant.recordUse at the gateway / collect seams, or at
  // the one call site whose paid work runs out of process). A credits feature none of whose askers reaches such a call
  // would be used and never counted, so it could never be billed. Like gate 3, this proves the import, not the data path.
  it("every credits-billed feature is asked by code that reaches a usage meter", () => {
    const meters = new Set([...FILES].filter(([, s]) => s.meters).map(([f]) => f));
    expect([...meters].sort()).toEqual(expect.arrayContaining(["lib/ai/gateway.ts", "lib/collect/net/providers.ts"]));
    for (const p of PRODUCTS.filter((x) => x.door.app === "next-admin")) {
      for (const f of p.features.filter((x) => x.billing === "credits")) {
        const askers = [...FILES].filter(([, s]) => s.asked.includes(f.feature_key)).map(([file]) => file);
        const metered = askers.some((a) => [...importClosure([a])].some((g) => meters.has(g)));
        expect(metered, `${f.feature_key}: asked in ${askers.join(", ")}, none reaches recordUse`).toBe(true);
      }
    }
  });

  it("a product reaching another product's routes or features declares it, and declares nothing it does not reach", () => {
    const found = edges();
    const missing = found.filter((e) => {
      const p = PRODUCTS.find((x) => x.key === e.from)!;
      return !closure(p.key).has(e.to) && !optional(p).includes(e.to);
    });
    expect(missing.map((e) => `${e.from} -> ${e.to} (${e.why})`)).toEqual([]);
    for (const p of PRODUCTS.filter((x) => x.door.app === "next-admin")) {
      for (const d of [...p.modules.dependsOn, ...optional(p)].filter((k) => PRODUCTS.some((x) => x.key === k))) {
        expect(found.some((e) => e.from === p.key && e.to === d), `${p.key} declares ${d} but its code never reaches it`).toBe(true);
      }
    }
    for (const p of PRODUCTS) for (const d of optional(p)) expect(PRODUCTS.some((x) => x.key === d), `${p.key} optional ${d}`).toBe(true);
  });

  it("a standalone product's required closure carries no SAFETY_GATE feature (it must install alone, ADR 017 §5)", () => {
    for (const p of PRODUCTS.filter((x) => x.standalone)) {
      for (const k of closure(p.key)) {
        for (const f of PRODUCTS.find((x) => x.key === k)?.features ?? []) expect(f.limitKind, `${p.key} -> ${k}: ${f.feature_key}`).not.toBe("SAFETY_GATE");
      }
    }
  });

  // A served door answers only doorApis() (doors.ts routeOnProductDoor); any other call 404s on the door.
  it("a built door can reach every API its pages call", () => {
    for (const p of builtDoors()) {
      expect(doorFiles(loginPages(p)).size, `${p.key}: no files under app${p.door.page}`).toBeGreaterThan(0);
      const apis = doorApis(p);
      const unreachable = [...doorFiles(allPages(p))].flatMap((f) => FILES.get(f)!.calls.filter((u) => !apis.some((a) => under(u, a))).map((u) => `${f}: ${u}`));
      expect(unreachable, `${p.key} door`).toEqual([]);
    }
  });

  // A signed-in customer on a product door sees only brands they belong to (ADR 018 §1): its pages read through
  // brand-scoped routes, never with the service-role client staff pages use. No-login pages (door.anonymous) are
  // public by declaration and serve published data only, so they are not in scope here.
  it("a built door's signed-in pages never read with the service-role client", () => {
    for (const p of builtDoors()) {
      const direct = [...doorFiles(loginPages(p))].filter((f) => FILES.get(f)!.imports.some((r) => r === "lib/supabase-server"));
      expect(direct, `${p.key} door`).toEqual([]);
    }
  });

  // ADR 018 §2 開門規則 2: every route a door serves decides who the caller may see -- by organization
  // (lib/tenant-guard) or by brand (lib/social/authz) -- itself or through what it imports. The billing subject
  // (lib/entitlements/grant) counts only for a route that reads no database: it says who pays, not what may be read.
  // A staff role check (lib/ops-role) is not organization scoping, so the walk stops there.
  // This catches a route that forgot authorization, not one that imports it and skips it: opening a door also means
  // reading each route's data path (WORKLOG of that door).
  const AUTHORIZERS = ["lib/tenant-guard.ts", "lib/social/authz.ts"];
  const STOP_AT = new Set(["lib/ops-role.ts"]);
  const BILLING = "lib/entitlements/grant.ts";
  // the route's own data access, not the entitlement store grant.ts reads on its behalf
  const readsDb = (r: string) => importClosure([r], new Set([...STOP_AT, BILLING])).has("lib/supabase-server.ts");
  // Routes a door serves that read no organization's data, each read for it; listed in place of an authorizer.
  const ORG_FREE_ROUTES: Readonly<Record<string, string>> = {
    "app/api/tools/events/upcoming/route.ts": "shared holiday table `events`, no organization column",
    "app/api/tools/studio/proxy-image/route.ts": "streams only public designs-bucket objects (exact-host allowlist)",
    "app/api/tools/studio/mockup/route.ts": "Printful mockup (free) from the request image and the public catalog; uploads that image to the shared public designs bucket and shares the Printful store quota",
  };
  const routesUnder = (prefix: string) => [...FILES.keys()].filter((f) => isRoute(f) && (f.startsWith(`app${prefix}/`)));
  const authorizes = (r: string) => r in ORG_FREE_ROUTES || AUTHORIZERS.some((a) => importClosure([r], STOP_AT).has(a))
    || (!readsDb(r) && importClosure([r], STOP_AT).has(BILLING));
  it("every route a built door serves authorizes its caller", () => {
    for (const p of builtDoors()) {
      expect([...new Set(doorApis(p).flatMap(routesUnder))].filter((r) => !authorizes(r)), `${p.key} door`).toEqual([]);
    }
    const served = new Set(builtDoors().flatMap((p) => doorApis(p).flatMap(routesUnder)));
    for (const [r, why] of Object.entries(ORG_FREE_ROUTES)) {
      expect(served.has(r), `${r}: listed but no built door serves it`).toBe(true);
      expect(why.trim().length, r).toBeGreaterThan(0);
    }
  });

  // A library grantFor with no request scope is judged for the internal account as `system` (lib/entitlements/grant.ts),
  // so a route a door serves that reaches one must ask its feature itself (withFeature, or grantFor with the request).
  // This proves the caller's feature is asked, not that it is charged: report() is not wired yet (ADR 017 §4).
  // Routes whose imports reach grant.ts but that never run a paid call, each read for it.
  const UNPAID_ROUTES: Readonly<Record<string, string>> = {
    "app/api/social/reports/monthly/route.ts": "toggles a client_schedules row; reads job defaults from lib/schedules/jobs.ts, never runs a job",
  };
  it("every paid route a built door serves asks its caller's feature", () => {
    const served = new Set<string>();
    for (const p of builtDoors()) {
      const routes = [...new Set(doorApis(p).flatMap(routesUnder))];
      routes.forEach((r) => served.add(r));
      const unbilled = routes.filter((r) => !(r in UNPAID_ROUTES) && FILES.get(r)!.asked.length === 0 && importClosure([r], STOP_AT).has("lib/entitlements/grant.ts"));
      expect(unbilled, `${p.key} door`).toEqual([]);
    }
    for (const r of Object.keys(UNPAID_ROUTES)) expect(served.has(r), `${r}: listed but no built door serves it`).toBe(true);
  });

  it("a platform API authorizes by organization or reads no organization's data", () => {
    for (const prefix of PLATFORM_APIS) {
      const routes = routesUnder(prefix);
      expect(routes.length, prefix).toBeGreaterThan(0);
      for (const r of routes) expect(r in ORG_FREE_ROUTES || importClosure([r], STOP_AT).has("lib/tenant-guard.ts"), r).toBe(true);
    }
  });

  it("the scanner sees literal asks, URLs in templates, and keys in an imported file", () => {
    const s = scan("lib/x/a.ts", 'import { g } from "@/lib/tarot/b"; await grantFor("studio.image"); fetch(`/api/tools/studio/x?y=${1}`); const s = "/api/social/";');
    expect(s).toEqual({ asked: ["studio.image"], apis: ["/api/tools/studio/x", "/api/social"], calls: ["/api/tools/studio/x"], imports: ["lib/tarot/b"], meters: false });
    expect(scan("lib/x/m.ts", "void grant.recordUse({}); recordUse();").meters).toBe(true);
    expect(scan("lib/x/m.ts", "recordUse(); // grant.recordUse()").meters).toBe(false);
    const j = scan("app/x/p.tsx", 'import type { T } from "@/lib/a"; import { type U } from "@/lib/b"; import { v, type W } from "@/lib/c"; require("@/lib/d"); const f = <form action="/api/a/b" />; new EventSource(`/api/c/${1}`); fetch(("/api/e" as const)); const tbl = ["/api/d"];');
    expect(j.imports).toEqual(["lib/c", "lib/d"]);
    expect(j.calls).toEqual(["/api/a/b", "/api/c", "/api/e"]);
    expect(scan("lib/x/a.ts", 'grant("studio.image"); x.grantFor("studio.image"); // grantFor("cs.answer")').asked).toEqual([]);
  });
});
