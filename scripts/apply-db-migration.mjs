/**
 * Apply numbered migrations from lobster-factory/packages/db/migrations to the self-hosted Supabase,
 * over the ONLY path that works: ssh -> `docker exec -i supabase-db psql -U supabase_admin`.
 *
 *   node scripts/apply-db-migration.mjs --check 0072 0073      # resolve + print, touch nothing
 *   node scripts/apply-db-migration.mjs 0072 0073 0074 0075    # apply, in the order given
 *   node scripts/apply-db-migration.mjs --force-reapply 0072   # apply + upsert the ledger row even if already recorded
 *   node scripts/apply-db-migration.mjs --status               # read-only: local files vs ledger rows
 *   node scripts/apply-db-migration.mjs --record-only 0001 0002 ... --i-verified   # backfill ledger rows for pre-ledger history; runs no SQL file
 *   A number that names two files (0011 has two) is refused; pass the exact filename instead.
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
 *
 * LEDGER (0092_schema_migrations_ledger.sql, public.schema_migrations): each applied file gets one
 * INSERT ... ON CONFLICT DO UPDATE injected into ITS OWN transaction, immediately before its last
 * top-level `COMMIT;` (found by blanking comments/strings/dollar-quoted bodies to same-length
 * whitespace first, so a COMMIT mentioned inside a DO $$ body or a comment is never mistaken for the
 * real one -- see findLastTopLevelCommitOffset). The row therefore commits atomically with the
 * migration: both happen or neither does. The ledger is keyed by FILENAME (numbers are not unique).
 * Applying a file already in the ledger is refused unless --force-reapply is given. While the table
 * does not exist yet, only a batch that starts with 0092 itself is accepted (its CREATE TABLE runs
 * before the injected INSERT, inside the same transaction). Every ledger query runs with
 * ON_ERROR_STOP: psql exits 0 on a failed statement otherwise, which would read as "nothing applied".
 *
 * TRANSPORT: every psql interaction goes through a `transport(input) -> {status, stdout, stderr}`
 * function, injectable via the exported `run*` functions' last parameter -- so this file's decision
 * logic (which files to apply, where to inject, how to classify --status) is unit-testable without
 * SSH (see scripts/__tests__/apply-db-migration.test.mjs). `main()` builds the real one from
 * AWAREWAVE_SSH_HOST/_USER/_PORT (unchanged env vars).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRATIONS = path.join(root, "lobster-factory/packages/db/migrations");

const SSH_HOST = process.env.AWAREWAVE_SSH_HOST || "145.239.195.47";
const SSH_USER = process.env.AWAREWAVE_SSH_USER || "ubuntu"; // root login is refused on this host
const SSH_PORT = process.env.AWAREWAVE_SSH_PORT || "58122";
const PSQL = "sudo -n docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1";
const PSQL_STATUS = "sudo -n docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tA";
export const LEDGER_MIGRATION = "0092_schema_migrations_ledger.sql";

// ─────────────────────────────────────────────
// Pure helpers (no fs, no network) -- exported for the test file.
// ─────────────────────────────────────────────

export function containsConcurrently(body) {
  // Strip line comments first, or a comment that merely mentions CONCURRENTLY blocks a migration
  // that does not use it (0072 has exactly such a comment).
  return /\bCONCURRENTLY\b/i.test(body.replace(/--[^\n]*/g, ""));
}

export function hasOwnTransaction(body) {
  return /^\s*BEGIN\s*;/im.test(body) && /^\s*COMMIT\s*;/im.test(body);
}

/** Resolve "0072" against an in-memory filename list. Ambiguity is a mistake, not a winner to pick. */
export function resolveOneIn(num, availableFilenames) {
  if (!/^\d{4}$/.test(num)) throw new Error(`not a 4-digit migration number: ${num}`);
  // .endsWith(".sql") alone also matches that number's own *.down.sql sibling -- excluded
  // explicitly, not by requiring callers to name down-files differently.
  const hits = availableFilenames.filter((f) => f.startsWith(`${num}_`) && f.endsWith(".sql") && !f.endsWith(".down.sql"));
  if (hits.length !== 1) throw new Error(`${num}: expected exactly 1 migration file, found ${hits.length}: ${hits.join(", ")}`);
  return hits[0];
}

