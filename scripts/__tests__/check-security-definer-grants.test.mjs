// T22: unit tests for the parser/decision half of check-security-definer-grants.mjs, using
// fixture rows only -- this file never spawns ssh/psql and must never be pointed at production.
// Fixture shapes are drawn from packages/db/migrations/0064_lockdown_security_definer_anon_grants.sql's
// own documented pre-fix/post-fix proacl dumps.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideViolations,
  grantedRoles,
  parseAcl,
  parseProaclLine,
  rowsFromPsqlOutput,
} from "../check-security-definer-grants.mjs";

test("parseProaclLine splits psql -tA's pipe-separated tuple output", () => {
  const row = parseProaclLine("archive_stale_repair_runs|integer|{supabase_admin=X/supabase_admin,service_role=X/supabase_admin}");
  assert.deepEqual(row, {
    proname: "archive_stale_repair_runs",
    args: "integer",
    acl: "{supabase_admin=X/supabase_admin,service_role=X/supabase_admin}",
  });
});

test("parseProaclLine returns null for a blank or malformed line (psql trailing blank lines)", () => {
  assert.equal(parseProaclLine(""), null);
  assert.equal(parseProaclLine("not_enough_fields"), null);
});

test("parseAcl: an empty grantee before '=' means PUBLIC", () => {
  assert.deepEqual(parseAcl("{=X/supabase_admin,service_role=X/supabase_admin}"), [
    { grantee: "public", privileges: "X" },
    { grantee: "service_role", privileges: "X" },
  ]);
});

test("parseAcl: null/empty proacl is []", () => {
  assert.deepEqual(parseAcl(null), []);
  assert.deepEqual(parseAcl(""), []);
  assert.deepEqual(parseAcl("{}"), []);
});

test("grantedRoles: the 0064 pre-fix shape (anon + authenticated both hold EXECUTE)", () => {
  const acl = "{supabase_admin=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin}";
  assert.deepEqual(grantedRoles(acl), ["anon", "authenticated"]);
});

test("grantedRoles: the 0064 post-fix shape (locked down -- no anon/authenticated/public)", () => {
  const acl = "{supabase_admin=X/supabase_admin,postgres=X/supabase_admin,service_role=X/supabase_admin}";
  assert.deepEqual(grantedRoles(acl), []);
});

test("grantedRoles: upsert_incident_atomic's worse pre-fix shape (PUBLIC grant itself, plus anon/authenticated)", () => {
  const acl = "{=X/supabase_admin,supabase_admin=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin}";
  assert.deepEqual(grantedRoles(acl), ["public", "anon", "authenticated"]);
});

test("grantedRoles: a non-EXECUTE privilege on anon/authenticated (not applicable to functions, but must not false-positive) is ignored", () => {
  assert.deepEqual(grantedRoles("{anon=r/supabase_admin}"), []);
});

test("rowsFromPsqlOutput: parses multiple lines, skips blanks", () => {
  const output = [
    "archive_stale_repair_runs|integer|{supabase_admin=X/supabase_admin,service_role=X/supabase_admin}",
    "",
    "secret_put|text, text|{supabase_admin=X/supabase_admin,service_role=X/supabase_admin}",
    "",
  ].join("\n");
  const rows = rowsFromPsqlOutput(output);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].proname, "archive_stale_repair_runs");
  assert.equal(rows[1].proname, "secret_put");
});

test("decideViolations: flags a function whose live proacl grants anon/authenticated, unless allowlisted", () => {
  const rows = [
    { proname: "archive_stale_repair_runs", args: "integer", acl: "{supabase_admin=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin}" },
    { proname: "secret_put", args: "text, text", acl: "{supabase_admin=X/supabase_admin,service_role=X/supabase_admin}" },
  ];
  const violations = decideViolations(rows, {});
  assert.deepEqual(violations, [{ key: "public.archive_stale_repair_runs(integer)", roles: ["anon", "authenticated"] }]);
});

test("decideViolations: an allowlisted key is never reported even if its proacl grants anon/authenticated", () => {
  const rows = [{ proname: "intentionally_public_fn", args: "text", acl: "{anon=X/supabase_admin,authenticated=X/supabase_admin}" }];
  const violations = decideViolations(rows, { "public.intentionally_public_fn(text)": "reason: deliberately callable by any signed-in user" });
  assert.deepEqual(violations, []);
});

test("decideViolations: normalizes the args column's psql spacing (\"text, text\" and \"text,text\" are the same key)", () => {
  const rows = [{ proname: "secret_put", args: "text, text", acl: "{anon=X/supabase_admin}" }];
  const violations = decideViolations(rows, { "public.secret_put(text,text)": "reason" });
  assert.deepEqual(violations, []);
});

test("decideViolations: a NULL proacl (never explicitly granted/revoked) is treated as a violation, fail-closed", () => {
  const rows = [{ proname: "brand_new_fn", args: "text", acl: "" }];
  const violations = decideViolations(rows, {});
  assert.deepEqual(violations, [{ key: "public.brand_new_fn(text)", roles: ["anon", "authenticated"] }]);
});

test("decideViolations: zero-arg function key formatting", () => {
  const rows = [{ proname: "no_arg_fn", args: "", acl: "{supabase_admin=X/supabase_admin}" }];
  const violations = decideViolations(rows, {});
  assert.deepEqual(violations, []);
});
