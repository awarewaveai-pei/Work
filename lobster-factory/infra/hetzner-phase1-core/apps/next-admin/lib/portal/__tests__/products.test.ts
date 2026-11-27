import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { PLATFORM_PAGES, RESERVED_SUBDOMAINS, STAFF_ROUTE_GROUPS, nextAdminProducts, productHost, servedNextAdminProducts } from "../doors";
import { STAFF_PLATFORM, covers } from "../staff-tools";
import { BACK_OFFICE, STAFF_UTILITIES, LOGIN_SOURCES, PRODUCTS, featureCatalog } from "../products";
import { CATEGORIES, COGNITIVE_GROUPS, COGNITIVE_PREFIXES, CONTEXTS, ICONS, TASKS, cognitivePrefix } from "../catalog-vocab";
import cognitiveInventory from "../cognitive-features.json";
import { APP_DIR, doorPageUrls, pageUrls } from "./app-pages";

// The registry is the one list of products (ADR 012 §5).
const under = (p: string, prefix: string) => p === prefix || p.startsWith(`${prefix}/`);

// Top-level route segments of the staff door (app/ and its route groups), so a product's page prefix cannot shadow one.
// First path segments other routes already use. A door's own top-level directory (app/<page>) is not a clash; a
// directory inside a route group such as app/(shell)/<page> always is (both would answer /<page>).
function staffSegments(ownPages: string[]): string[] {
  const dirs = (d: string) => readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("_")).map((e) => e.name);
  const top = dirs(APP_DIR);
  return [...top.filter((n) => !n.startsWith("(") && !ownPages.includes(`/${n}`)),
    ...top.filter((n) => n.startsWith("(")).flatMap((g) => dirs(path.join(APP_DIR, g)))];
}