/** A CLI argument is a 4-digit number (must name exactly one file) or an exact migration filename. */
export function resolveArgIn(arg, availableFilenames) {
  if (/^\d{4}$/.test(arg)) return resolveOneIn(arg, availableFilenames);
  if (/^\d{4}_[^/\\]+\.sql$/.test(arg) && !arg.endsWith(".down.sql") && availableFilenames.includes(arg)) return arg;
  throw new Error(`not a migration number or an existing migration filename: ${arg}`);
}

const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function sha256Hex(bufferOrString) {
  return crypto.createHash("sha256").update(bufferOrString).digest("hex");
}

/** The ledger's hash of a migration file: CRLF normalized to LF, so a Windows checkout and a Linux one
 * record the same value for the same content (.gitattributes says eol=lf; working trees still vary). */
export function migrationSha256(buffer) {
  return sha256Hex(Buffer.from(buffer).toString("utf8").replace(/\r\n/g, "\n"));
}

/** Blanks comments, single-quoted strings, and dollar-quoted bodies to same-length whitespace
 * (offsets survive) so a COMMIT keyword inside any of them is never mistaken for a real statement.
 * Duplicated from lib/db/security-definer-grants.ts's redact() rather than shared: scripts/ and
 * next-admin are separate runtimes (one plain Node ESM, one TypeScript/Next.js) with no existing
 * shared-code path between them. */
export function redactSql(sql) {
  let out = "";
  let i = 0;
  const n = sql.length;
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < n) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out += blank(sql.slice(i, stop));
      i = stop;
      continue;
    }
    if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      out += blank(sql.slice(i, stop));
      i = stop;
      continue;
    }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j += 1; break; }
        j++;
      }
      out += blank(sql.slice(i, j));
      i = j;
      continue;
    }
    if (sql[i] === "$") {
      const tagMatch = /^\$([a-zA-Z_][a-zA-Z0-9_]*)?\$/.exec(sql.slice(i));
      if (tagMatch) {
        const opener = tagMatch[0];
        const closerIdx = sql.indexOf(opener, i + opener.length);
        const stop = closerIdx === -1 ? n : closerIdx + opener.length;
        out += blank(sql.slice(i, stop));
        i = stop;
        continue;
      }
    }
    out += sql[i];
    i++;
  }
  return out;
}

/** Offset of the file's LAST top-level `COMMIT;` (its own line, ignoring leading/trailing
 * whitespace). Throws if none is found after redaction -- refusing rather than guessing. */
export function findLastTopLevelCommitOffset(sql) {
  const redacted = redactSql(sql);
  const re = /^[ \t]*COMMIT[ \t]*;[ \t]*$/gim;
  let m;
  let last = null;
  while ((m = re.exec(redacted))) last = m;
  if (!last) throw new Error("no top-level COMMIT; found -- cannot identify the ledger injection point unambiguously");
  return last.index;
}

export function buildLedgerInsertSql({ number, filename, sha256, appliedBy }) {
  return (
    `INSERT INTO public.schema_migrations (filename, number, sha256, applied_by) ` +
    `VALUES (${sqlText(filename)}, ${sqlText(number)}, ${sqlText(sha256)}, ${sqlText(appliedBy)}) ` +
    `ON CONFLICT (filename) DO UPDATE SET number = excluded.number, sha256 = excluded.sha256, ` +
    `applied_at = now(), applied_by = excluded.applied_by;\n`
  );
}

/** Throws when a statement follows the last top-level COMMIT: it would run outside the file's
 * transaction, after the ledger row committed (0056 has a trailing COMMENT ON FUNCTION). */
export function assertNothingAfterLastCommit(sql) {
  const offset = findLastTopLevelCommitOffset(sql);
  const rest = redactSql(sql).slice(offset).replace(/^[ \t]*COMMIT[ \t]*;/i, "");
  if (rest.trim() !== "") {
    throw new Error("statements after the last top-level COMMIT; would run outside the migration's transaction -- move them inside it");
  }
}

/** Splices the ledger INSERT immediately before the file's last top-level COMMIT;. */
export function injectLedgerInsert(sql, entry) {
  const offset = findLastTopLevelCommitOffset(sql);
  return sql.slice(0, offset) + buildLedgerInsertSql(entry) + sql.slice(offset);
}

