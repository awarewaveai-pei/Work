import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, migrationFiles } from "../../kb/__tests__/migration-source";
import { RESERVED_SUBDOMAINS, nextAdminProducts } from "../doors";
import { STAFF_PLATFORM, covers } from "../staff-tools";
import { BACK_OFFICE, STAFF_UTILITIES, DEFAULT_SIGNUP_PRODUCT, LOGIN_SOURCES, PRODUCTS, SELF_SIGNUP_PRODUCTS, isSelfSignupProductKey } from "../products";

// The registry is the one list of products (ADR 012 §5). The signup form and /api/signup read it; the database's own
// check on organization_product_subscriptions.product_key (0062, or a later migration that redefines it) must allow
// every self-signup key, or a signup would pass the API and then fail inside complete_signup (0063).
const TABLE = "organization_product_subscriptions";

/** Keys the newest product_key check on TABLE allows. Only statements on TABLE count, comments are ignored, both the
 *  `in (...)` and the `= any (array[...])` spellings are read, and a later drop with nothing added back throws. */
function dbProductKeys(files: Array<{ file: string; text: string }>): string[] {
  let allowed: string[] | null = null;
  for (const { file, text } of files) {
    const sql = text.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const stmt of sql.split(";")) {
      if (!new RegExp(`\\b(create|alter)\\s+table\\s+(if\\s+(not\\s+)?exists\\s+)?(public\\.)?${TABLE}\\b`, "i").test(stmt)) continue;
      const checks = [...stmt.matchAll(/check\s*\(\s*\(?\s*product_key\s*(?:in\s*\(([^)]*)\)|=\s*any\s*\(\s*array\s*\[([^\]]*)\])/gi)];
      if (checks.length) {
        const m = checks[checks.length - 1];
        allowed = [...(m[1] ?? m[2]).matchAll(/'([^']+)'/g)].map((x) => x[1]);
      } else if (/drop\s+constraint[^,]*product_key/i.test(stmt)) {
        throw new Error(`${file} drops the ${TABLE}.product_key check without a new one`);
      }
    }
  }
  if (!allowed) throw new Error(`no product_key check on ${TABLE} in the migrations`);
  return allowed;
}

const under = (p: string, prefix: string) => p === prefix || p.startsWith(`${prefix}/`);
const MIGRATIONS = () => migrationFiles().map((file) => ({ file, text: readFileSync(path.join(MIGRATIONS_DIR, file), "utf8") }));