describe("product registry", () => {
  it("has unique keys and subdomains", () => {
    expect(new Set(PRODUCTS.map((p) => p.key)).size).toBe(PRODUCTS.length);
    expect(new Set(PRODUCTS.map((p) => p.subdomain)).size).toBe(PRODUCTS.length);
  });

  // Blueprint §4.3: the catalog entry is how people find a product; the vocabulary file is the only source of its keys.
  it("every product has a catalog entry whose values come from catalog-vocab", () => {
    const featured: number[] = [];
    for (const p of PRODUCTS) {
      const c = p.catalog;
      expect(c, p.key).toBeTruthy();
      expect(CATEGORIES, p.key).toContain(c.category);
      expect(c.tasks.length, p.key).toBeGreaterThan(0);
      for (const t of c.tasks) expect(Object.keys(TASKS), `${p.key}: ${t}`).toContain(t);
      expect(new Set(c.tasks).size, p.key).toBe(c.tasks.length);
      expect(c.blurb.trim(), p.key).not.toBe("");
      expect([...c.blurb].length, p.key).toBeLessThanOrEqual(28);
      expect(ICONS, p.key).toContain(c.icon);
      expect(c.addedAt, p.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(c.addedAt)), p.key).toBe(false);
      for (const x of c.contexts ?? []) expect(CONTEXTS, p.key).toContain(x);
      if (c.featured !== undefined) featured.push(c.featured);
    }
    expect(new Set(featured).size).toBe(featured.length);
  });

  // U25: the feature layer is what search and category pages list once a product has many features.
  it("every feature's effective catalog values come from catalog-vocab", () => {
    for (const p of PRODUCTS) for (const f of p.features) {
      const c = featureCatalog(p, f);
      expect(c.tasks.length, f.feature_key).toBeGreaterThan(0);
      for (const t of c.tasks) expect(Object.keys(TASKS), `${f.feature_key}: ${t}`).toContain(t);
      expect(new Set(c.tasks).size, f.feature_key).toBe(c.tasks.length);
      expect([...c.blurb].length, f.feature_key).toBeLessThanOrEqual(28);
      expect(ICONS, f.feature_key).toContain(c.icon);
      expect(c.addedAt, f.feature_key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("featureCatalog inherits each missing field from the product and never lets a feature override category", () => {
    const product = { catalog: { category: "content", tasks: ["write-seo-article"], blurb: "產品一句話", icon: "article", addedAt: "2026-01-01", keywords: ["k"], contexts: ["studio"] } } as const;
    expect(featureCatalog(product, {})).toEqual({ category: "content", tasks: ["write-seo-article"], blurb: "產品一句話", icon: "article", addedAt: "2026-01-01", keywords: ["k"], contexts: ["studio"] });
    const own = { catalog: { tasks: ["fix-seo"], blurb: "功能一句話", icon: "search", addedAt: "2026-11-27", keywords: ["x"], category: "video", contexts: ["general"] } } as unknown as Parameters<typeof featureCatalog>[1];
    expect(featureCatalog(product, own)).toEqual({ category: "content", tasks: ["fix-seo"], blurb: "功能一句話", icon: "search", addedAt: "2026-11-27", keywords: ["x"], contexts: ["studio"] });
  });

  it("every cognitive method's prefix maps to a group whose tasks are in the vocabulary", () => {
    for (const tasks of Object.values(COGNITIVE_GROUPS)) for (const t of tasks) expect(Object.keys(TASKS), t).toContain(t);
    const prefixes = new Set(cognitiveInventory.map((f) => cognitivePrefix(f.id)));
    for (const prefix of prefixes) expect(Object.keys(COGNITIVE_PREFIXES), `cognitive prefix ${prefix} has no group`).toContain(prefix);
    const cognitive = PRODUCTS.find((p) => p.key === "cognitive")!;
    for (const f of cognitive.features) expect(f.catalog?.tasks, f.feature_key).toEqual(COGNITIVE_GROUPS[COGNITIVE_PREFIXES[cognitivePrefix(f.feature_key)]]);
  });

  // ADR 018 §5: a product that leaves a delivery field out fails here, so it cannot ship without its door.
  it("every product declares its door, login sources and whether it installs alone (ADR 018)", () => {
    for (const p of PRODUCTS) {
      expect(p.subdomain, p.key).toMatch(/^[a-z][a-z0-9-]{0,30}$/);
      expect(RESERVED_SUBDOMAINS, p.key).not.toContain(p.subdomain);
      // "portal" is also the wp-handoff key for the member's workspace (lib/auth/sources/awarewave-wp.ts WORKSPACE_KEY)
      expect(RESERVED_SUBDOMAINS, p.key).not.toContain(p.key);
      expect(typeof p.standalone, p.key).toBe("boolean");
      expect(p.loginSources.length, p.key).toBeGreaterThan(0);
      expect(p.loginSources, p.key).toContain("local");
      for (const s of p.loginSources) expect(LOGIN_SOURCES, p.key).toContain(s);
      expect(["next-admin", "external"], p.key).toContain(p.door.app);
    }
  });

  it("a next-admin door owns its own page and API prefixes and shadows no staff route", () => {
    const doors = nextAdminProducts();
    const pages = doors.map((p) => p.door.page);
    const apis = doors.flatMap((p) => p.door.api);
    expect(new Set(pages).size).toBe(pages.length);
    expect(new Set(apis).size).toBe(apis.length);
    const staff = staffSegments(pages);
    for (const p of doors) {
      expect(p.door.page, p.key).toMatch(/^\/[a-z][a-z0-9-]*$/);
      // a reserved door may share its path with today's staff route (middleware-door.test.ts); an open one may not
      if (p.door.enabled !== false) expect(staff, p.key).not.toContain(p.door.page.slice(1));
      if (p.status === "available") {
        expect(p.door.enabled, p.key).not.toBe(false);
        expect(doorPageUrls(p.door.page), p.key).toContain(p.door.page);
      }
      for (const a of p.door.api) expect(a, p.key).toMatch(/^\/api\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/);
    }
  });

  // P6 D1: a door whose UI is a separate container (door.uiService) needs its own nginx server block, routing everything
  // but next-admin's paths to that container; every other open door stays in the one shared next-admin door block.
  // Flip both together: setting uiService without the nginx block (or the reverse) fails here.
  it("a door with a uiService has its own nginx server block; every other open door is in the shared door block", () => {
    const conf = readFileSync(path.join(__dirname, "../../../../../nginx/default.conf"), "utf8");
    const blocks = [...conf.matchAll(/^\s*server_name\s+([^;]+);/gm)].map((m) => m[1].trim().split(/\s+/));
    const doors = servedNextAdminProducts().map((p) => ({ p, host: productHost(p, {}) }));
    const shared = doors.filter((d) => !d.p.door.uiService).map((d) => blocks.findIndex((b) => b.includes(d.host)));
    expect(shared.length).toBeGreaterThan(1);
    expect(new Set(shared).size, "shared door block").toBe(1);
    expect(shared[0]).toBeGreaterThanOrEqual(0);
    for (const d of doors.filter((x) => x.p.door.uiService)) {
      const own = blocks.map((b, i) => (b.includes(d.host) ? i : -1)).filter((i) => i >= 0);
      expect(own, d.p.key).toHaveLength(1);
      expect(own[0], `${d.p.key}: still in the shared door block`).not.toBe(shared[0]);
    }
    // Reverse direction: a next-admin product host in any block but the shared one must declare uiService, so moving
    // a host out in nginx alone fails too (the loop above runs zero times when no product sets uiService).
    for (const p of nextAdminProducts()) {
      const host = productHost(p, {});
      if (!blocks.some((b, i) => i !== shared[0] && b.includes(host))) continue;
      expect(p.door.app === "next-admin" ? p.door.uiService : undefined, `${p.key}: own nginx block without uiService`).toBeTruthy();
    }
  });

  // ADR 018 §2 rule 3: a multi-page door lists its pages in door.nav (ProductDoorShell renders it); each is a built
  // page that mirrors one of the product's staff pages or a platform page (useDoorHref maps links by it; an item without
  // `staff` is a door-only page and mirrors none), and no staff page answers a
  // built door page's path (a reserved, unbuilt door may still share one, see the shadowing test above).
  it("every door.nav page is built and mirrors one of the product's staff pages or a platform page; no staff page shares a door page's path", () => {
    const staffUrls = new Set(STAFF_ROUTE_GROUPS.flatMap((g) => pageUrls(path.join(APP_DIR, g), "")));
    for (const p of nextAdminProducts()) {
      const nav = p.door.nav ?? [];
      const doorUrls = doorPageUrls(p.door.page);
      expect(new Set(nav.map((n) => n.path)).size, p.key).toBe(nav.length);
      for (const n of nav) {
        expect(n.path, p.key).toMatch(/^(?:[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*)?$/);
        expect(n.name.trim(), `${p.key} nav ${n.path}`).not.toBe("");
        expect(doorUrls, `${p.key} nav ${n.path}: no page`).toContain(n.path ? `${p.door.page}/${n.path}` : p.door.page);
        const staff = n.staff;
        if (staff === undefined) continue;
        expect(p.staffPaths.some((s) => under(staff, s)) || PLATFORM_PAGES.includes(staff), `${p.key} nav ${n.path}: ${n.staff} is neither its staff path nor a platform page`).toBe(true);
        expect(staffUrls.has(`/${staff}`), `${p.key} nav ${n.path}: no staff page ${staff}`).toBe(true);
      }
      for (const url of doorUrls) expect(staffUrls.has(url), `${p.key}: a staff page answers door page ${url}`).toBe(false);
    }
  });

  it("a no-login path is a plain prefix no other door owns, lives in app/(public), and serves only pages and GET/HEAD routes", () => {
    const doors = nextAdminProducts();
    const owned = doors.flatMap((p) => [p.door.page, ...p.door.api]);
    const anon = doors.flatMap((p) => p.door.anonymous ?? []);
    expect(new Set(anon).size).toBe(anon.length);
    const files: Array<{ url: string; file: string }> = [];
    const walk = (dir: string, url: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f, e.name.startsWith("(") ? url : `${url}/${e.name}`);
        else files.push({ url: url || "/", file: f });
      }
    };
    walk(APP_DIR, "");
    for (const a of anon) {
      expect(a).toMatch(/^\/[a-z][a-z0-9-]*$/);
      for (const o of owned) expect(o === a || o.startsWith(`${a}/`) || a.startsWith(`${o}/`), `${a} vs ${o}`).toBe(false);
      const served = files.filter((x) => x.url === a || x.url.startsWith(`${a}/`));
      expect(served.some((x) => path.basename(x.file) === "page.tsx"), a).toBe(true);
      for (const { file } of served) {
        expect(path.relative(APP_DIR, file).split(path.sep)[0], file).toBe("(public)");   // not beside a staff page
        const text = readFileSync(file, "utf8");
        expect(text, file).not.toMatch(/["']use server["']/);
        if (/^route\.(t|j)sx?$/.test(path.basename(file))) {
          expect(text, file).not.toMatch(/export\s+(?:async\s+)?(?:const|function)\s+(?:POST|PUT|PATCH|DELETE|OPTIONS)\b/);
          expect(text, file).toMatch(/export\s+(?:async\s+)?(?:const|function)\s+GET\b/);
        }
      }
    }
  });

  it("every directory under app/<staff group>/{tools,ops} and app/<staff group>/* maps to a product or a listed back-office or staff utility", () => {
    // A `_` folder is private in the App Router (never a route): app/__tests__ failed this as a page with no product
    // and blocked sg-deploy's test gate (2026-10-23).
    const dirs = (d: string) => readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("_")).map((e) => e.name);
    const actual = [...new Set(STAFF_ROUTE_GROUPS.flatMap((g) => {
      const shell = path.join(APP_DIR, g);
      const sub = (group: string) => (existsSync(path.join(shell, group)) ? dirs(path.join(shell, group)) : []);
      return [...dirs(shell).filter((n) => !["tools", "ops"].includes(n)), ...["tools", "ops"].flatMap((group) => sub(group).map((n) => `${group}/${n}`))];
    }))];
    for (const dir of actual) {
      if (STAFF_PLATFORM.pages.some((p) => covers(p, `/${dir}`))) continue;   // every staff member's page: no cell owns it
      const owners = PRODUCTS.filter((p) => p.staffPaths.includes(dir));
      const count = owners.length + Number(dir in BACK_OFFICE) + Number(dir in STAFF_UTILITIES);
      expect(count, `${dir}: exactly one owner`).toBe(1);
    }
    for (const [dir, page] of Object.entries({ ...BACK_OFFICE, ...STAFF_UTILITIES })) {
      expect(page.why.trim().length, dir).toBeGreaterThan(0);
      expect(page.name.trim().length, dir).toBeGreaterThan(0);
      expect(actual, dir).toContain(dir);
    }
    for (const p of PRODUCTS) for (const dir of p.staffPaths) expect(actual, p.key).toContain(dir);
    // Exempt infrastructure is explicit; every other top-level page must have a registry row.
    for (const dir of dirs(APP_DIR).filter((n) => !n.startsWith("(") && !["api", "login", "portal"].includes(n))) {
      expect(PRODUCTS.some((p) => p.door.app === "next-admin" && p.door.page === `/${dir}`), dir).toBe(true);
    }
  });

  it("every feature declares a limit kind and no buyout module carries SAFETY_GATE", () => {
    const keys = new Set<string>();
    const declarations = ["state_ownership", "behavior_ownership", "public_api_event_contract", "invariants", "dependencies", "failure_isolation_boundary", "data_lifecycle", "observability_contract", "migration_rollback_contract", "replacement_strategy"];
    for (const p of PRODUCTS) {
      expect(p.accessChannels.length, p.key).toBeGreaterThan(0);
      for (const c of p.accessChannels) expect(["ui", "api"]).toContain(c);
      expect(p.description.trim(), p.key).not.toBe("");
      expect(Array.isArray(p.modules.dependsOn), p.key).toBe(true);
      expect(p.modules.manifest, p.key).toBe(`lib/${p.key}/MODULE_MANIFEST.json`);
      for (const f of p.features) {
        expect(f.feature_key.trim(), p.key).not.toBe("");
        expect(keys.has(f.feature_key), f.feature_key).toBe(false); keys.add(f.feature_key);
        expect(f.name.trim(), f.feature_key).not.toBe("");
        expect(["QUOTA", "RATE_LIMIT", "SAFETY_GATE"], f.feature_key).toContain(f.limitKind);
        expect(["contract", "credits"], f.feature_key).toContain(f.billing);
        expect(typeof f.buyout, f.feature_key).toBe("boolean");
        if (f.buyout || p.standalone) expect(f.limitKind, f.feature_key).not.toBe("SAFETY_GATE");
      }
      if (p.status === "available") {
        expect(p.features.length, p.key).toBeGreaterThan(0);
        const manifest = JSON.parse(readFileSync(path.join(APP_DIR, "..", p.modules.manifest), "utf8"));
        for (const name of declarations) {
          const value = JSON.stringify(manifest.declarations?.[name] ?? "");
          expect(value, `${p.key}.${name}`).not.toMatch(/TODO/);
          expect(value, `${p.key}.${name}`).not.toBe('""');
        }
      }
    }
    const source = ts.createSourceFile("products.ts", readFileSync(path.join(__dirname, "../products.ts"), "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isPropertySignature(node) || ts.isPropertyAssignment(node)) {
        expect(["audience", "ways", "supportedWays", "channels"]).not.toContain(node.name.getText(source).replace(/["']/g, ""));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  });

  it("staff utilities import no paid SDK", () => {
    const paid = /^(?:@anthropic-ai\/sdk|openai|replicate|@fal-ai\/client|@google\/generative-ai|@google\/genai)(?:\/|$)/;
    const scan = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, e.name);
        if (e.isDirectory()) scan(file);
        else if (/\.[cm]?[jt]sx?$/.test(e.name)) {
          const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
          const visit = (node: ts.Node) => {
            // Static, dynamic and require imports are all string literals in the source AST.
            if (ts.isStringLiteral(node)) expect(paid.test(node.text), `${file}: ${node.text}`).toBe(false);
            ts.forEachChild(node, visit);
          };
          visit(source);
        }
      }
    };
    for (const dir of Object.keys(STAFF_UTILITIES)) for (const g of STAFF_ROUTE_GROUPS) if (existsSync(path.join(APP_DIR, g, dir))) scan(path.join(APP_DIR, g, dir));
  });
});