/** One line of `psql -tA` output ("number|filename|sha256|applied_at|applied_by") -> a row, or
 * null for a blank line. */
export function parseLedgerLine(line) {
  const parts = line.split("|");
  if (parts.length < 5) return null;
  const [number, filename, sha256, appliedAt, appliedBy] = parts;
  return { number: number.trim(), filename: filename.trim(), sha256: sha256.trim(), appliedAt: appliedAt.trim(), appliedBy: appliedBy.trim() };
}

export function parseLedgerRows(output) {
  return output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseLedgerLine)
    .filter((r) => r !== null);
}

/** --status's classification: local files vs ledger rows -> applied / missing / sha-mismatch /
 * ledger-only. Pure -- no fs, no network; `localFiles` and `ledgerRows` are plain data. */
export function classifyStatus(localFiles, ledgerRows) {
  const ledgerByFile = new Map(ledgerRows.map((r) => [r.filename, r]));
  const localByFile = new Map(localFiles.map((f) => [f.filename, f]));
  const results = [];
  for (const f of localFiles) {
    const row = ledgerByFile.get(f.filename);
    if (!row) {
      results.push({ number: f.number, filename: f.filename, status: "missing" });
    } else if (row.sha256 !== f.sha256) {
      results.push({ number: f.number, filename: f.filename, status: "sha-mismatch", ledgerSha256: row.sha256, localSha256: f.sha256 });
    } else {
      results.push({ number: f.number, filename: f.filename, status: "applied" });
    }
  }
  for (const row of ledgerRows) {
    if (!localByFile.has(row.filename)) results.push({ number: row.number, filename: row.filename, status: "ledger-only" });
  }
  return results.sort((a, b) => a.filename.localeCompare(b.filename));
}

// ─────────────────────────────────────────────
// Transport (the only part that touches the network)
// ─────────────────────────────────────────────

