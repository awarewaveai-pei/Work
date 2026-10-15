// T24: unit tests for scripts/apply-db-migration.mjs's decision logic (ledger injection point,
// --status classification, --record-only, --force-reapply). Every DB interaction goes through a
// fake transport function -- this file never spawns ssh/psql, and fixture migration files live in a
// temp directory, never the real lobster-factory/packages/db/migrations tree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildLedgerInsertSql,
  classifyStatus,
  containsConcurrently,
  findLastTopLevelCommitOffset,
  hasOwnTransaction,
  injectLedgerInsert,
  assertNothingAfterLastCommit,
  migrationSha256,
  LEDGER_MIGRATION,
  ledgerExists,
  parseLedgerLine,
  parseLedgerRows,
  redactSql,
  resolveArgIn,
  resolveOneIn,
  runApply,
  runRecordOnly,
  runStatus,
  sha256Hex,
} from "../apply-db-migration.mjs";

function withTmpMigrationsDir(files, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "migledger-"));
  try {
    for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content, "utf8");
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function okTransport(commitOutput = "COMMIT\n") {
  const calls = [];
  return { calls, transport: (input) => { calls.push(input); return { status: 0, stdout: commitOutput, stderr: "" }; } };
}

function failTransport(message = "boom") {
  return (input) => ({ status: 1, stdout: "", stderr: message });
}

const SIMPLE_MIGRATION = `-- test migration\nBEGIN;\nCREATE TABLE public.x (id int);\nCOMMIT;\n`;

/** Fake read-only transport: answers the ledger-existence probe, then the conflict query. */
function ledgerStatus({ exists = true, applied = [] } = {}) {
  const calls = [];
  const transport = (input) => {
    calls.push(input);
    if (/to_regclass/.test(input)) return { status: 0, stdout: exists ? "t\n" : "f\n", stderr: "" };
    return { status: 0, stdout: applied.map((f) => `${f}\n`).join(""), stderr: "" };
  };
  return { calls, transport };
}

test("containsConcurrently: true for a real CREATE INDEX CONCURRENTLY, false for a mere comment mentioning it", () => {
  assert.equal(containsConcurrently("CREATE INDEX CONCURRENTLY foo ON bar(baz);"), true);
  assert.equal(containsConcurrently("-- this migration does not use CONCURRENTLY\nSELECT 1;"), false);
});

test("hasOwnTransaction: requires both a top-level BEGIN; and COMMIT;", () => {
  assert.equal(hasOwnTransaction("BEGIN;\nSELECT 1;\nCOMMIT;\n"), true);
  assert.equal(hasOwnTransaction("SELECT 1;\n"), false);
  assert.equal(hasOwnTransaction("BEGIN;\nSELECT 1;\n"), false);
});

test("resolveOneIn: resolves a 4-digit number to exactly one file, excludes its .down.sql sibling", () => {
  const files = ["0072_foo.sql", "0072_foo.down.sql", "0073_bar.sql"];
  assert.equal(resolveOneIn("0072", files), "0072_foo.sql");
});

test("resolveOneIn: throws on zero or ambiguous matches", () => {
  assert.throws(() => resolveOneIn("0099", ["0072_foo.sql"]), /expected exactly 1/);
  assert.throws(() => resolveOneIn("0072", ["0072_a.sql", "0072_b.sql"]), /expected exactly 1/);
  assert.throws(() => resolveOneIn("72", ["0072_foo.sql"]), /not a 4-digit/);
});

