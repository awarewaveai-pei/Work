// One migration file per number. scripts/apply-db-migration.mjs refuses a number with two files and
// check-migrations-applied.sh matches by file name, so a second "0182_*.sql" can never be applied and holds every nightly
// deploy (two sessions each took 0182 on 2026-11-25). 0011 predates the rule; both are applied.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// __tests__ -> db -> lib -> next-admin -> apps -> hetzner-phase1-core -> infra -> lobster-factory.
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../../../../packages/db/migrations");
const KNOWN_DUPLICATES = new Set(["0011"]);

describe("migration numbers", () => {
  it("no two up-migrations share a number", () => {
    const byNumber = new Map<string, string[]>();
    for (const f of fs.readdirSync(MIGRATIONS_DIR)) {
      const m = /^(\d{4})_.*(?<!\.down)\.sql$/.exec(f);
      if (m) byNumber.set(m[1], [...(byNumber.get(m[1]) ?? []), f]);
    }
    expect(byNumber.size).toBeGreaterThan(100);
    const dupes = [...byNumber].filter(([n, fs_]) => fs_.length > 1 && !KNOWN_DUPLICATES.has(n)).map(([, fs_]) => fs_.join(" + "));
    expect(dupes).toEqual([]);
  });
});
