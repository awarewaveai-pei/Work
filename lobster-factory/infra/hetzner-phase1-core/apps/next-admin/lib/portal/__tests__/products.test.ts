import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, migrationFiles } from "../../kb/__tests__/migration-source";
import { RESERVED_SUBDOMAINS, nextAdminProducts } from "../doors";
import { DEFAULT_SIGNUP_PRODUCT, LOGIN_SOURCES, PRODUCTS, SELF_SIGNUP_PRODUCTS, isSelfSignupProductKey } from "../products";

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

const MIGRATIONS = () => migrationFiles().map((file) => ({ file, text: readFileSync(path.join(MIGRATIONS_DIR, file), "utf8") }));

// Top-level route segments of the staff door (app/ and its route groups), so a product's page prefix cannot shadow one.
const APP_DIR = path.join(__dirname, "../../../app");
function staffSegments(ownPages: string[]): string[] {
  const dirs = (d: string) => readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const top = dirs(APP_DIR);
  const segs = [...top.filter((n) => !n.startsWith("(")), ...top.filter((n) => n.startsWith("(")).flatMap((g) => dirs(path.join(APP_DIR, g)))];
  return segs.filter((n) => !ownPages.includes(`/${n}`));
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
      expect(staff, p.key).not.toContain(p.door.page.slice(1));
      expect(readdirSync(path.join(APP_DIR, p.door.page.slice(1))), `${p.key}: app${p.door.page}/ is its door's page`).toContain("page.tsx");
      for (const a of p.door.api) expect(a, p.key).toMatch(/^\/api\/[a-z][a-z0-9-]*$/);
    }
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
