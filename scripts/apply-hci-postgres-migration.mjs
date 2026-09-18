/**
 * Apply numbered migrations from Projects/internal/hci30/database/migrations to hci-postgres
 * (ADR-0021's dedicated instance, NOT the shared self-hosted Supabase -- see
 * scripts/apply-db-migration.mjs's own header for that sibling target, and ADR-0002 for why the
 * two must never be conflated), over: ssh -> `docker exec -i hci-postgres psql -U hci_owner`.
 *
 *   node scripts/apply-hci-postgres-migration.mjs --check 0001 0002      # resolve + print, touch nothing
 *   node scripts/apply-hci-postgres-migration.mjs 0001 0002 ... 0020     # apply, in the order given
 *
 * Deliberately its own script, not a --target flag on apply-db-migration.mjs: that script's
 * MIGRATIONS root, container name, db user, and filename convention (no `_up` suffix, down-files
 * live in a SEPARATE scripts/ directory) are all different from HCI-30's own convention (`_up.sql`/
 * `_down.sql` siblings in the SAME migrations/ directory) -- a shared script would need enough
 * per-target branching to become harder to read than two small scripts, for a command that already
 * only ever targets one of two hardcoded databases.
 *
 * Unlike apply-db-migration.mjs's Supabase target, HCI-30's own migrations do NOT wrap themselves
 * in BEGIN;/COMMIT; -- confirmed against the actual, already-proven-correct reference invocation
 * (Projects/internal/hci30/scripts/dev-db-init.ps1's Invoke-SqlFile, which every local rebuild this
 * session ran pipes each file straight into `psql -v ON_ERROR_STOP=1` with no enclosing
 * transaction). `-v ON_ERROR_STOP=1` alone is this convention's atomicity: stop at the first
 * failing statement, not roll back the whole file. This script does NOT require or add a
 * BEGIN;/COMMIT; wrapper, matching that real convention -- an earlier draft assumed the two
 * migration systems shared the Supabase-style wrapper requirement without checking, and a real
 * --check run against migration 0001 immediately proved that assumption wrong (0001 has no
 * BEGIN;/COMMIT; and is a real, already-applied, correct migration).
 *
 * Refuses a file containing CONCURRENTLY (same reason as apply-db-migration.mjs: it cannot run
 * inside a transaction block at all, so a future migration using it needs applying by hand, split
 * from the rest of its own batch) -- comment-stripped before checking, since 0002's own migration
 * already mentions the word in an explanatory comment about why it deliberately does NOT use it.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(root, "Projects/internal/hci30/database/migrations");

const SSH_HOST = process.env.AWAREWAVE_SSH_HOST || "145.239.195.47";
const SSH_USER = process.env.AWAREWAVE_SSH_USER || "ubuntu"; // root login is refused on this host
const SSH_PORT = process.env.AWAREWAVE_SSH_PORT || "58122";
const PSQL = "sudo -n docker exec -i hci-postgres psql -U hci_owner -d hci_wave1_synthetic -v ON_ERROR_STOP=1";

const argv = process.argv.slice(2);
const check = argv.includes("--check");
const nums = argv.filter((a) => !a.startsWith("--"));

if (nums.length === 0) {
  console.error("usage: node scripts/apply-hci-postgres-migration.mjs [--check] <number>...   e.g. 0001 0002");
  process.exit(2);
}

/** Resolve "0001" to exactly one *_up.sql file. Ambiguity is a mistake, not something to pick a
 *  winner for. Unlike apply-db-migration.mjs's resolveOne (which excludes a *.down.sql SIBLING in
 *  the same glob), HCI-30's down-migrations already fail this filter on their own suffix
 *  (`_down.sql` does not end in `_up.sql`) -- no separate exclusion needed. */
function resolveOne(num) {
  if (!/^\d{4}$/.test(num)) throw new Error(`not a 4-digit migration number: ${num}`);
  const hits = fs.readdirSync(MIGRATIONS).filter((f) => f.startsWith(`${num}_`) && f.endsWith("_up.sql"));
  if (hits.length !== 1) throw new Error(`${num}: expected exactly 1 *_up.sql file, found ${hits.length}: ${hits.join(", ")}`);
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
  if (/\bCONCURRENTLY\b/i.test(body.replace(/--[^\n]*/g, ""))) {
    console.error(`${num}: contains CONCURRENTLY outside a comment -- cannot run inside a transaction block. Split it by hand.`);
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
    // No BEGIN;/COMMIT; wrapper in this target's migrations (see file header) -- ON_ERROR_STOP=1
    // stops at the first failing statement, it does NOT roll back statements that already
    // succeeded earlier in the same file (autocommit, not a whole-file transaction). Says so
    // plainly rather than claiming a false whole-file-atomic guarantee this convention doesn't have.
    console.error(`\nFAILED after ${applied}/${files.length} at ${num}. Statements before the failing one in THIS file may already be committed (no whole-file transaction in this convention) -- inspect hci-postgres directly before retrying.`);
    process.exit(1);
  }
  // No explicit COMMIT statement exists in these files to echo (unlike apply-db-migration.mjs's
  // Supabase target), so a successful psql exit code alone is the success signal here -- matches
  // dev-db-init.ps1's own Invoke-SqlFile, which checks only $LASTEXITCODE.
  console.log(`OK (${Date.now() - t0} ms)`);
  applied += 1;
}

console.log(`APPLY_OK ${applied}/${files.length}: ${nums.join(" ")}`);
