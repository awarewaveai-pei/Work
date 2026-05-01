/**
 * Apply Splinter-oriented fixes (Performance Advisor): auth_rls_initplan + duplicate indexes.
 *
 * SQL SSOT: lobster-factory/packages/db/scripts/apply-splinter-fixes-one-shot.sql
 *
 *   npm run apply:supabase-splinter-fixes
 *
 * Requires (EU typical): SSH tunnel so localhost:5432 reaches Postgres, and one of:
 *   SUPABASE_AWAREWAVE_POSTGRES_DSN | SUPABASE_B_POSTGRES_DSN | SUPABASE_POSTGRES_MCP_DSN
 *
 * Important: `CREATE OR REPLACE FUNCTION` must run as the **function owner** or a **superuser**.
 * Pooler roles such as `postgres.<POOLER_TENANT_ID>` often cannot replace objects owned by
 * `postgres` / `supabase_admin`. For this script, prefer a DSN that connects as DB owner
 * (direct `postgresql://postgres:...@127.0.0.1:5432/postgres` through the tunnel when allowed).
 *
 * Optional: dotenv loads repo-root `.env` if present (no secrets committed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

try {
  const envPath = path.join(root, ".env");
  if (fs.existsSync(envPath)) {
    const dotenv = await import("dotenv");
    dotenv.config({ path: envPath });
  }
} catch {
  // optional
}

function pickDsn() {
  return (
    process.env.SUPABASE_SPLINTER_FIX_DSN ||
    process.env.SUPABASE_AWAREWAVE_POSTGRES_DSN ||
    process.env.SUPABASE_B_POSTGRES_DSN ||
    process.env.SUPABASE_POSTGRES_MCP_DSN ||
    ""
  );
}

const sqlPath = path.join(
  root,
  "lobster-factory/packages/db/scripts/apply-splinter-fixes-one-shot.sql",
);

const dsn = pickDsn();
if (!dsn) {
  console.error(
    "apply-supabase-splinter-fixes: set SUPABASE_SPLINTER_FIX_DSN (recommended: supabase_admin) or SUPABASE_AWAREWAVE_POSTGRES_DSN / legacy aliases.",
  );
  console.error("Open tunnel first: .\\scripts\\open-supabase-ssh-tunnel.ps1 -Background");
  process.exit(2);
}

if (!fs.existsSync(sqlPath)) {
  console.error("Missing SQL file:", sqlPath);
  process.exit(2);
}

const body = fs.readFileSync(sqlPath, "utf8");

const { default: postgres } = await import("postgres");
const sql = postgres(dsn, {
  max: 1,
  idle_timeout: 2,
  connect_timeout: 120,
  ssl: false,
  prepare: false,
});

/** Mirrors Splinter 0003 policy-text checks on pg_policies (public). */
async function countAuthRlsInitplanViolations() {
  const rows = await sql`
    select count(*)::int as c
    from pg_policies p
    where p.schemaname = 'public'
      and (
        (
          p.qual is not null
          and p.qual like '%auth.uid()%'
          and lower(p.qual) not like '%select auth.uid()%'
        )
        or (
          p.qual is not null
          and p.qual like '%auth.jwt()%'
          and lower(p.qual) not like '%select auth.jwt()%'
        )
        or (
          p.with_check is not null
          and p.with_check like '%auth.uid()%'
          and lower(p.with_check) not like '%select auth.uid()%'
        )
        or (
          p.with_check is not null
          and p.with_check like '%auth.jwt()%'
          and lower(p.with_check) not like '%select auth.jwt()%'
        )
      )
  `;
  return rows[0]?.c ?? -1;
}

/** Splinter 0009-style duplicate btree indexes on public.workflow_runs (same def minus name). */
async function countWorkflowRunsDuplicateIndexGroups() {
  const rows = await sql`
    with defs as (
      select indexname, replace(indexdef, indexname, '') as def_norm
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'workflow_runs'
        and indexname is not null
    ),
    g as (
      select def_norm, count(*)::int as cnt
      from defs
      group by def_norm
      having count(*) > 1
    )
    select coalesce(sum(cnt - 1), 0)::int as extra_indexes
    from g
  `;
  return rows[0]?.extra_indexes ?? -1;
}

async function preflightOwnership() {
  const cu = await sql.unsafe(
    "select current_user::text as cu, session_user::text as su",
  );
  const superRows = await sql.unsafe(
    "select rolsuper as is_super from pg_roles where rolname::text = session_user::text limit 1",
  );
  const isSuper = Boolean(superRows[0]?.is_super);

  const ownerRows = await sql.unsafe(`
    select pg_get_userbyid(p.proowner)::text as fn_owner
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'current_clerk_org_id_from_jwt'
      and p.prokind = 'f'
    limit 1
  `);
  const fnOwner = ownerRows[0]?.fn_owner ?? null;
  const cuName = cu[0]?.cu ?? "";

  if (!fnOwner) {
    console.warn(
      "Preflight: function public.current_clerk_org_id_from_jwt not found — applying may CREATE new objects; continuing.",
    );
    return;
  }

  if (!isSuper && fnOwner !== cuName) {
    console.error(
      `Preflight FAIL: connected as "${cuName}" but function owner is "${fnOwner}" (not superuser).`,
    );
    console.error(
      "Self-hosted Supabase: objects are often owned by supabase_admin — use SUPABASE_SPLINTER_FIX_DSN=postgresql://supabase_admin:<POSTGRES_PASSWORD>@127.0.0.1:5432/postgres (password from VPS /root/supabase/.env; never commit).",
    );
    console.error(
      "See agency-os/docs/operations/SUPABASE_SELF_HOSTED_RUNBOOK.md §3.4 / §3.3. Or paste apply-splinter-fixes-one-shot.sql in Studio SQL Editor.",
    );
    process.exit(3);
  }
}

try {
  await preflightOwnership();
  console.log("Applying:", path.relative(root, sqlPath));
  await sql.unsafe(body);
  console.log("Apply finished OK.");

  const badPolicies = await countAuthRlsInitplanViolations();
  const dupExtras = await countWorkflowRunsDuplicateIndexGroups();
  console.log(
    "Post-check (expect 0 / 0): auth_rls_initplan-style policy rows =",
    badPolicies,
    "; workflow_runs redundant duplicate indexes (extras) =",
    dupExtras,
  );
  if (badPolicies !== 0 || dupExtras !== 0) {
    console.error(
      "Post-check non-zero: refresh Studio Performance Advisor; run lobster-factory/packages/db/scripts/diag-splinter-auth-rls-initplan.sql if needed.",
    );
    process.exit(1);
  }
} catch (e) {
  const msg = e?.message ?? String(e);
  console.error("FAILED:", msg);
  if (/ECONNREFUSED|timeout/i.test(msg)) {
    console.error("Hint: start SSH tunnel: .\\scripts\\open-supabase-ssh-tunnel.ps1 -Background");
  }
  if (/must be owner/i.test(msg)) {
    console.error(
      "Hint: switch DSN to DB owner / superuser (often postgres direct, not postgres.<tenant> pooler). Or paste apply-splinter-fixes-one-shot.sql in Studio SQL Editor.",
    );
  }
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}

console.log("Done. Refresh Supabase Studio → Database → Performance Advisor.");