// Top-level route segments of the staff door (app/ and its route groups), so a product's page prefix cannot shadow one.
const APP_DIR = path.join(__dirname, "../../../app");
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

  // ADR 018 §5: a product that leaves a delivery field out fails here, so it cannot ship without its door.
  it("every product declares its door, login sources and whether it installs alone (ADR 018)", () => {
    for (const p of PRODUCTS) {
      expect(p.subdomain, p.key).toMatch(/^[a-z][a-z0-9-]{0,30}$/);
      expect(RESERVED_SUBDOMAINS, p.key).not.toContain(p.subdomain);
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
        expect(existsSync(path.join(APP_DIR, p.door.page.slice(1), "page.tsx")), p.key).toBe(true);
      }
      for (const a of p.door.api) expect(a, p.key).toMatch(/^\/api\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/);
    }
  });

  // ADR 018 §2 rule 3: a multi-page door lists its pages in door.nav (ProductDoorShell renders it); each is a built
  // page that mirrors one of the product's staff pages (useDoorHref maps links by it), and no staff page answers a
  // built door page's path (a reserved, unbuilt door may still share one, see the shadowing test above).
  it("every door.nav page is built and mirrors one of the product's staff pages; no staff page shares a door page's path", () => {
    const pageUrls = (dir: string, url: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (e.name.startsWith("_") ? [] : pageUrls(path.join(dir, e.name), e.name.startsWith("(") ? url : `${url}/${e.name}`))
        : e.name === "page.tsx" ? [url || "/"] : []);
    const staffUrls = new Set(pageUrls(path.join(APP_DIR, "(shell)"), ""));
    for (const p of nextAdminProducts()) {
      const nav = p.door.nav ?? [];
      expect(new Set(nav.map((n) => n.path)).size, p.key).toBe(nav.length);
      for (const n of nav) {
        expect(n.path, p.key).toMatch(/^(?:[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*)?$/);
        expect(n.name.trim(), `${p.key} nav ${n.path}`).not.toBe("");
        expect(existsSync(path.join(APP_DIR, p.door.page.slice(1), ...n.path.split("/").filter(Boolean), "page.tsx")), `${p.key} nav ${n.path}: no page`).toBe(true);
        expect(p.staffPaths.some((s) => under(n.staff, s)), `${p.key} nav ${n.path}: ${n.staff} is not its staff path`).toBe(true);
        expect(staffUrls.has(`/${n.staff}`), `${p.key} nav ${n.path}: no staff page ${n.staff}`).toBe(true);
      }
      const doorDir = path.join(APP_DIR, p.door.page.slice(1));
      for (const url of existsSync(doorDir) ? pageUrls(doorDir, p.door.page) : []) expect(staffUrls.has(url), `${p.key}: a staff page answers door page ${url}`).toBe(false);
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

  it("every directory under app/(shell)/{tools,ops} and app/(shell)/* maps to a product or a listed back-office or staff utility", () => {
    // A `_` folder is private in the App Router (never a route): app/__tests__ failed this as a page with no product
    // and blocked sg-deploy's test gate (2026-10-23).
    const dirs = (d: string) => readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("_")).map((e) => e.name);
    const shell = path.join(APP_DIR, "(shell)");
    const actual = [...dirs(shell).filter((n) => !["tools", "ops"].includes(n)),
      ...["tools", "ops"].flatMap((group) => dirs(path.join(shell, group)).map((n) => `${group}/${n}`))];
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
    for (const dir of Object.keys(STAFF_UTILITIES)) scan(path.join(APP_DIR, "(shell)", dir));
  });

  it("every self-signup product, and the default, is allowed by the database check", () => {
    const allowed = dbProductKeys(MIGRATIONS());
    for (const p of SELF_SIGNUP_PRODUCTS) expect(allowed).toContain(p.key);
    expect(isSelfSignupProductKey(DEFAULT_SIGNUP_PRODUCT)).toBe(true);
  });

  it("social is registered but not open for signup until V2", () => {
    expect(PRODUCTS.find((p) => p.key === "social")).toMatchObject({ subdomain: "social", selfSignup: false });
    expect(isSelfSignupProductKey("social")).toBe(false);
    expect(isSelfSignupProductKey("nope")).toBe(false);
    expect(isSelfSignupProductKey(undefined)).toBe(false);
  });

  it("the migration reader follows only the subscriptions table, both spellings, and refuses a bare drop", () => {
    const base = { file: "0062_x.sql", text: `create table if not exists public.${TABLE} (product_key text not null check (product_key in ('cognitive','hci')));` };
    expect(dbProductKeys([base])).toEqual(["cognitive", "hci"]);
    expect(dbProductKeys([base, { file: "0099_billing.sql", text: "create table media_credit_ledger (product_key text check (product_key in ('cognitive','hci','social')));" }]))
      .toEqual(["cognitive", "hci"]);
    expect(dbProductKeys([base, { file: "0099_c.sql", text: "-- check (product_key in ('social'))\nselect 1;" }])).toEqual(["cognitive", "hci"]);
    expect(dbProductKeys([base, { file: "0099_any.sql",
      text: `alter table public.${TABLE} drop constraint ops_pk_check, add constraint ops_pk_check check ((product_key = any (array['cognitive'::text])));` }]))
      .toEqual(["cognitive"]);
    expect(() => dbProductKeys([base, { file: "0099_drop.sql", text: `alter table ${TABLE} drop constraint organization_product_subscriptions_product_key_check;` }]))
      .toThrow(/drops/);
  });
});
