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
  parseLedgerLine,
  parseLedgerRows,
  redactSql,
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
    const statusTransport = () => ({ status: 0, stdout: "0099\n", stderr: "" }); // ledger already has 0099
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
    const statusTransport = () => { throw new Error("must not be called when forceReapply is true"); };
    const results = runApply(["0099"], { transport: write.transport, statusTransport, appliedBy: "tester", forceReapply: true, migrationsDir: dir });
    assert.equal(results.length, 1);
    assert.equal(write.calls.length, 1);
    assert.match(write.calls[0], /ON CONFLICT \(number\) DO UPDATE/);
  });
});

test("runApply: allowed (no conflict) -- applies and the injected SQL is what gets sent", () => {
  withTmpMigrationsDir({ "0099_x.sql": SIMPLE_MIGRATION }, (dir) => {
    const write = okTransport();
    const statusTransport = () => ({ status: 0, stdout: "", stderr: "" }); // no conflict
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
    const statusTransport = () => ({ status: 0, stdout: "", stderr: "" });
    assert.throws(
      () => runApply(["0099"], { transport: write.transport, statusTransport, appliedBy: "t", forceReapply: false, migrationsDir: dir }),
      /CONCURRENTLY/,
    );
    assert.equal(write.calls.length, 0);
  });
});

test("runApply: a failed psql run (non-zero exit) throws with the file's number named", () => {
  withTmpMigrationsDir({ "0099_x.sql": SIMPLE_MIGRATION }, (dir) => {
    const statusTransport = () => ({ status: 0, stdout: "", stderr: "" });
    assert.throws(
      () => runApply(["0099"], { transport: failTransport("syntax error"), statusTransport, appliedBy: "t", forceReapply: false, migrationsDir: dir }),
      /FAILED at 0099/,
    );
  });
});

test("runApply: no COMMIT in psql's output (exit 0 but nothing committed) is also a failure", () => {
  withTmpMigrationsDir({ "0099_x.sql": SIMPLE_MIGRATION }, (dir) => {
    const statusTransport = () => ({ status: 0, stdout: "", stderr: "" });
    const emptyOutputTransport = () => ({ status: 0, stdout: "", stderr: "" });
    assert.throws(
      () => runApply(["0099"], { transport: emptyOutputTransport, statusTransport, appliedBy: "t", forceReapply: false, migrationsDir: dir }),
      /NO COMMIT/,
    );
  });
});

test("runRecordOnly: requires --i-verified", () => {
  withTmpMigrationsDir({ "0099_x.sql": SIMPLE_MIGRATION }, (dir) => {
    assert.throws(
      () => runRecordOnly(["0099"], { transport: okTransport().transport, appliedBy: "t", iVerified: false, migrationsDir: dir }),
      /--i-verified/,
    );
  });
});

test("runRecordOnly: with --i-verified, records ledger rows without running the migration's own SQL", () => {
  withTmpMigrationsDir({ "0001_a.sql": SIMPLE_MIGRATION, "0002_b.sql": SIMPLE_MIGRATION }, (dir) => {
    const write = okTransport();
    const entries = runRecordOnly(["0001", "0002"], { transport: write.transport, appliedBy: "tester", iVerified: true, migrationsDir: dir });
    assert.equal(entries.length, 2);
    assert.equal(write.calls.length, 1, "one combined transaction for all numbers");
    assert.match(write.calls[0], /^BEGIN;/);
    assert.match(write.calls[0], /COMMIT;\s*$/);
    assert.doesNotMatch(write.calls[0], /CREATE TABLE public\.x/, "must not run the migration file's own SQL");
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