test("sha256Hex: deterministic, matches a known vector", () => {
  // echo -n "hello" | sha256sum
  assert.equal(sha256Hex("hello"), "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});

test("redactSql: blanks comments, strings, and dollar-quoted bodies to same-length whitespace", () => {
  const sql = "SELECT 1; -- a comment\nSELECT 'it''s here';\ndo $$ begin null; end $$;";
  const r = redactSql(sql);
  assert.equal(r.length, sql.length);
  assert.equal(/comment|it's here|begin null/.test(r), false);
  assert.equal(r.startsWith("SELECT 1;"), true);
});

test("findLastTopLevelCommitOffset: finds the real COMMIT, not one mentioned inside a comment", () => {
  const sql = "BEGIN;\n-- do not COMMIT; early\nCREATE TABLE x (id int);\nCOMMIT;\n";
  const offset = findLastTopLevelCommitOffset(sql);
  assert.equal(sql.slice(offset, offset + 6), "COMMIT");
  // it's the SECOND occurrence of the substring "COMMIT", not the one in the comment
  assert.equal(sql.indexOf("COMMIT"), sql.lastIndexOf("-- do not COMMIT") + 10);
  assert.notEqual(offset, sql.indexOf("COMMIT"));
});

test("findLastTopLevelCommitOffset: a COMMIT mentioned inside a DO $$ body (e.g. in a raised message) is not mistaken for the real one", () => {
  const sql =
    "BEGIN;\n" +
    "DO $$ BEGIN RAISE NOTICE 'remember to COMMIT; your changes'; END $$;\n" +
    "CREATE TABLE public.x (id int);\n" +
    "COMMIT;\n";
  const offset = findLastTopLevelCommitOffset(sql);
  const real = sql.lastIndexOf("COMMIT;");
  assert.equal(offset, real);
});

test("findLastTopLevelCommitOffset: throws when no top-level COMMIT exists at all", () => {
  assert.throws(() => findLastTopLevelCommitOffset("BEGIN;\nSELECT 1;\n"), /no top-level COMMIT/);
});

test("buildLedgerInsertSql + injectLedgerInsert: the INSERT lands immediately before the last COMMIT, and only there", () => {
  const withLedger = injectLedgerInsert(SIMPLE_MIGRATION, { number: "0099", filename: "0099_x.sql", sha256: "a".repeat(64), appliedBy: "tester" });
  const insertIdx = withLedger.indexOf("INSERT INTO public.schema_migrations");
  const commitIdx = withLedger.lastIndexOf("COMMIT;");
  assert.ok(insertIdx > 0 && insertIdx < commitIdx, "INSERT must appear before the last COMMIT;");
  assert.equal(withLedger.slice(commitIdx), "COMMIT;\n", "nothing but the original COMMIT; should follow the injection");
  assert.equal(withLedger.slice(0, insertIdx), SIMPLE_MIGRATION.slice(0, SIMPLE_MIGRATION.lastIndexOf("COMMIT;")), "everything before the injection is untouched");
});

test("buildLedgerInsertSql: escapes single quotes in values", () => {
  const sql = buildLedgerInsertSql({ number: "0099", filename: "it's_a_file.sql", sha256: "a".repeat(64), appliedBy: "o'brien" });
  assert.match(sql, /it''s_a_file\.sql/);
  assert.match(sql, /o''brien/);
});

test("parseLedgerLine / parseLedgerRows: parses psql -tA pipe-separated tuples, skips blanks", () => {
  const row = parseLedgerLine("0091|0091_site_watch.sql|" + "a".repeat(64) + "|2026-09-20 00:00:00+00|deployer");
  assert.equal(row.number, "0091");
  assert.equal(row.filename, "0091_site_watch.sql");
  const rows = parseLedgerRows(`0091|f.sql|${"a".repeat(64)}|t|who\n\n0092|g.sql|${"b".repeat(64)}|t|who\n`);
  assert.equal(rows.length, 2);
});

test("classifyStatus: the four cases -- applied, missing, sha-mismatch, ledger-only", () => {
  const local = [
    { number: "0001", filename: "0001_a.sql", sha256: "a".repeat(64) },
    { number: "0002", filename: "0002_b.sql", sha256: "b".repeat(64) },
    { number: "0003", filename: "0003_c.sql", sha256: "c".repeat(64) },
  ];
  const ledger = [
    { number: "0001", filename: "0001_a.sql", sha256: "a".repeat(64) }, // applied (matches)
    { number: "0002", filename: "0002_b.sql", sha256: "Z".repeat(64) }, // sha-mismatch
    // 0003 is local-only -> "missing"
    { number: "0004", filename: "0004_d.sql", sha256: "d".repeat(64) }, // ledger-only (no local file)
  ];
  const result = classifyStatus(local, ledger);
  const byNumber = Object.fromEntries(result.map((r) => [r.number, r.status]));
  assert.deepEqual(byNumber, { "0001": "applied", "0002": "sha-mismatch", "0003": "missing", "0004": "ledger-only" });
});

test("runApply: already-applied refusal (ledger conflict check runs before any write)", () => {
  withTmpMigrationsDir({ "0099_x.sql": SIMPLE_MIGRATION }, (dir) => {
    const write = okTransport();
    const statusTransport = ledgerStatus({ applied: ["0099_x.sql"] }).transport; // ledger already has it
    assert.throws(
      () => runApply(["0099"], { transport: write.transport, statusTransport, appliedBy: "tester", forceReapply: false, migrationsDir: dir }),
      /already in the ledger/,
    );
    assert.equal(write.calls.length, 0, "the write transport must never be called when refusing");
  });
});

test("runApply: --force-reapply skips the conflict check and applies (upserting the ledger row via ON CONFLICT)", () => {
  withTmpMigrationsDir({ "0099_x.sql": SIMPLE_MIGRATION }, (dir) => {
    const write = okTransport();
    const status = ledgerStatus({ applied: ["0099_x.sql"] });
    const results = runApply(["0099"], { transport: write.transport, statusTransport: status.transport, appliedBy: "tester", forceReapply: true, migrationsDir: dir });
    assert.equal(results.length, 1);
    assert.deepEqual(write.calls.slice(1), ["NOTIFY pgrst, 'reload schema';\n"]); // one apply, then the schema reload
    assert.match(write.calls[0], /ON CONFLICT \(filename\) DO UPDATE/);
    assert.equal(status.calls.some((c) => /SELECT filename FROM/.test(c)), false, "no conflict query under --force-reapply");
  });
});

test("runApply: allowed (no conflict) -- applies and the injected SQL is what gets sent", () => {
  withTmpMigrationsDir({ "0099_x.sql": SIMPLE_MIGRATION }, (dir) => {
    const write = okTransport();
    const statusTransport = ledgerStatus().transport; // no conflict
    const results = runApply(["0099"], { transport: write.transport, statusTransport, appliedBy: "tester", forceReapply: false, migrationsDir: dir });
    assert.equal(results.length, 1);
    assert.equal(results[0].number, "0099");
    assert.match(write.calls[0], /INSERT INTO public\.schema_migrations/);
    assert.match(write.calls[0], /'0099'/);
  });
});

test("runApply: refuses a file containing CONCURRENTLY, before touching any transport", () => {
  withTmpMigrationsDir({ "0099_x.sql": "BEGIN;\nCREATE INDEX CONCURRENTLY foo ON bar(baz);\nCOMMIT;\n" }, (dir) => {
    const write = okTransport();
    const statusTransport = ledgerStatus().transport;
    assert.throws(
      () => runApply(["0099"], { transport: write.transport, statusTransport, appliedBy: "t", forceReapply: false, migrationsDir: dir }),
      /CONCURRENTLY/,
    );
    assert.equal(write.calls.length, 0);
  });
});

test("runApply: a failed psql run (non-zero exit) throws with the file's number named", () => {
  withTmpMigrationsDir({ "0099_x.sql": SIMPLE_MIGRATION }, (dir) => {
    const statusTransport = ledgerStatus().transport;
    assert.throws(
      () => runApply(["0099"], { transport: failTransport("syntax error"), statusTransport, appliedBy: "t", forceReapply: false, migrationsDir: dir }),
      /FAILED at 0099/,
    );
  });
});

test("runApply: no COMMIT in psql's output (exit 0 but nothing committed) is also a failure", () => {
  withTmpMigrationsDir({ "0099_x.sql": SIMPLE_MIGRATION }, (dir) => {
    const statusTransport = ledgerStatus().transport;
    const emptyOutputTransport = () => ({ status: 0, stdout: "", stderr: "" });
    assert.throws(
      () => runApply(["0099"], { transport: emptyOutputTransport, statusTransport, appliedBy: "t", forceReapply: false, migrationsDir: dir }),
      /NO COMMIT/,
    );
  });
});

const RELOAD = "NOTIFY pgrst, 'reload schema';\n";

test("runApply: after a commit the PostgREST schema cache is reloaded (0099 on 2026-10-15: new column invisible to supabase-js)", () => {
  withTmpMigrationsDir({ "0099_x.sql": SIMPLE_MIGRATION }, (dir) => {
    const write = okTransport();
    runApply(["0099"], { transport: write.transport, statusTransport: ledgerStatus().transport, appliedBy: "t", forceReapply: false, migrationsDir: dir });
    assert.equal(write.calls.length, 2);
    assert.equal(write.calls[1], RELOAD);
  });
});

test("runApply: a later file failing still reloads for the files already committed; nothing committed -> no reload", () => {
  withTmpMigrationsDir({ "0098_a.sql": SIMPLE_MIGRATION, "0099_b.sql": SIMPLE_MIGRATION }, (dir) => {
    const calls = [];
    const transport = (input) => {
      calls.push(input);
      return input === RELOAD || calls.length === 1 ? { status: 0, stdout: "COMMIT\n", stderr: "" } : { status: 1, stdout: "", stderr: "boom" };
    };
    assert.throws(
      () => runApply(["0098", "0099"], { transport, statusTransport: ledgerStatus().transport, appliedBy: "t", forceReapply: false, migrationsDir: dir }),
      /FAILED at 0099/,
    );
    assert.equal(calls.at(-1), RELOAD);
  });
  withTmpMigrationsDir({ "0099_x.sql": SIMPLE_MIGRATION }, (dir) => {
    const calls = [];
    const transport = (input) => (calls.push(input), { status: 1, stdout: "", stderr: "boom" });
    assert.throws(() => runApply(["0099"], { transport, statusTransport: ledgerStatus().transport, appliedBy: "t", forceReapply: false, migrationsDir: dir }), /FAILED at 0099/);
    assert.ok(!calls.includes(RELOAD));
  });
});

test("runApply: a failed reload is an error naming the manual fix", () => {
  withTmpMigrationsDir({ "0099_x.sql": SIMPLE_MIGRATION }, (dir) => {
    const transport = (input) => (input === RELOAD ? { status: 1, stdout: "", stderr: "no route" } : { status: 0, stdout: "COMMIT\n", stderr: "" });
    assert.throws(
      () => runApply(["0099"], { transport, statusTransport: ledgerStatus().transport, appliedBy: "t", forceReapply: false, migrationsDir: dir }),
      /schema reload failed -- run NOTIFY pgrst/,
    );
  });
});

test("runRecordOnly: requires --i-verified", () => {
  withTmpMigrationsDir({ "0099_x.sql": SIMPLE_MIGRATION }, (dir) => {
    assert.throws(
      () => runRecordOnly(["0099"], { transport: okTransport().transport, statusTransport: ledgerStatus().transport, appliedBy: "t", iVerified: false, migrationsDir: dir }),
      /--i-verified/,
    );
  });
});

test("runRecordOnly: with --i-verified, records ledger rows without running the migration's own SQL", () => {
  withTmpMigrationsDir({ "0001_a.sql": SIMPLE_MIGRATION, "0002_b.sql": SIMPLE_MIGRATION }, (dir) => {
    const write = okTransport();
    const entries = runRecordOnly(["0001", "0002"], { transport: write.transport, statusTransport: ledgerStatus().transport, appliedBy: "tester", iVerified: true, migrationsDir: dir });
    assert.equal(entries.length, 2);
    assert.equal(write.calls.length, 1, "one combined transaction for all numbers");
    assert.match(write.calls[0], /^BEGIN;/);
    assert.match(write.calls[0], /COMMIT;\s*$/);
    assert.doesNotMatch(write.calls[0], /CREATE TABLE public\.x/, "must not run the migration file's own SQL");
    assert.match(write.calls[0], /ON CONFLICT \(filename\) DO NOTHING/);
    assert.doesNotMatch(write.calls[0], /DO UPDATE/, "a backfill never overwrites a row");
  });
});

test("runStatus: queries the ledger and classifies against the real migrationsDir passed in", () => {
  withTmpMigrationsDir({ "0001_a.sql": SIMPLE_MIGRATION }, (dir) => {
    const sha = sha256Hex(Buffer.from(SIMPLE_MIGRATION));
    const transport = () => ({ status: 0, stdout: `0001|0001_a.sql|${sha}|2026-01-01|tester\n`, stderr: "" });
    const rows = runStatus(transport, dir);
    assert.deepEqual(rows, [{ number: "0001", filename: "0001_a.sql", status: "applied" }]);
  });
});

test("resolveArgIn: a number naming one file, or an exact filename; an ambiguous number is refused", () => {
  const files = ["0011_ops.sql", "0011_social.sql", "0072_foo.sql", "0072_foo.down.sql"];
  assert.equal(resolveArgIn("0072", files), "0072_foo.sql");
  assert.equal(resolveArgIn("0011_social.sql", files), "0011_social.sql");
  assert.throws(() => resolveArgIn("0011", files), /expected exactly 1/);
  assert.throws(() => resolveArgIn("0072_foo.down.sql", files), /not a migration number/);
  assert.throws(() => resolveArgIn("0099_missing.sql", files), /not a migration number/);
});

test("classifyStatus: two files sharing a number are two ledger rows, keyed by filename", () => {
  const local = [
    { number: "0011", filename: "0011_ops.sql", sha256: "a".repeat(64) },
    { number: "0011", filename: "0011_social.sql", sha256: "b".repeat(64) },
  ];
  const ledger = [{ number: "0011", filename: "0011_social.sql", sha256: "b".repeat(64) }];
  const byFile = Object.fromEntries(classifyStatus(local, ledger).map((r) => [r.filename, r.status]));
  assert.deepEqual(byFile, { "0011_ops.sql": "missing", "0011_social.sql": "applied" });
});

test("runRecordOnly: exact filenames record both twins of a shared number", () => {
  withTmpMigrationsDir({ "0011_ops.sql": SIMPLE_MIGRATION, "0011_social.sql": SIMPLE_MIGRATION }, (dir) => {
    const write = okTransport();
    const entries = runRecordOnly(["0011_ops.sql", "0011_social.sql"], { transport: write.transport, statusTransport: ledgerStatus().transport, appliedBy: "t", iVerified: true, migrationsDir: dir });
    assert.deepEqual(entries.map((e) => [e.number, e.filename]), [["0011", "0011_ops.sql"], ["0011", "0011_social.sql"]]);
  });
});

test("runApply: before the ledger exists, only a batch that starts with the ledger migration is accepted", () => {
  withTmpMigrationsDir({ [LEDGER_MIGRATION]: SIMPLE_MIGRATION, "0093_y.sql": SIMPLE_MIGRATION }, (dir) => {
    const write = okTransport();
    assert.throws(
      () => runApply(["0093"], { transport: write.transport, statusTransport: ledgerStatus({ exists: false }).transport, appliedBy: "t", forceReapply: false, migrationsDir: dir }),
      /must be the first file of this batch/,
    );
    assert.equal(write.calls.length, 0);
    const results = runApply(["0092", "0093"], { transport: write.transport, statusTransport: ledgerStatus({ exists: false }).transport, appliedBy: "t", forceReapply: false, migrationsDir: dir });
    assert.equal(results.length, 2);
    assert.ok(write.calls[0].includes(`'${LEDGER_MIGRATION}'`), "0092 records its own row in its own transaction");
  });
});

test("ledgerExists: an errored or unexpected probe fails closed (throws), never reads as 'no ledger'", () => {
  assert.equal(ledgerExists(() => ({ status: 0, stdout: "t\n", stderr: "" })), true);
  assert.equal(ledgerExists(() => ({ status: 0, stdout: "f\n", stderr: "" })), false);
  assert.throws(() => ledgerExists(() => ({ status: 3, stdout: "", stderr: "ERROR: permission denied" })), /existence check failed/);
  assert.throws(() => ledgerExists(() => ({ status: 0, stdout: "", stderr: "" })), /existence check failed/);
});

test("runRecordOnly: refuses a file that already has a ledger row (never overwrites a real apply's sha)", () => {
  withTmpMigrationsDir({ "0001_a.sql": SIMPLE_MIGRATION }, (dir) => {
    const write = okTransport();
    assert.throws(
      () => runRecordOnly(["0001"], { transport: write.transport, statusTransport: ledgerStatus({ applied: ["0001_a.sql"] }).transport, appliedBy: "t", iVerified: true, migrationsDir: dir }),
      /never overwrites: 0001_a\.sql/,
    );
    assert.equal(write.calls.length, 0);
  });
});

test("a file named twice in one batch is refused (apply and record-only)", () => {
  withTmpMigrationsDir({ "0093_x.sql": SIMPLE_MIGRATION }, (dir) => {
    const write = okTransport();
    assert.throws(() => runApply(["0093", "0093_x.sql"], { transport: write.transport, statusTransport: ledgerStatus().transport, appliedBy: "t", forceReapply: false, migrationsDir: dir }), /more than once/);
    assert.throws(() => runRecordOnly(["0093", "0093"], { transport: write.transport, statusTransport: ledgerStatus().transport, appliedBy: "t", iVerified: true, migrationsDir: dir }), /more than once/);
    assert.equal(write.calls.length, 0);
  });
});

test("assertNothingAfterLastCommit: a statement after the last COMMIT is refused; comments and blank lines are fine", () => {
  assert.doesNotThrow(() => assertNothingAfterLastCommit("BEGIN;\nSELECT 1;\nCOMMIT;\n-- trailing note\n\n"));
  assert.throws(() => assertNothingAfterLastCommit("BEGIN;\nSELECT 1;\nCOMMIT;\nCOMMENT ON FUNCTION f() IS 'x';\n"), /outside the migration's transaction/);
  withTmpMigrationsDir({ "0099_x.sql": "BEGIN;\nSELECT 1;\nCOMMIT;\nNOTIFY pgrst;\n" }, (dir) => {
    const write = okTransport();
    assert.throws(() => runApply(["0099"], { transport: write.transport, statusTransport: ledgerStatus().transport, appliedBy: "t", forceReapply: false, migrationsDir: dir }), /outside/);
    assert.equal(write.calls.length, 0);
  });
});

test("migrationSha256: the same content hashes the same with CRLF or LF line endings", () => {
  assert.equal(migrationSha256(Buffer.from("BEGIN;\r\nSELECT 1;\r\nCOMMIT;\r\n")), migrationSha256(Buffer.from("BEGIN;\nSELECT 1;\nCOMMIT;\n")));
  assert.equal(migrationSha256(Buffer.from("x\n")), sha256Hex("x\n"));
});
