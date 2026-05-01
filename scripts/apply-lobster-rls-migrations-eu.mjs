/**
 * Apply 0014 (+0016) against whichever Postgres DSN is in env (tunnel to EU).
 * Intended for clearing Studio advisor 0013_rls_disabled_in_public after backup / approval.
 *
 *   npm run apply:lobster-rls-eu
 *
 * Requires tunnel + SUPABASE_AWAREWAVE_POSTGRES_DSN (or legacy aliases).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function pickDsn() {
  return (
    process.env.SUPABASE_AWAREWAVE_POSTGRES_DSN ||
    process.env.SUPABASE_B_POSTGRES_DSN ||
    process.env.SUPABASE_POSTGRES_MCP_DSN ||
    ""
  );
}

const files = [
  "lobster-factory/packages/db/migrations/0014_enable_public_table_rls.sql",
  "lobster-factory/packages/db/migrations/0016_ops_console_and_permission_catalog_rls_policies.sql",
];

const dsn = pickDsn();
if (!dsn) {
  console.error(
    "apply-lobster-rls-migrations-eu: set SUPABASE_AWAREWAVE_POSTGRES_DSN (or legacy SUPABASE_B_POSTGRES_DSN / SUPABASE_POSTGRES_MCP_DSN).",
  );
  process.exit(2);
}

const { default: postgres } = await import("postgres");
const sql = postgres(dsn, {
  max: 1,
  idle_timeout: 2,
  connect_timeout: 90,
  ssl: false,
  prepare: false,
});

try {
  for (const rel of files) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) {
      console.error("Missing file:", full);
      process.exit(2);
    }
    console.log("Applying:", rel);
    const body = fs.readFileSync(full, "utf8");
    await sql.unsafe(body);
    console.log("OK:", rel);
  }
} catch (e) {
  const msg = e?.message ?? String(e);
  console.error("FAILED:", msg);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}

console.log("Done. Verify: npm run smoke:supabase-rls-advisor");
