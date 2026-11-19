// Paired down files must stay byte-identical:
// lobster-factory/packages/db/migrations/NNNN_name.down.sql and .../scripts/NNNN_name_down.sql.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../lobster-factory/packages/db");
const FIRST = 100;
const DOWN_IN_MIGRATIONS = /^(\d{4}_.*)\.down\.sql$/;
const DOWN_IN_SCRIPTS = /^(\d{4}_.*)_down\.sql$/;

test("paired down files are identical and post-0100 migrations have both copies", () => {
  const ups = fs.readdirSync(path.join(DB, "migrations"))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith(".down.sql") && Number(f.slice(0, 4)) >= FIRST);
  assert.ok(ups.length > 0, "no migrations found -- wrong path?");
  const problems = [];

  const migrationDown = new Map(
    fs.readdirSync(path.join(DB, "migrations"))
      .map((f) => [DOWN_IN_MIGRATIONS.exec(f)?.[1], f])
      .filter(([name]) => name),
  );
  const scriptDown = new Map(
    fs.readdirSync(path.join(DB, "scripts"))
      .map((f) => [DOWN_IN_SCRIPTS.exec(f)?.[1], f])
      .filter(([name]) => name),
  );

  for (const up of ups) {
    const name = up.slice(0, -".sql".length);
    const a = path.join(DB, "migrations", `${name}.down.sql`);
    const b = path.join(DB, "scripts", `${name}_down.sql`);
    const missing = [a, b].filter((p) => !fs.existsSync(p)).map((p) => path.relative(DB, p));
    if (missing.length) { problems.push(`${name}: missing ${missing.join(", ")}`); continue; }
  }

  for (const name of [...migrationDown.keys()].filter((n) => scriptDown.has(n)).sort()) {
    const a = path.join(DB, "migrations", migrationDown.get(name));
    const b = path.join(DB, "scripts", scriptDown.get(name));
    if (!fs.readFileSync(a).equals(fs.readFileSync(b))) {
      problems.push(`${name}: migrations/ and scripts/ down files differ`);
    }
  }
  assert.deepEqual(problems, []);
});

// A down that leaves its public.schema_migrations row makes apply-db-migration.mjs refuse the re-apply
// (and the deploy migration gate misjudge the state). Exempt: 0092 (its down drops the ledger itself) and a down that
// executes nothing (comments only, e.g. 0064's deliberately manual rollback): it must NOT delete the row, since the schema
// change is still in place.
test("every down file deletes its own up file's ledger row", () => {
  const LEDGER = "0092_schema_migrations_ledger.sql";
  const problems = [];
  let checked = 0;
  for (const [dir, re, suffix] of [["migrations", DOWN_IN_MIGRATIONS, ".down.sql"], ["scripts", DOWN_IN_SCRIPTS, "_down.sql"]]) {
    for (const f of fs.readdirSync(path.join(DB, dir)).filter((n) => re.test(n))) {
      const up = `${f.slice(0, -suffix.length)}.sql`;
      if (up === LEDGER) continue;
      if (!fs.existsSync(path.join(DB, "migrations", up))) { problems.push(`${dir}/${f}: no up file ${up}`); continue; }
      checked++;
      const sql = fs.readFileSync(path.join(DB, dir, f), "utf8");
      const executable = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
      const del = new RegExp(`delete\\s+from\\s+public\\.schema_migrations\\s+where\\s+filename\\s*=\\s*'${up.replace(/\./g, "\\.")}'`, "i");
      if (!executable) { if (del.test(sql)) problems.push(`${dir}/${f}: comment-only down must not delete the ledger row`); continue; }
      if (!del.test(sql)) problems.push(`${dir}/${f}: no delete of ledger row ${up}`);
    }
  }
  assert.ok(checked > 100, `only ${checked} down files checked -- wrong path?`);
  assert.deepEqual(problems, []);
});
