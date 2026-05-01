/**
 * Smoke-test local ends of EU Supabase SSH tunnels (TCP + optional SELECT 1).
 * No passwords printed. DSN comes from env only.
 *
 *   node scripts/supabase-tunnel-smoke.mjs
 *   node scripts/supabase-tunnel-smoke.mjs --sql
 */
import net from "node:net";

const ports = [
  { port: 5432, name: "Postgres" },
  { port: 3000, name: "Studio" },
  { port: 8000, name: "Kong" },
];

function probe(port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

function pickDsn() {
  return (
    process.env.SUPABASE_AWAREWAVE_POSTGRES_DSN ||
    process.env.SUPABASE_B_POSTGRES_DSN ||
    process.env.SUPABASE_POSTGRES_MCP_DSN ||
    ""
  );
}

/** Best-effort DSN username (never logs password). Fails closed on malformed URIs with @/: in passwords. */
function parseDsnUser(dsn) {
  const raw = typeof dsn === "string" ? dsn.trim() : "";
  if (!raw) return null;
  const withScheme = /^postgres(ql)?:\/\//i.test(raw) ? raw : `postgresql://${raw}`;
  try {
    const parsed = new URL(withScheme.replace(/^postgres(ql)?:/i, "http:"));
    const user = decodeURIComponent((parsed.username || "").replace(/\+/g, " "));
    return user || null;
  } catch {
    try {
      const m = /^postgres(?:ql)?:\/\/([^:@/]+)(?::[^@]*)?@/i.exec(raw);
      return m ? decodeURIComponent(m[1]) : null;
    } catch {
      return null;
    }
  }
}

function printSupavisorTenantHint(dbUser) {
  console.log("");
  console.log("Supavisor (pooler) uses tenant-scoped usernames. On EU read POOLER_TENANT_ID from /root/supabase/.env.");
  console.log("DSN user should look like:  postgres.<POOLER_TENANT_ID>");
  console.log("See agency-os/docs/operations/SUPABASE_SELF_HOSTED_RUNBOOK.md §3.3.1");
  if (dbUser) {
    console.log(`(parsed DSN username: "${dbUser}" — no password shown)`);
  }
}

async function sqlSmoke() {
  const dsn = pickDsn();
  if (!dsn) {
    console.error(
      "SQL smoke: set SUPABASE_AWAREWAVE_POSTGRES_DSN (or legacy SUPABASE_B_POSTGRES_DSN / SUPABASE_POSTGRES_MCP_DSN).",
    );
    process.exit(2);
  }
  const dbUser = parseDsnUser(dsn);
  if (dbUser === "postgres") {
    console.warn(
      'SQL smoke: DSN username is exactly "postgres". For default EU tunnel :5432 (Supavisor), use postgres.<POOLER_TENANT_ID> instead.',
    );
  }
  let postgres;
  try {
    ({ default: postgres } = await import("postgres"));
  } catch {
    console.error('SQL smoke: run "npm ci" in monorepo root (package "postgres" required for --sql).');
    process.exit(2);
  }
  const sql = postgres(dsn, { max: 1, idle_timeout: 2, connect_timeout: 10 });
  try {
    const rows = await sql`select 1::int as ok`;
    if (rows?.[0]?.ok !== 1) {
      console.error("SQL smoke: unexpected result", rows);
      process.exit(1);
    }
    console.log("SQL smoke: SELECT 1 ok");
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (/Tenant or user not found/i.test(msg)) {
      console.error("SQL smoke: FATAL — Tenant or user not found (Supavisor rejected login / tenant).");
      printSupavisorTenantHint(dbUser);
    } else {
      console.error("SQL smoke:", msg);
    }
    process.exit(1);
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

const wantSql = process.argv.includes("--sql");
let failures = 0;
for (const { port, name } of ports) {
  const ok = await probe(port);
  console.log(`${ok ? "PASS" : "FAIL"} ${name} 127.0.0.1:${port}`);
  if (!ok) failures += 1;
}

if (failures) {
  console.log("");
  console.log("Tunnel looks down. Start:");
  console.log('  powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\open-supabase-ssh-tunnel.ps1 -Background');
  console.log('If ssh stderr shows "administratively prohibited", fix EU sshd (AllowTcpForwarding / PermitOpen).');
  console.log("See agency-os/docs/operations/SUPABASE_SELF_HOSTED_RUNBOOK.md");
  process.exit(1);
}

if (wantSql) {
  await sqlSmoke();
}

process.exit(0);