/** Default transport: ssh -> docker exec -i supabase-db psql, piping `input` to its stdin. */
export function sshTransport(psqlCmd) {
  return (input) => {
    const r = spawnSync("ssh", ["-p", SSH_PORT, "-o", "BatchMode=yes", `${SSH_USER}@${SSH_HOST}`, psqlCmd], {
      input,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}

// ─────────────────────────────────────────────
// Modes (each takes an explicit transport so tests never touch ssh)
// ─────────────────────────────────────────────

function localMigrationFiles(migrationsDir) {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort()
    .map((filename) => ({
      number: filename.slice(0, 4),
      filename,
      sha256: migrationSha256(fs.readFileSync(path.join(migrationsDir, filename))),
    }));
}

/** Whether public.schema_migrations exists yet (false only before 0092 is applied). */
export function ledgerExists(statusTransport) {
  const rep = statusTransport("SELECT to_regclass('public.schema_migrations') IS NOT NULL;\n");
  const out = (rep.stdout ?? "").trim();
  if (rep.status !== 0 || (out !== "t" && out !== "f")) {
    throw new Error(`ledger existence check failed: ${(rep.stderr || rep.stdout || "").slice(0, 2000)}`);
  }
  return out === "t";
}

export function runStatus(transport, migrationsDir = MIGRATIONS) {
  const local = localMigrationFiles(migrationsDir);
  const rep = transport("SELECT number, filename, sha256, applied_at, applied_by FROM public.schema_migrations ORDER BY filename;\n");
  if (rep.status !== 0) throw new Error(`--status query failed: ${(rep.stderr || rep.stdout || "").slice(0, 2000)}`);
  const ledgerRows = parseLedgerRows(rep.stdout);
  return classifyStatus(local, ledgerRows);
}

export function runRecordOnly(nums, { transport, statusTransport, appliedBy, iVerified, migrationsDir = MIGRATIONS }) {
  if (!iVerified) throw new Error("--record-only requires --i-verified (confirms each number was verified live-applied before running this)");
  const available = fs.readdirSync(migrationsDir);
  const entries = nums.map((arg) => {
    const filename = resolveArgIn(arg, available);
    const sha256 = migrationSha256(fs.readFileSync(path.join(migrationsDir, filename)));
    return { number: filename.slice(0, 4), filename, sha256, appliedBy };
  });
  assertDistinct(entries.map((e) => e.filename));
  // A backfill never replaces a row: an existing one came from a real apply (or an earlier backfill),
  // and overwriting its sha would hide exactly the sha-mismatch --status exists to show.
  const inClause = entries.map((e) => sqlText(e.filename)).join(",");
  const rep0 = statusTransport(`SELECT filename FROM public.schema_migrations WHERE filename IN (${inClause});\n`);
  if (rep0.status !== 0) throw new Error(`ledger conflict check failed: ${(rep0.stderr || rep0.stdout || "").slice(0, 2000)}`);
  const already = rep0.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  if (already.length > 0) throw new Error(`already in the ledger, --record-only never overwrites: ${already.join(", ")}`);
  const sql = "BEGIN;\n" + entries.map((e) => buildLedgerInsertSql(e).replace(/ON CONFLICT \(filename\) DO UPDATE[^;]*;/, "ON CONFLICT (filename) DO NOTHING;")).join("") + "COMMIT;\n";
  const rep = transport(sql);
  if (rep.status !== 0 || !/^COMMIT$/m.test(`${rep.stdout}${rep.stderr}`)) {
    throw new Error(`--record-only failed: ${(rep.stderr || rep.stdout || "").slice(0, 2000)}`);
  }
  return entries;
}

/** Two arguments naming the same file (0093 and 0093_x.sql) would apply it twice in one batch. */
function assertDistinct(filenames) {
  const dup = filenames.filter((f, i) => filenames.indexOf(f) !== i);
  if (dup.length) throw new Error(`named more than once in this batch: ${[...new Set(dup)].join(", ")}`);
}

export function runApply(nums, { transport, statusTransport, appliedBy, forceReapply, migrationsDir = MIGRATIONS }) {
  const available = fs.readdirSync(migrationsDir);
  const files = nums.map((arg) => {
    const filename = resolveArgIn(arg, available);
    return { number: filename.slice(0, 4), filename, file: path.join(migrationsDir, filename) };
  });
  assertDistinct(files.map((f) => f.filename));

  for (const { number, file } of files) {
    const body = fs.readFileSync(file, "utf8");
    if (containsConcurrently(body)) throw new Error(`${number}: contains CONCURRENTLY, which cannot run inside the file's transaction. Split it by hand.`);
    if (!hasOwnTransaction(body)) throw new Error(`${number}: no BEGIN;/COMMIT; of its own. This runner adds none, so it would apply statement by statement.`);
    findLastTopLevelCommitOffset(body); // throws if the injection point is ambiguous -- fail before applying anything
    assertNothingAfterLastCommit(body);
  }

  if (!ledgerExists(statusTransport)) {
    if (files[0].filename !== LEDGER_MIGRATION) {
      throw new Error(`public.schema_migrations does not exist yet: ${LEDGER_MIGRATION} must be the first file of this batch`);
    }
  } else if (!forceReapply) {
    const inClause = files.map((f) => sqlText(f.filename)).join(",");
    const rep = statusTransport(`SELECT filename FROM public.schema_migrations WHERE filename IN (${inClause});\n`);
    if (rep.status !== 0) throw new Error(`ledger conflict check failed: ${(rep.stderr || rep.stdout || "").slice(0, 2000)}`);
    const already = rep.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    if (already.length > 0) {
      throw new Error(`already in the ledger, refusing (use --force-reapply to re-apply and upsert): ${already.join(", ")}`);
    }
  }

  const results = [];
  let failure = null;
  for (const { number, filename, file } of files) {
    const buf = fs.readFileSync(file);
    const sha256 = migrationSha256(buf);
    const withLedger = injectLedgerInsert(buf.toString("utf8"), { number, filename, sha256, appliedBy });
    const rep = transport(withLedger);
    const out = `${rep.stdout ?? ""}${rep.stderr ?? ""}`.trim();
    if (rep.status !== 0) {
      failure = new Error(`FAILED at ${number} after ${results.length}/${files.length}. ON_ERROR_STOP rolled that file back whole; earlier files are committed.\n${out.split("\n").slice(-25).join("\n")}`);
      break;
    }
    if (!/^COMMIT$/m.test(out)) {
      // psql exits 0 on an empty or comment-only input too. No COMMIT line means nothing was committed.
      failure = new Error(`NO COMMIT for ${number}.\n${out.split("\n").slice(-25).join("\n")}`);
      break;
    }
    results.push({ number, filename, sha256 });
  }
  // PostgREST serves from a schema cache: until reloaded, a new column or table is invisible to every
  // supabase-js caller ("Could not find the 'x' column ... in the schema cache"; 0099 on 2026-10-15).
  // Committed files need it even when a later file failed.
  if (results.length > 0) reloadPostgrestSchema(transport);
  if (failure) throw failure;
  return results;
}

export function reloadPostgrestSchema(transport) {
  const rep = transport("NOTIFY pgrst, 'reload schema';\n");
  if (rep.status !== 0) {
    throw new Error(`migrations committed, but the PostgREST schema reload failed -- run NOTIFY pgrst, 'reload schema'; by hand.\n${(rep.stderr || rep.stdout || "").slice(0, 2000)}`);
  }
}

// ─────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check");
  const status = argv.includes("--status");
  const recordOnly = argv.includes("--record-only");
  const forceReapply = argv.includes("--force-reapply");
  const iVerified = argv.includes("--i-verified");
  const nums = argv.filter((a) => !a.startsWith("--"));
  const appliedBy = process.env.MIGRATION_APPLIED_BY || os.userInfo().username || "apply-db-migration.mjs";

  if (check && (status || recordOnly || forceReapply)) {
    console.error("--check only resolves files; it cannot be combined with --status, --record-only or --force-reapply");
    process.exit(2);
  }

  const transport = sshTransport(PSQL);
  const statusTransport = sshTransport(PSQL_STATUS);

  if (status) {
    let rows;
    try {
      rows = runStatus(statusTransport);
    } catch (e) {
      console.error("--status FAILED:", e.message);
      process.exit(1);
    }
    for (const r of rows) {
      const extra = r.status === "sha-mismatch" ? ` (ledger=${r.ledgerSha256.slice(0, 12)} local=${r.localSha256.slice(0, 12)})` : "";
      console.log(`${r.number} ${r.filename} -- ${r.status}${extra}`);
    }
    const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
    console.log(`STATUS_OK ${JSON.stringify(counts)}`);
    process.exit(0);
  }

  if (recordOnly) {
    if (nums.length === 0) {
      console.error("usage: node scripts/apply-db-migration.mjs --record-only <number>... --i-verified");
      process.exit(2);
    }
    try {
      const entries = runRecordOnly(nums, { transport, statusTransport, appliedBy, iVerified });
      console.log(`RECORD_ONLY_OK ${entries.length}: ${entries.map((e) => e.number).join(" ")}`);
      process.exit(0);
    } catch (e) {
      console.error("--record-only FAILED:", e.message);
      process.exit(1);
    }
  }

  if (nums.length === 0) {
    console.error("usage: node scripts/apply-db-migration.mjs [--check] <number>...   e.g. 0072 0073");
    process.exit(2);
  }

  let files;
  try {
    const available = fs.readdirSync(MIGRATIONS);
    files = nums.map((n) => ({ num: n, file: path.join(MIGRATIONS, resolveArgIn(n, available)) }));
  } catch (e) {
    console.error("resolve FAILED:", e.message);
    process.exit(2);
  }

  for (const { num, file } of files) {
    const body = fs.readFileSync(file, "utf8");
    if (containsConcurrently(body)) {
      console.error(`${num}: contains CONCURRENTLY, which cannot run inside the file's transaction. Split it by hand.`);
      process.exit(2);
    }
    if (!hasOwnTransaction(body)) {
      console.error(`${num}: no BEGIN;/COMMIT; of its own. This runner adds none, so it would apply statement by statement.`);
      process.exit(2);
    }
    try {
      assertNothingAfterLastCommit(body);
    } catch (e) {
      console.error(`${num}: ${e.message}`);
      process.exit(2);
    }
    console.log(`resolved ${num} -> ${path.relative(root, file).replace(/\\/g, "/")} (${body.length} bytes)`);
  }

  if (check) {
    console.log("--check: nothing applied.");
    process.exit(0);
  }

  try {
    const results = runApply(nums, { transport, statusTransport, appliedBy, forceReapply });
    for (const r of results) console.log(`applied ${r.number} -> ${r.filename} OK`);
    console.log(`APPLY_OK ${results.length}/${files.length}: ${nums.join(" ")}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
