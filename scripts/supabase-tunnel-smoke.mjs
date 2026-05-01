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

async function sqlSmoke() {
  const dsn = pickDsn();
  if (!dsn) {
    console.error(
      "SQL smoke: set SUPABASE_AWAREWAVE_POSTGRES_DSN (or legacy SUPABASE_B_POSTGRES_DSN / SUPABASE_POSTGRES_MCP_DSN).",
    );
    process.exit(2);
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
