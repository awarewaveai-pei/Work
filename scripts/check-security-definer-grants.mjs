#!/usr/bin/env node
/**
 * Live check: does any public SECURITY DEFINER function currently grant EXECUTE to anon,
 * authenticated, or PUBLIC on the running Supabase instance -- the exact regression 0064 fixed
 * (Supabase's ALTER DEFAULT PRIVILEGES re-grants both on every fresh CREATE FUNCTION / DROP+CREATE
 * cycle). lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/db/__tests__/
 * security-definer-grants.test.ts statically proves the *migration history* is correct; this proves
 * the *live database* actually matches it (a migration can be correct on paper and still not be the
 * one that ran, or a manual `psql` session could have changed grants out of band).
 *
 * Transport is injectable so the parser/decision logic is unit-testable without SSH (see
 * scripts/__tests__/check-security-definer-grants.test.mjs -- fixture rows only, never run against
 * production from a test). Default mirrors scripts/apply-db-migration.mjs's transport:
 *   ssh -p 58122 ubuntu@145.239.195.47 "sudo -n docker exec -i supabase-db psql -U supabase_admin -d postgres -tA"
 * with the query piped via stdin. Override with --psql-cmd "<command>" or CHECK_SECDEF_PSQL_CMD.
 *
 *   node scripts/check-security-definer-grants.mjs                  # live check; exit 1 if any violation
 *   node scripts/check-security-definer-grants.mjs --psql-cmd "..."
 *
 * Shares its allowlist file with the static test (lobster-factory/packages/db/
 * security-definer-allowlist.json) -- one canonical list of intentionally-callable-by-anon/
 * authenticated functions, not duplicated between the two checks.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST_FILE = path.join(ROOT, "lobster-factory/packages/db/security-definer-allowlist.json");

const DEFAULT_PSQL_CMD =
  'ssh -p 58122 ubuntu@145.239.195.47 "sudo -n docker exec -i supabase-db psql -U supabase_admin -d postgres -tA"';

const QUERY =
  "select p.proname, pg_get_function_identity_arguments(p.oid), p.proacl::text " +
  "from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
  "where n.nspname = 'public' and p.prosecdef = true order by p.proname;";

/** One line of `psql -tA` output ("name|args|acl") -> a row, or null for a blank/unparseable line.
 * Postgres's ACL text form never itself contains "|", so a naive 3-way split is sufficient; the
 * rejoin on any 4th+ part is a safety net, not something real output is expected to trigger. */
export function parseProaclLine(line) {
  const parts = line.split("|");
  if (parts.length < 3) return null;
  const [proname, args, ...aclParts] = parts;
  return { proname: proname.trim(), args: args.trim(), acl: aclParts.join("|").trim() };
}

/**
 * Parses a Postgres ACL array's text form ("{grantee=priv/grantor,...}") into entries. An empty
 * grantee before "=" means PUBLIC. Returns [] for a null/empty proacl -- pg_proc.proacl is NULL
 * until the first explicit GRANT/REVOKE touches a function (the implicit ALTER DEFAULT PRIVILEGES
 * grant is not itself recorded as a row until something forces Postgres to materialize it), so a
 * freshly-created, NEVER-revoked SECURITY DEFINER function can show proacl IS NULL while still
 * being wide open by default. This function alone cannot distinguish "never touched, still open"
 * from "explicitly revoked, no longer open" in that NULL case -- see decideViolations' comment.
 */
export function parseAcl(acl) {
  const body = (acl ?? "").replace(/^\{/, "").replace(/\}$/, "").trim();
  if (!body) return [];
  return body.split(",").map((entry) => {
    const eq = entry.indexOf("=");
    const grantee = entry.slice(0, eq).trim() || "public";
    const rest = entry.slice(eq + 1);
    const slash = rest.indexOf("/");
    const privileges = (slash === -1 ? rest : rest.slice(0, slash)).trim();
    return { grantee, privileges };
  });
}

/** Which of anon / authenticated / public currently hold EXECUTE ("X") on this ACL. */
export function grantedRoles(acl) {
  return parseAcl(acl)
    .filter((e) => e.privileges.includes("X") && (e.grantee === "anon" || e.grantee === "authenticated" || e.grantee === "public"))
    .map((e) => e.grantee);
}

function normalizeKey(proname, args) {
  const types = args
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .join(",");
  return `public.${proname}(${types})`;
}

/**
 * `rows` from rowsFromPsqlOutput; `allowlist` the shared JSON's parsed object. A NULL proacl
 * (see parseAcl's comment) is treated as a violation, not skipped: a SECURITY DEFINER function
 * live query returns ONLY prosecdef=true rows, and one that has never had a GRANT/REVOKE applied
 * still carries Supabase's default anon/authenticated EXECUTE grant even though pg_proc.proacl
 * shows NULL for it -- reporting it is the fail-closed choice; a silent skip would be exactly the
 * kind of "detector that sees nothing" this whole task exists to avoid.
 */
export function decideViolations(rows, allowlist) {
  const violations = [];
  for (const row of rows) {
    const key = normalizeKey(row.proname, row.args);
    if (allowlist[key]) continue;
    const roles = row.acl ? grantedRoles(row.acl) : ["anon", "authenticated"];
    if (roles.length > 0) violations.push({ key, roles });
  }
  return violations;
}

export function rowsFromPsqlOutput(output) {
  return output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseProaclLine)
    .filter((r) => r !== null);
}

function runPsql(psqlCmd, sql) {
  const r = spawnSync("bash", ["-c", psqlCmd], { input: sql, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`psql command failed (exit ${r.status}): ${(r.stderr || r.stdout || "").slice(0, 2000)}`);
  }
  return r.stdout;
}

function main() {
  const argv = process.argv.slice(2);
  const flagIdx = argv.indexOf("--psql-cmd");
  const psqlCmd = flagIdx !== -1 ? argv[flagIdx + 1] : process.env.CHECK_SECDEF_PSQL_CMD || DEFAULT_PSQL_CMD;

  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, "utf8"));
  const output = runPsql(psqlCmd, QUERY);
  const rows = rowsFromPsqlOutput(output);
  const violations = decideViolations(rows, allowlist);

  if (violations.length === 0) {
    console.log(`OK: ${rows.length} public SECURITY DEFINER function(s) checked, none grant EXECUTE to anon/authenticated/PUBLIC.`);
    process.exit(0);
  }

  console.error(`${violations.length} SECURITY DEFINER function(s) grant EXECUTE to anon/authenticated/PUBLIC:`);
  for (const v of violations) console.error(`  - ${v.key}: granted to ${v.roles.join(", ")}`);
  console.error(
    "Fix: REVOKE ALL ON FUNCTION ... FROM anon, authenticated (see packages/db/migrations/0064 for the pattern), " +
      "or allowlist with a one-line reason in packages/db/security-definer-allowlist.json.",
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
