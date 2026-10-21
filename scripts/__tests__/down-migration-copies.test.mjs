// Every migration from 0100 on keeps its down file in two places that must stay byte-identical:
// lobster-factory/packages/db/migrations/NNNN_name.down.sql and .../scripts/NNNN_name_down.sql.
// 2026-10-21 the 0114 scripts copy missed the ledger cleanup added to the migrations copy.
//   node --test scripts/__tests__/down-migration-copies.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../lobster-factory/packages/db");
const FIRST = 100;

test("each migration from 0100 has identical down files in migrations/ and scripts/", () => {
  const ups = fs.readdirSync(path.join(DB, "migrations"))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith(".down.sql") && Number(f.slice(0, 4)) >= FIRST);
  assert.ok(ups.length > 0, "no migrations found -- wrong path?");
  const problems = [];
  for (const up of ups) {
    const name = up.slice(0, -".sql".length);
    const a = path.join(DB, "migrations", `${name}.down.sql`);
    const b = path.join(DB, "scripts", `${name}_down.sql`);
    const missing = [a, b].filter((p) => !fs.existsSync(p)).map((p) => path.relative(DB, p));
    if (missing.length) { problems.push(`${name}: missing ${missing.join(", ")}`); continue; }
    if (!fs.readFileSync(a).equals(fs.readFileSync(b))) problems.push(`${name}: the two down files differ`);
  }
  assert.deepEqual(problems, []);
});
