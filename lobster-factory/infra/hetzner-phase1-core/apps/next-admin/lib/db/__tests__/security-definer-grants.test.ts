// T22: every public SECURITY DEFINER function's anon/authenticated EXECUTE stays revoked as of
// the latest migration that touches it. See lib/db/security-definer-grants.ts's header for the
// exact latest-definition rule and why it credits a LATER migration that revokes without
// redefining (0064 fixes archive_stale_repair_runs/upsert_incident_atomic exactly this way).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { liveSecurityDefinerFunctions, redact, scanSecurityDefinerFunctions, type MigrationFile } from "../security-definer-grants";

// __tests__ -> db -> lib -> next-admin -> apps -> hetzner-phase1-core -> infra -> lobster-factory.
// Shared with scripts/check-security-definer-grants.mjs (the live checker) -- one canonical file,
// not duplicated: relative path here verified with `realpath --relative-to`.
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../../../../packages/db/migrations");
const ALLOWLIST_FILE = path.resolve(__dirname, "../../../../../../../packages/db/security-definer-allowlist.json");
const ALLOWLIST: Record<string, string> = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, "utf8"));

function realMigrationFiles(): MigrationFile[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort()
    .map((file) => ({ file, text: fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8") }));
}

describe("SECURITY DEFINER functions cannot silently regain anon/authenticated EXECUTE", () => {
  it("sanity: the migrations directory resolves and has a realistic number of files", () => {
    const files = realMigrationFiles();
    expect(files.length).toBeGreaterThan(50);
  });

  it("every live SECURITY DEFINER function has anon+authenticated revoked, or is allowlisted with a reason", () => {
    const functions = liveSecurityDefinerFunctions(realMigrationFiles());
    const violations: string[] = [];
    for (const fn of functions) {
      if (fn.anonRevoked && fn.authenticatedRevoked) continue;
      if (ALLOWLIST[fn.key]) continue;
      violations.push(
        `${fn.key} (latest definition: ${fn.definingFile}) -- anonRevoked=${fn.anonRevoked} authenticatedRevoked=${fn.authenticatedRevoked}`,
      );
    }
    if (violations.length > 0) {
      throw new Error(
        `${violations.length} SECURITY DEFINER function(s) do not have anon/authenticated EXECUTE fully revoked:\n` +
          violations.map((v) => `  - ${v}`).join("\n") +
          `\nFix: add a REVOKE ... FROM anon, authenticated in the migration that (re)defines it (or a ` +
          `later one, see the module header), or add a one-line-justified entry to security-definer-allowlist.json.`,
      );
    }
    expect(violations).toEqual([]);
  });

  it("mutation control: a real migration copy in a temp dir with one REVOKE line deleted is flagged; the unmodified original is not", () => {
    const real = fs.readFileSync(path.join(MIGRATIONS_DIR, "0064_lockdown_security_definer_anon_grants.sql"), "utf8");
    const revokeLine = "revoke all on function public.archive_stale_repair_runs(int) from anon, authenticated;";
    expect(real, "fixture assumption broken: 0064 no longer contains this exact line").toContain(revokeLine);
    const mutated = real.replace(`${revokeLine}\n`, "");
    expect(mutated).not.toEqual(real);

    const tmpDir = mkdtempSync(path.join(tmpdir(), "secdef-mutation-"));
    try {
      writeFileSync(path.join(tmpDir, "0064_lockdown_security_definer_anon_grants.sql"), mutated, "utf8");

      const mutatedFiles = realMigrationFiles().map((f) =>
        f.file === "0064_lockdown_security_definer_anon_grants.sql" ? { file: f.file, text: mutated } : f,
      );
      const archiveAfterMutation = liveSecurityDefinerFunctions(mutatedFiles).find((f) => f.name === "archive_stale_repair_runs");
      expect(archiveAfterMutation?.anonRevoked && archiveAfterMutation?.authenticatedRevoked, "deleting the revoke line should have re-opened it").toBe(false);

      const archiveUnmodified = liveSecurityDefinerFunctions(realMigrationFiles()).find((f) => f.name === "archive_stale_repair_runs");
      expect(archiveUnmodified?.anonRevoked && archiveUnmodified?.authenticatedRevoked, "the real, unmodified migration tree must still pass").toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("reports which functions it found and which are allowlisted (informational -- always passes)", () => {
    const functions = liveSecurityDefinerFunctions(realMigrationFiles());
    const report = functions
      .map((fn) => `${fn.key}: ${ALLOWLIST[fn.key] ? "allowlisted" : "locked down"} (defined in ${fn.definingFile})`)
      .sort();
    // eslint-disable-next-line no-console
    console.log(`[T22] ${functions.length} live SECURITY DEFINER function(s):\n${report.map((l) => `  ${l}`).join("\n")}`);
    expect(functions.length).toBeGreaterThan(0);
  });

  it("every allowlist entry is still needed (function exists, is still SECURITY DEFINER, and is still missing a revoke)", () => {
    const functions = new Map(liveSecurityDefinerFunctions(realMigrationFiles()).map((fn) => [fn.key, fn]));
    for (const [key, reason] of Object.entries(ALLOWLIST)) {
      expect(typeof reason === "string" && reason.length > 0, `${key}: allowlist reason must be a non-empty string`).toBe(true);
      const fn = functions.get(key);
      expect(fn, `stale ALLOWLIST entry (no longer a live SECURITY DEFINER function): ${key}`).toBeDefined();
      expect(
        fn!.anonRevoked && fn!.authenticatedRevoked,
        `unneeded ALLOWLIST entry (already fully revoked): ${key}`,
      ).toBe(false);
    }
  });
});

describe("parser robustness (synthetic fixtures, not the real tree)", () => {
  const files = (...texts: string[]): MigrationFile[] => texts.map((text, i) => ({ file: `000${i}_x.sql`, text }));

  it("CREATE ... SECURITY DEFINER with no revoke at all -> not locked down", () => {
    const fns = liveSecurityDefinerFunctions(
      files(`create or replace function public.f(a int) returns int language sql security definer as $$ select a; $$;`),
    );
    expect(fns).toHaveLength(1);
    expect(fns[0]).toMatchObject({ anonRevoked: false, authenticatedRevoked: false });
  });

  it("CREATE ... SECURITY DEFINER + a same-migration revoke from anon, authenticated -> locked down", () => {
    const fns = liveSecurityDefinerFunctions(
      files(
        `create or replace function public.f(a int) returns int language sql security definer as $$ select a; $$;\n` +
          `revoke all on function public.f(int) from public;\n` +
          `revoke all on function public.f(int) from anon, authenticated;`,
      ),
    );
    expect(fns[0]).toMatchObject({ anonRevoked: true, authenticatedRevoked: true });
  });

  it("a LATER migration (no redefinition) that revokes still locks it down -- the archive_stale_repair_runs/upsert_incident_atomic shape (0032 defines, 0064 revokes)", () => {
    const fns = liveSecurityDefinerFunctions(
      files(
        `create or replace function public.f(a int) returns int language sql security definer as $$ select a; $$;`,
        `revoke all on function public.f(int) from public;`,
        `revoke all on function public.f(int) from anon, authenticated;`,
      ),
    );
    expect(fns[0]).toMatchObject({ anonRevoked: true, authenticatedRevoked: true, definingFile: "0000_x.sql" });
  });

  it("positive control: a later DROP+CREATE that omits the revoke re-opens it", () => {
    const fns = liveSecurityDefinerFunctions(
      files(
        `create or replace function public.f(a int) returns int language sql security definer as $$ select a; $$;`,
        `revoke all on function public.f(int) from public, anon, authenticated;`,
        `drop function if exists public.f(int);\n` +
          `create or replace function public.f(a int) returns int language sql security definer as $$ select a * 2; $$;`,
      ),
    );
    expect(fns[0]).toMatchObject({ anonRevoked: false, authenticatedRevoked: false, definingFile: "0002_x.sql" });
  });

  it("CREATE OR REPLACE (no DROP) of an already-locked-down function keeps grants -- judged per the latest-definition rule: Postgres never resets ACLs on REPLACE, only a fresh object (no prior CREATE, or one preceded by DROP) gets Supabase's default anon/authenticated grant, so a plain REPLACE inherits whatever the signature already had", () => {
    const fns = liveSecurityDefinerFunctions(
      files(
        `create or replace function public.f(a int) returns int language sql security definer as $$ select a; $$;`,
        `revoke all on function public.f(int) from public, anon, authenticated;`,
        `create or replace function public.f(a int) returns int language sql security definer as $$ select a + 1; $$;`,
      ),
    );
    expect(fns[0]).toMatchObject({ anonRevoked: true, authenticatedRevoked: true, definingFile: "0002_x.sql" });
  });

  it("a later GRANT EXECUTE to authenticated re-opens a locked-down function; a grant to service_role does not", () => {
    const base = [
      `create or replace function public.f(a int) returns int language sql security definer as $$ select a; $$;`,
      `revoke all on function public.f(int) from public, anon, authenticated;`,
    ];
    const reopened = liveSecurityDefinerFunctions(files(...base, `grant execute on function public.f(integer) to authenticated;`));
    expect(reopened[0]).toMatchObject({ anonRevoked: true, authenticatedRevoked: false });
    const internal = liveSecurityDefinerFunctions(files(...base, `grant execute on function public.f(int) to service_role with grant option;`));
    expect(internal[0]).toMatchObject({ anonRevoked: true, authenticatedRevoked: true });
  });

  it("GRANT ... TO PUBLIC and GRANT ... ON ALL FUNCTIONS IN SCHEMA re-open both roles", () => {
    const base = [
      `create or replace function public.f(a int) returns int language sql security definer as $$ select a; $$;`,
      `revoke all on function public.f(int) from public, anon, authenticated;`,
    ];
    const pub = liveSecurityDefinerFunctions(files(...base, `grant all privileges on function public.f(int) to public;`));
    expect(pub[0]).toMatchObject({ anonRevoked: false, authenticatedRevoked: false });
    const schemaWide = liveSecurityDefinerFunctions(files(...base, `grant execute on all functions in schema public to anon;`));
    expect(schemaWide[0]).toMatchObject({ anonRevoked: false, authenticatedRevoked: true });
  });

  it("DROP with no later CREATE removes the signature from the live checklist entirely", () => {
    const fns = liveSecurityDefinerFunctions(
      files(
        `create or replace function public.f(a int) returns int language sql security definer as $$ select a; $$;`,
        `drop function if exists public.f(int);`,
      ),
    );
    expect(fns).toHaveLength(0);
  });

  it("SECURITY INVOKER (the default) is never flagged, even with zero revokes", () => {
    const fns = liveSecurityDefinerFunctions(
      files(`create or replace function public.f(a int) returns int language sql as $$ select a; $$;`),
    );
    expect(fns).toHaveLength(0);
  });

  it("a comment mentioning \"security definer\" as prose does not count -- must be an actual CREATE ... SECURITY DEFINER clause (the 0082 shape: a comment explains why the function is deliberately INVOKER)", () => {
    const fns = liveSecurityDefinerFunctions(
      files(
        `-- SECURITY DEFINER would be needed only if a non-service_role caller had to invoke this\n` +
          `create or replace function public.f(a int) returns int language plpgsql as $$ begin return a; end; $$;`,
      ),
    );
    expect(fns).toHaveLength(0);
  });

  it("overloads by argument list: two different signatures of the same name are tracked separately", () => {
    const fns = liveSecurityDefinerFunctions(
      files(
        `create or replace function public.f(a int) returns int language sql security definer as $$ select a; $$;\n` +
          `revoke all on function public.f(int) from public, anon, authenticated;\n` +
          `create or replace function public.f(a int, b int) returns int language sql security definer as $$ select a+b; $$;`,
      ),
    );
    expect(fns).toHaveLength(2);
    const oneArg = fns.find((f) => f.argTypes.length === 1)!;
    const twoArg = fns.find((f) => f.argTypes.length === 2)!;
    expect(oneArg).toMatchObject({ anonRevoked: true, authenticatedRevoked: true });
    expect(twoArg).toMatchObject({ anonRevoked: false, authenticatedRevoked: false });
  });

  it("int/integer synonyms match between a named CREATE parameter and a bare REVOKE argument", () => {
    const fns = liveSecurityDefinerFunctions(
      files(
        `create or replace function public.f(retention_days int default 90) returns int language plpgsql security definer as $$ begin return 1; end; $$;\n` +
          `revoke all on function public.f(integer) from public, anon, authenticated;`,
      ),
    );
    expect(fns[0]).toMatchObject({ anonRevoked: true, authenticatedRevoked: true });
  });

  it("dollar-quoted body text that looks like a CREATE/REVOKE statement is never matched", () => {
    const fns = liveSecurityDefinerFunctions(
      files(
        `create or replace function public.f() returns text language plpgsql security definer as $$\n` +
          `begin\n` +
          `  -- this string must never be parsed as a real statement:\n` +
          `  return 'revoke all on function public.g() from anon, authenticated; create or replace function public.g() ...';\n` +
          `end;\n` +
          `$$;\n` +
          `revoke all on function public.f() from public, anon, authenticated;`,
      ),
    );
    expect(fns).toHaveLength(1);
    expect(fns[0].name).toBe("f");
  });

  it("redact() blanks comments, strings, and dollar bodies to same-length whitespace (offsets preserved)", () => {
    const sql = `select 1; -- a comment\nselect 'it''s here';\ndo $$ begin null; end $$;`;
    const r = redact(sql);
    expect(r.length).toBe(sql.length);
    expect(r).not.toMatch(/comment|it's here|begin null/);
    expect(r.startsWith("select 1;")).toBe(true);
  });

  it("scanSecurityDefinerFunctions also exposes non-definer / non-existent entries for callers that want the full picture", () => {
    const all = scanSecurityDefinerFunctions(
      files(
        `create or replace function public.f(a int) returns int language sql security definer as $$ select a; $$;`,
        `drop function if exists public.f(int);`,
      ),
    );
    expect(all.get("public.f(integer)")).toMatchObject({ exists: false });
  });
});
