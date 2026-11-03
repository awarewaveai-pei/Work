// media_assets.asset_domain's CHECK is rebuilt from scratch by whichever migration last touches it, so a rebuild that
// forgets a value the code still writes breaks that write on prod with no error until someone saves: 0067 dropped
// 0045's two Mockup Studio preset domains and every preset save failed from 2026-09 to 2026-11-01 (0151 restored them).
// Invariant: every value the code names as an asset domain is in the LATEST CHECK.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// __tests__ -> db -> lib -> next-admin -> apps -> hetzner-phase1-core -> infra -> lobster-factory.
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../../../../packages/db/migrations");
const APP_ROOT = path.resolve(__dirname, "../../..");

/** The value list of each `asset_domain in (...)` CHECK, in migration order. */
function checksInOrder(): Array<{ file: string; values: string[] }> {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort()
    .flatMap((file) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").replace(/--[^\n]*/g, "");
      return [...sql.matchAll(/check\s*\(\s*asset_domain\s+in\s*\(([^)]*)\)/gi)]
        .map((m) => ({ file, values: [...m[1].matchAll(/'([a-z_]+)'/g)].map((v) => v[1]) }));
    });
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") || e.name === "__tests__" ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** Domains the code names: any string literal equal to a value some migration ever allowed (a domain held in a
 *  constant, like presets/route.ts PRESET_DOMAINS), plus any literal written straight into `asset_domain:` (a new one
 *  no migration has allowed yet). */
function domainsTheCodeNames(known: Set<string>): Map<string, string> {
  const named = new Map<string, string>();
  for (const f of [...sourceFiles(path.join(APP_ROOT, "app")), ...sourceFiles(path.join(APP_ROOT, "lib"))]) {
    const text = fs.readFileSync(f, "utf8");
    const rel = path.relative(APP_ROOT, f);
    for (const m of text.matchAll(/["']([a-z_]+)["']/g)) {
      if (known.has(m[1]) && !named.has(m[1])) named.set(m[1], rel);
    }
    for (const m of text.matchAll(/\basset_domain\s*:\s*["']([a-z_]+)["']/g)) {
      if (!named.has(m[1])) named.set(m[1], rel);
    }
  }
  return named;
}

describe("media_assets.asset_domain CHECK covers every domain the code writes", () => {
  const checks = checksInOrder();

  it("sanity: the CHECK history resolves (0011 first, 0151 restoring the presets)", () => {
    expect(checks[0]?.file).toMatch(/^0011_/);
    expect(checks.some((c) => c.file.startsWith("0151_") && c.values.includes("mockup_model_preset"))).toBe(true);
  });

  it("every value the code names is in the latest CHECK", () => {
    const latest = new Set(checks[checks.length - 1].values);
    const known = new Set(checks.flatMap((c) => c.values));
    const missing = [...domainsTheCodeNames(known)].filter(([v]) => !latest.has(v)).map(([v, f]) => `${v} (named in ${f})`);
    expect(missing, `latest CHECK is ${checks[checks.length - 1].file}; add these back:`).toEqual([]);
  });

  it("mutation control: the 0067 rebuild alone (without 0151) is caught", () => {
    // History as it stood before 0151 (later rebuilds, e.g. 0159, carry the presets forward).
    const before = checks.filter((c) => c.file < "0151_");
    const latest = new Set(before[before.length - 1].values);
    const named = domainsTheCodeNames(new Set(checks.flatMap((c) => c.values)));
    expect([...named.keys()].filter((v) => !latest.has(v))).toEqual(expect.arrayContaining(["mockup_model_preset", "mockup_product_preset"]));
  });
});
