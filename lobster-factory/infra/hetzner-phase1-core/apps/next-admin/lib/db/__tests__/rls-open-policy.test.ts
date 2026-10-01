// A policy whose USING / WITH CHECK is literally `true` must name its roles: never public/anon, and
// authenticated only FOR SELECT (global reference data: 0016 catalogs, 0053 events). public's default
// ACL grants every role every table privilege, so a role-less `using (true)` = anon-key REST
// read/write. 0022 shipped two of these (fixed 2026-10-01).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// __tests__ -> db -> lib -> next-admin -> apps -> hetzner-phase1-core -> infra -> lobster-factory.
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../../../../packages/db/migrations");
const NEVER_ROLES = new Set(["public", "anon"]);

function openPolicies(file: string, sql: string): string[] {
  const text = sql.replace(/--[^\n]*/g, "");
  const found: string[] = [];
  for (const m of text.matchAll(/create\s+policy\s+("[^"]+"|\S+)\s+on\s+(\S+)([\s\S]*?);/gi)) {
    const body = m[3];
    if (!/\b(?:using|with\s+check)\s*\(\s*true\s*\)/i.test(body)) continue;
    const to = /\bto\s+([\w\s,"]+?)(?=\s+(?:using|with)\b|$)/i.exec(body);
    const roles = to ? to[1].split(",").map((r) => r.trim().replace(/"/g, "").toLowerCase()) : [];
    const selectOnly = /\bfor\s+select\b/i.test(body);
    if (roles.length === 0 || roles.some((r) => NEVER_ROLES.has(r)) || (roles.includes("authenticated") && !selectOnly)) {
      found.push(`${file}: policy ${m[1]} on ${m[2]} -- roles=${roles.length ? roles.join(",") : "(none = PUBLIC)"}`);
    }
  }
  return found;
}

function realMigrations(): Array<{ file: string; text: string }> {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort()
    .map((file) => ({ file, text: fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8") }));
}

describe("no migration opens a table to anon/authenticated with a literal-true policy", () => {
  it("sanity: the migrations directory resolves", () => {
    expect(realMigrations().length).toBeGreaterThan(50);
  });

  it("every literal-true policy is restricted to non-public roles", () => {
    const violations = realMigrations().flatMap(({ file, text }) => openPolicies(file, text));
    expect(violations, `Add \`to service_role\` (0093 convention):\n${violations.join("\n")}`).toEqual([]);
  });

  it("mutation control: 0093 with its TO clause removed is flagged; the original is not", () => {
    const file = "0093_pod_order_inbox.sql";
    const real = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    expect(real, "fixture assumption broken").toContain(" TO service_role USING (true)");
    expect(openPolicies(file, real)).toEqual([]);
    expect(openPolicies(file, real.replace(" TO service_role USING (true)", " USING (true)"))).toHaveLength(1);
    expect(openPolicies(file, real.replace(" TO service_role ", " TO anon "))).toHaveLength(1);
    expect(openPolicies(file, real.replace(" TO service_role ", " TO authenticated "))).toHaveLength(1);
  });

  it("mutation control: 0053's authenticated read is allowed only while it stays FOR SELECT", () => {
    const file = "0053_global_events.sql";
    const real = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    expect(real, "fixture assumption broken").toContain("on public.events for select");
    expect(openPolicies(file, real)).toEqual([]);
    expect(openPolicies(file, real.replace("on public.events for select", "on public.events for all"))).toHaveLength(1);
  });
});
