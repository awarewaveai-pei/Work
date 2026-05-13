/**
 * Apply the Repair Center data model against the AwareWave EU Supabase Postgres.
 *
 *   npm run apply:repair-center-eu
 *
 * Requires tunnel + SUPABASE_AWAREWAVE_POSTGRES_DSN (or legacy aliases).
 * This migration is additive and creates the repair_runs state table used by
 * app.aware-wave.com/ops/repairs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

loadDotenv(path.join(root, ".env.local"));
loadDotenv(path.join(root, ".env"));

function loadDotenv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function pickDsn() {
  return (
    process.env.SUPABASE_AWAREWAVE_POSTGRES_DSN ||
    process.env.SUPABASE_B_POSTGRES_DSN ||
    process.env.SUPABASE_POSTGRES_MCP_DSN ||
    ""
  );
}

const file = "lobster-factory/packages/db/migrations/0027_repair_runs.sql";
const dsn = pickDsn();

if (!dsn) {
  console.error(
    "apply-repair-center-migration-eu: set SUPABASE_AWAREWAVE_POSTGRES_DSN (or legacy SUPABASE_B_POSTGRES_DSN / SUPABASE_POSTGRES_MCP_DSN).",
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
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.error("Missing file:", full);
    process.exit(2);
  }

  console.log("Applying:", file);
  await sql.unsafe(fs.readFileSync(full, "utf8"));
  console.log("OK:", file);

  console.log("Reloading PostgREST schema cache...");
  await sql.unsafe("NOTIFY pgrst, 'reload schema';");
  console.log("OK: schema cache reload requested");
} catch (e) {
  const msg = e?.message ?? String(e);
  console.error("FAILED:", msg);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}

console.log("Done. Verify: npm run smoke:repair-center");
