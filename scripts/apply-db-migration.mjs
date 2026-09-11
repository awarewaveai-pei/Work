/**
 * Apply numbered migrations from lobster-factory/packages/db/migrations to the self-hosted Supabase,
 * over the ONLY path that works: ssh -> `docker exec -i supabase-db psql -U supabase_admin`.
 *
 *   node scripts/apply-db-migration.mjs --check 0072 0073      # resolve + print, touch nothing
 *   node scripts/apply-db-migration.mjs 0072 0073 0074 0075    # apply, in the order given
 *
 * Why not the tunnel + DSN that the older one-off appliers use: every public table here is owned by
 * `supabase_admin`, and the pooler DSN connects as `postgres`, which is not a member of it. DDL dies
 * with "must be owner of table ..." after opening a connection, i.e. late enough to look like a
 * migration bug. Established path is SUPABASE_SELF_HOSTED_RUNBOOK.md / Customer_service_BUILD_PLAN.md
 * (0051 was applied exactly this way).
 *
 * Atomicity comes from the migration file's own BEGIN/COMMIT plus `-v ON_ERROR_STOP=1` -- do NOT add
 * an outer transaction here, psql warns "there is already a transaction in progress" and the nesting
 * buys nothing.
 *
 * Refuses a file containing CONCURRENTLY: Postgres rejects it inside the file's own transaction, so
 * it would fail mid-migration. Split such a migration by hand.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(root, "lobster-factory/packages/db/migrations");

const SSH_HOST = process.env.AWAREWAVE_SSH_HOST || "145.239.195.47";
const SSH_USER = process.env.AWAREWAVE_SSH_USER || "ubuntu"; // root login is refused on this host
const SSH_PORT = process.env.AWAREWAVE_SSH_PORT || "58122";
const PSQL = "sudo -n docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1";

const argv = process.argv.slice(2);
const check = argv.includes("--check");
const nums = argv.filter((a) => !a.startsWith("--"));

if (nums.length === 0) {
  console.error("usage: node scripts/apply-db-migration.mjs [--check] <number>...   e.g. 0072 0073");
  process.exit(2);
}

/** Resolve "0072" to exactly one file. Ambiguity is a mistake, not something to pick a winner for. */
function resolveOne(num) {
  if (!/^\d{4}$/.test(num)) throw new Error(`not a 4-digit migration number: ${num}`);
  // .endsWith(".sql") alone also matches that number's own *.down.sql sibling (0069, 0077, 0079 all
  // have one) -- excluded explicitly, not by requiring callers to name down-files differently.
  const hits = fs.readdirSync(MIGRATIONS).filter((f) => f.startsWith(`${num}_`) && f.endsWith(".sql") && !f.endsWith(".down.sql"));
  if (hits.length !== 1) throw new Error(`${num}: expected exactly 1 migration file, found ${hits.length}: ${hits.join(", ")}`);
  return path.join(MIGRATIONS, hits[0]);
}

let files;
try {
  files = nums.map((n) => ({ num: n, file: resolveOne(n) }));
} catch (e) {
  console.error("resolve FAILED:", e.message);
  process.exit(2);
}

for (const { num, file } of files) {
  const body = fs.readFileSync(file, "utf8");
  // Strip line comments before looking, or a comment that merely mentions CONCURRENTLY blocks a
  // migration that does not use it (0072 has exactly such a comment).
  if (/\bCONCURRENTLY\b/i.test(body.replace(/--[^\n]*/g, ""))) {
    console.error(`${num}: contains CONCURRENTLY, which cannot run inside the file's transaction. Split it by hand.`);
    process.exit(2);
  }
  if (!/^\s*BEGIN\s*;/im.test(body) || !/^\s*COMMIT\s*;/im.test(body)) {
    console.error(`${num}: no BEGIN;/COMMIT; of its own. This runner adds none, so it would apply statement by statement.`);
    process.exit(2);
  }
  console.log(`resolved ${num} -> ${path.relative(root, file).replace(/\\/g, "/")} (${body.length} bytes)`);
}

if (check) {
  console.log("--check: nothing applied.");
  process.exit(0);
}

let applied = 0;
for (const { num, file } of files) {
  process.stdout.write(`applying ${num} ... `);
  const t0 = Date.now();
  const r = spawnSync(
    "ssh",
    ["-p", SSH_PORT, "-o", "BatchMode=yes", `${SSH_USER}@${SSH_HOST}`, PSQL],
    { input: fs.readFileSync(file), encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (r.status !== 0) {
    console.log("FAILED");
    console.error(out.split("\n").slice(-25).join("\n"));
    console.error(`\nFAILED after ${applied}/${files.length} at ${num}. ON_ERROR_STOP rolled that file back whole; earlier files are committed.`);
    process.exit(1);
  }
  if (!/^COMMIT$/m.test(out)) {
    // psql exits 0 on an empty or comment-only input too. No COMMIT line means nothing was committed.
    console.log("NO COMMIT");
    console.error(out.split("\n").slice(-25).join("\n"));
    process.exit(1);
  }
  console.log(`OK (${Date.now() - t0} ms)`);
  applied += 1;
}

console.log(`APPLY_OK ${applied}/${files.length}: ${nums.join(" ")}`);
