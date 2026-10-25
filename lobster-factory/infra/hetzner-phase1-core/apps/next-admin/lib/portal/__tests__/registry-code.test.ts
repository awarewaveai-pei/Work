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
import { ROOT, under, sources, scan, FILES, resolve, isRoute, importClosure } from "./code-scan";

// Code a product owns: lib/<key>/, its staff paths, its door page and door API directories (longest prefix wins).
const OWNED = PRODUCTS.flatMap((p) => [`lib/${p.key}`, ...p.staffPaths.map((s) => `app/(shell)/${s}`),
  ...(p.door.app === "next-admin" ? [`app${p.door.page}`, ...p.door.api.map((a) => `app${a}`)] : [])].map((dir) => ({ dir, key: p.key })))
  .sort((a, b) => b.dir.length - a.dir.length);
const ownerOfFile = (rel: string) => OWNED.find((o) => rel.startsWith(`${o.dir}/`))?.key ?? null;
const FEATURE_OWNER = new Map(PRODUCTS.flatMap((p) => p.features.map((f) => [f.feature_key, p.key] as const)));
const ownerOfApi = (url: string) => nextAdminProducts().find((p) => p.door.api.some((a) => under(url, a)))?.key
  ?? FEATURE_OWNER.get([ROUTE_FEATURES[url] ?? ""].flat()[0]) ?? null;

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
function doorFiles(roots: readonly string[]): Set<string> {
  return importClosure([...FILES.keys()].filter((f) => roots.some((r) => f.startsWith(r)) && !isRoute(f)));
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
  // The one exception, read for it: the door's own "does this account hold the product" check (ProductDoorShell).
  const DOOR_OWN_ORG_READS: Readonly<Record<string, string>> = {
    "lib/entitlements/door-holds.ts": "reads only the caller's own organization's entitlement rows (x-ops-org-id set by middleware); the table is service-role-only",
  };
  // Each exception has a test that pins its organization filter (Codex 2026-10-24 F2: an import check cannot).
  const DOOR_OWN_ORG_READ_TESTS: Readonly<Record<string, string>> = { "lib/entitlements/door-holds.ts": "lib/entitlements/__tests__/door-holds.test.ts" };
  it("a built door's signed-in pages never read with the service-role client", () => {
    for (const p of builtDoors()) {
      const direct = [...doorFiles(loginPages(p))].filter((f) => !(f in DOOR_OWN_ORG_READS) && FILES.get(f)!.imports.some((r) => r === "lib/supabase-server"));
      expect(direct, `${p.key} door`).toEqual([]);
    }
    for (const f of Object.keys(DOOR_OWN_ORG_READS)) {
      expect(FILES.get(f)?.imports, f).toContain("lib/supabase-server");
      expect(readFileSync(path.join(ROOT, DOOR_OWN_ORG_READ_TESTS[f] ?? "-"), "utf8"), f).toMatch(/"organization_id"/);
    }
  });

  // ADR 018 §2 開門規則 2: every route a door serves decides who the caller may see -- by organization
  // (lib/tenant-guard) or by brand (lib/social/authz). A route that reads the database makes that decision itself: it
  // imports, by name, one of the AUTHORIZERS functions below and calls it. A guard module reached through some other
  // import does not count -- r2-delete-guard reaches tenant-guard through wp-sites, grant.ts through its billing subject, and
  // neither decides what the route reads (the presets hole, step-8 card P2). A route that reads no database may instead
  // ask a feature itself (withFeature / grantFor, lib/entitlements/grant): the subject is then the caller's own account
  // and nothing else is read. Reaching grant.ts or a guard only through an import decides nothing for the route.
  // This catches a route that forgot authorization, not one that calls it and ignores the answer: opening a door also
  // means reading each route's data path (WORKLOG of that door).
  /** Module -> its functions that decide what a caller may act on. Beyond the two guards, each is a library seam that
   *  calls them before it reads or writes, read for it. */
  const AUTHORIZERS: Readonly<Record<string, readonly string[]>> = {
    "lib/tenant-guard.ts": ["assertOrgAccess", "canAccessOrg", "effectiveOrgId", "requireClientOrg", "staffOnly"],
    "lib/social/authz.ts": ["actorFor", "callerOf", "requireBrandRole", "requireStaffForNewChannel"],
    "lib/content/wp-sites.ts": ["listAccessibleWpSites", "resolveWpSite", "siteRowGate"], // canAccessOrg / assertOrgAccess on the site's organization
    "lib/content/social-org.ts": ["resolveSocialOrg"],                        // assertOrgAccess on the named organization
    "lib/content/publish/wordpress-core.ts": ["publishToWordPress"],          // resolveWpSite before it reads a credential
    "lib/content/video/embed-in-post.ts": ["embedVideoInPost"],               // resolveWpSite before any read or write
    "lib/content/syndicate.ts": ["syndicateHandler"],                         // its one read, siteVoiceFor, checks the site's organization
    "lib/content/video/timeline-remotion-request.ts": ["prepareTimelineRemotionRequest"], // assertOrgAccess, then reads that org's assets
  };
  // What a route reaches that is not its own data: the role check, the caller's own grant (who it is, what it may use,
  // and runtime.ts, the store can() reads for that subject), the AI call log. Other lib/entitlements files are data
  // (tables.ts billingAttention: every organization's billing).
  const NOT_ROUTE_DATA = new Set(["lib/ops-role.ts", "lib/ai/log-ai-call.ts",
    ...["grant", "can", "subject", "runtime"].map((f) => `lib/entitlements/${f}.ts`)]);
  const readsDb = (r: string) => [...importClosure([r], NOT_ROUTE_DATA)].some((f) => !NOT_ROUTE_DATA.has(f) && FILES.get(f)!.db);
  const decidesItself = (r: string) => FILES.get(r)!.called.some((b) => {
    const [m, name] = b.split("#");
    const f = resolve(m);
    return !!f && (AUTHORIZERS[f] ?? []).includes(name);
  });
  // Routes a door serves that read no organization's data, each read for it; listed in place of an authorizer.
  const ORG_FREE_ROUTES: Readonly<Record<string, string>> = {
    "app/api/tools/events/upcoming/route.ts": "shared holiday table `events`, no organization column",
    "app/api/tools/image/process/route.ts": "converts the base64 image in the request body (sharp / Ghostscript); no database, no fetch, no paid model",
    "app/api/tools/studio/proxy-image/route.ts": "streams only public designs-bucket objects (exact-host allowlist)",
    "app/api/tools/designs/download/route.ts": "streams only public designs- and video-bucket objects as a download (exact-host allowlist); no database",
    "app/api/tools/studio/mockup/route.ts": "Printful mockup (free) from the request image and the public catalog; uploads that image to the shared public designs bucket and shares the Printful store quota",
    "app/api/content/seo-check/route.ts": "scores the article in the request body (lib/content/quality/seo-check-core.ts); no database, no stored data",
    "app/api/content/brand-voice/route.ts": "analyses the pasted sample, or a page fetched through lib/collect/net/remote-file (no internal host); stores nothing",
    "app/api/tools/printful/catalog/route.ts": "public Printful product catalog, cached 1h server-side (lib/studio/printful-catalog.ts); no database, nothing per organization",
    "app/api/video/capabilities/route.ts": "reports which features our own video-service supports (booleans, formats) and the provider policy; no database, nothing per organization",
    "app/api/entitlements/features/route.ts": "the caller's own feature list: resolveSubject({ req }) with no org hint (client -> its middleware org, staff -> internal), the subject withFeature uses; reads only that account's grant (NOT_ROUTE_DATA)",
    "app/api/content/trending/route.ts":"public news feeds, the shared content_sources table and the shared content_trends cache (no organization column on either; customers read sources, only staff write them, content/sources/route.ts; only feed items in a supported region reach the cache, lib/content/topics/trends.ts)",
  };
  const routesUnder = (prefix: string) => [...FILES.keys()].filter((f) => isRoute(f) && (f.startsWith(`app${prefix}/`)));
  const authorizes = (r: string) => r in ORG_FREE_ROUTES || decidesItself(r) || (!readsDb(r) && FILES.get(r)!.asked.length > 0);
  it("every route a built door serves authorizes its caller", () => {
    for (const p of builtDoors()) {
      expect([...new Set(doorApis(p).flatMap(routesUnder))].filter((r) => !authorizes(r)), `${p.key} door`).toEqual([]);
    }
    // Any declared door, built or not: a door's routes are made safe before its page is built.
    const declared = new Set(nextAdminProducts().flatMap((p) => doorApis(p).flatMap(routesUnder)));
    for (const [r, why] of Object.entries(ORG_FREE_ROUTES)) {
      expect(declared.has(r), `${r}: listed but no door serves it`).toBe(true);
      expect(why.trim().length, r).toBeGreaterThan(0);
    }
  });

  it("an authorizer is a function its module exports, imported by name; a guard reached through another import is not", () => {
    for (const [f, names] of Object.entries(AUTHORIZERS)) {
      const text = readFileSync(path.join(ROOT, f), "utf8");
      for (const n of names) expect(new RegExp(`export (?:async )?(?:function|const) ${n}\\b`).test(text), `${f} ${n}`).toBe(true);
    }
    const r = "app/api/x/route.ts";
    const judged = (text: string) => { FILES.set(r, scan(r, text)); return authorizes(r); };
    const db = 'import { getSupabaseWriteClient } from "@/lib/supabase-server";';
    try {
      expect(judged(`import { getWpSites } from "@/lib/content/wp-sites"; import { OrgAccessError } from "@/lib/tenant-guard"; ${db} getWpSites();`)).toBe(false);
      expect(judged(`import { effectiveOrgId as orgOf } from "@/lib/tenant-guard"; ${db}`)).toBe(false);          // imported, never called
      expect(judged(`import { effectiveOrgId as orgOf } from "@/lib/tenant-guard"; ${db} orgOf(req, null);`)).toBe(true);
      expect(judged('import { createClient } from "@supabase/supabase-js"; import { withFeature } from "@/lib/entitlements/grant";')).toBe(false);
      expect(judged('import { withFeature } from "@/lib/entitlements/grant"; import { billingAttention } from "@/lib/entitlements/tables";')).toBe(false);
      // grant.ts -> subject.ts -> tenant-guard, and grant.ts reached through a library, decide nothing for the route
      expect(judged('import { requestActor } from "@/lib/entitlements/subject"; requestActor(req);')).toBe(false);
      expect(judged('import { prepareArticleGeneration } from "@/lib/content/article/generate-core"; prepareArticleGeneration({});')).toBe(false);
      expect(judged('import { withFeature } from "@/lib/entitlements/grant"; export const POST = withFeature("studio.image", h);')).toBe(true);
    } finally { FILES.delete(r); }
  });

  // A library grantFor with no request scope is judged for the internal account as `system` (lib/entitlements/grant.ts),
  // so an API route whose imports reach a product feature's ask must ask it itself (withFeature, or grantFor with the
  // request): the person is the actor and, through withFeature's `org`, the customer worked for is the account. Routes
  // whose closure asks only back-office features need nothing: can() refuses those to every account but the internal one.
  // The closure is over-broad (barrels, shared helpers), so each listed route was read for why it may run unscoped.
  // Limit: a route that asks one feature passes, even if another paid call in it runs before or outside that scope.
  const UNSCOPED_ROUTES: Readonly<Record<string, string>> = {
    // no person calling; every paid ask names the org the work is for
    "app/api/webhooks/chatwoot/route.ts": "cs asks name the conversation's org (lib/cs/generate.ts, intent.ts, orchestrator.ts); retrieval embeds for it (lib/kb/rag.ts defaultEmbedder(ctx.viewer))",
    "app/api/webhooks/meta/route.ts": "auto-reply asks can() for the page asset's org (lib/social/meta-auto-reply.ts)",
    "app/api/internal/social/dispatch/route.ts": "dispatch-store asks social.dispatch for each post's org (lib/social/dispatch-store.ts)",
    "app/api/internal/schedules/run-due/route.ts": "each due job runs for its client org (lib/schedules/jobs.ts runCollection({ organizationId })); KB ingest embeds for that org",
    "app/api/internal/collect/runs/execute/route.ts": "Cognitive OS research run for a project, no client org on the request: collect.fetch bills internal (lib/collect/run.ts runResearchCollection)",
    // reach paid code only through an import; the handler runs no paid call
    "app/api/internal/cognitive-os/import-project-sources/route.ts": "reads KB sources (@/lib/kb barrel) and sends them to our own Cognitive OS",
    "app/api/ops/clients/[slug]/cognitive-os-import/route.ts": "reads KB sources (@/lib/kb barrel) and sends them to our own Cognitive OS",
    "app/api/ops/clients/[slug]/hci-import/route.ts": "reads KB sources (@/lib/kb barrel) and sends them to our own HCI service",
    "app/api/ops/clients/[slug]/cs-config/route.ts": "reads and writes cs thresholds and graduation rows (@/lib/cs barrel)",
    "app/api/ops/clients/[slug]/cs-eval-cases/route.ts": "lists and replaces eval case rows (@/lib/cs barrel); running an exam is /api/ops/cs/eval",
    "app/api/ops/clients/[slug]/cs-intents/route.ts": "CRUD on intent rows (@/lib/cs barrel)",
    "app/api/ops/clients/[slug]/cs-knowledge-folders/route.ts": "CRUD on KB folder rows (@/lib/kb barrel)",
    "app/api/ops/clients/[slug]/schedules/[job]/route.ts": "writes a client_schedules row; the job runs later in /api/internal/schedules/run-due",
    "app/api/ops/schedules/route.ts": "reads the schedules view",
    "app/api/social/reports/monthly/route.ts": "toggles a client_schedules row; reads job defaults from lib/schedules/jobs.ts, never runs a job",
    "app/api/video/[id]/route.ts": "deletes a video row and its unreferenced object (videoObjectKey only)",
    "app/api/internal/video/cleanup/route.ts": "deletes unreferenced R2 objects (videoObjectKey only)",
    "app/api/video/status/route.ts": "polls our own video-service and records the finished asset; no paid step",
    "app/api/video/remotion-render/route.ts": "submits to our own Remotion renderer (resolveOrgId only)",
    "app/api/video/remotion-job-status/route.ts": "polls our own Remotion renderer and records the asset",
    "app/api/video/footage/render/route.ts": "submitFootageRender sends existing footage to our own ffmpeg renderer and asks no feature (lib/content/video/render-client.ts)",
    "app/api/internal/video/reconcile/route.ts": "records orphaned finished videos (lib/content/video/reconcile.ts); no paid step",
  };
  const apiRoutes = () => [...FILES.keys()].filter((f) => isRoute(f) && f.startsWith("app/api/"));
  const paidAsks = (r: string) => [...new Set([...importClosure([r])].flatMap((g) => FILES.get(g)!.asked).filter((k) => !BACK_OFFICE_FEATURES.has(k)))];
  const unscoped = (r: string) => FILES.get(r)!.asked.length === 0 && paidAsks(r).length > 0;
  it("every API route that reaches a product feature asks it for its caller, or is listed with why it need not", () => {
    expect(apiRoutes().filter((r) => !(r in UNSCOPED_ROUTES) && unscoped(r)).map((r) => `${r} reaches ${paidAsks(r).join(", ")}`)).toEqual([]);
    for (const [r, why] of Object.entries(UNSCOPED_ROUTES)) {
      expect(FILES.has(r) && unscoped(r), `${r}: listed, but it is gone, asks a feature itself, or reaches none`).toBe(true);
      expect(why.trim().length, r).toBeGreaterThan(0);
    }
  });

  it("a platform API authorizes by organization or reads no organization's data", () => {
    for (const prefix of PLATFORM_APIS) {
      const routes = routesUnder(prefix);
      expect(routes.length, prefix).toBeGreaterThan(0);
      for (const r of routes) expect(authorizes(r), r).toBe(true);
    }
  });

  it("the scanner sees literal asks, URLs in templates, and keys in an imported file", () => {
    const s = scan("lib/x/a.ts", 'import { g } from "@/lib/tarot/b"; await grantFor("studio.image"); fetch(`/api/tools/studio/x?y=${1}`); const s = "/api/social/";');
    expect(s).toEqual({ asked: ["studio.image"], apis: ["/api/tools/studio/x", "/api/social"], calls: ["/api/tools/studio/x"], prefixCalls: ["/api/tools/studio/x"], templates: [{ prefix: "/api/tools/studio/x", route: "/api/tools/studio/x" }], called: [], db: false, imports: ["lib/tarot/b"], meters: false });
    expect(scan("lib/x/a.ts", 'import { g as h, k } from "@/lib/b"; import type { C } from "@supabase/supabase-js"; h(); k;').called).toEqual(["lib/b#g"]);
    expect(scan("lib/x/a.ts", 'import type { C } from "@supabase/supabase-js";').db).toBe(false);
    expect(scan("lib/x/a.ts", 'import { createClient } from "@supabase/supabase-js";').db).toBe(true);
    expect(scan("lib/x/m.ts", "void grant.recordUse({}); recordUse();").meters).toBe(true);
    expect(scan("lib/x/m.ts", "recordUse(); // grant.recordUse()").meters).toBe(false);
    const j = scan("app/x/p.tsx", 'import type { T } from "@/lib/a"; import { type U } from "@/lib/b"; import { v, type W } from "@/lib/c"; require("@/lib/d"); const f = <form action="/api/a/b" />; new EventSource(`/api/c/${1}`); fetch(("/api/e" as const)); const tbl = ["/api/d"];');
    expect(j.imports).toEqual(["lib/c", "lib/d"]);
    expect(j.called).toEqual([]);
    expect(j.calls).toEqual(["/api/a/b", "/api/c", "/api/e"]);
    expect(j.prefixCalls).toEqual(["/api/c"]);   // only the template's URL is a prefix
    expect(j.templates).toEqual([{ prefix: "/api/c", route: "/api/c/[x]" }]);
    expect(scan("lib/x/a.ts", 'grant("studio.image"); x.grantFor("studio.image"); // grantFor("cs.answer")').asked).toEqual([]);
  });
});
