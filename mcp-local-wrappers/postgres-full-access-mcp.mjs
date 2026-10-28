#!/usr/bin/env node
/**
 * Postgres MCP — full SQL (SELECT / DDL / DML), autocommit per statement.
 *
 * Replaces @modelcontextprotocol/server-postgres for this monorepo: upstream runs
 * every query inside READ ONLY and cannot apply migrations or fix RLS from MCP.
 *
 * DSN resolution matches scripts/run-postgres-mcp.ps1.
 * Optional: POSTGRES_MCP_READ_ONLY=true → BEGIN READ ONLY + ROLLBACK (legacy behavior).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import pg from "pg";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function readEnv(name, fallback = "") {
  const value = process.env[name];
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  return t || fallback;
}

function resolveDsn() {
  const candidates = [
    readEnv("SUPABASE_AWAREWAVE_POSTGRES_DSN"),
    readEnv("SUPABASE_B_POSTGRES_DSN"),
    readEnv("SUPABASE_POSTGRES_MCP_DSN"),
  ].filter(Boolean);
  if (candidates.length === 0) {
    throw new Error(
      "Set SUPABASE_AWAREWAVE_POSTGRES_DSN (or SUPABASE_B_POSTGRES_DSN / SUPABASE_POSTGRES_MCP_DSN)",
    );
  }
  return candidates[0];
}

const readonly =
  String(process.env.POSTGRES_MCP_READ_ONLY || "")
    .trim()
    .toLowerCase() === "true" ||
  String(process.env.POSTGRES_MCP_READ_ONLY || "").trim() === "1";

const dsn = resolveDsn();
const pool = new pg.Pool({
  connectionString: dsn,
  max: 4,
});

// A loopback DSN is the SSH tunnel to ks-aw-01 (scripts/open-supabase-ssh-tunnel.ps1). Nothing else keeps it open and
// laptop sleep drops it, so a refused connect opens it (Postgres port only) and retries once.
// The script forwards each port to the same port on the host, where Postgres listens on 5432.
const dsnUrl = new URL(dsn);
const tunnelled =
  process.platform === "win32" &&
  ["127.0.0.1", "localhost"].includes(dsnUrl.hostname) &&
  (dsnUrl.port || "5432") === "5432";
const TUNNEL_SCRIPT = fileURLToPath(new URL("../scripts/open-supabase-ssh-tunnel.ps1", import.meta.url));
let tunnelOpening = null;

function openTunnel() {
  tunnelOpening ??= new Promise((resolve) => {
    let output = "";
    // Wait for "exit", not "close": the detached ssh it starts can inherit the pipes and hold them open.
    const child = spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", TUNNEL_SCRIPT, "-Background", "-Ports", "5432"],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", (e) => resolve({ ok: false, output: String(e) }));
    child.on("exit", (code) => resolve({ ok: code === 0, output }));
  }).finally(() => {
    tunnelOpening = null;
  });
  return tunnelOpening;
}

async function connect() {
  try {
    return await pool.connect();
  } catch (err) {
    if (!tunnelled || err?.code !== "ECONNREFUSED") throw err;
    const tunnel = await openTunnel();
    try {
      return await pool.connect();
    } catch (retryErr) {
      // A failed open can mean another process won the race for 5432; only the retry tells, so report both.
      if (tunnel.ok) throw retryErr;
      throw new Error(`${retryErr.message}; opening the SSH tunnel failed: ${tunnel.output.trim().slice(-800)}`);
    }
  }
}

const server = new Server(
  {
    name: "postgres-full-access",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {} },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "query",
      description: readonly
        ? "Run a read-only SQL query (READ ONLY transaction; same as legacy server-postgres)."
        : "Execute SQL against Postgres (SELECT, DDL, DML). Uses autocommit per statement. Destructive changes are possible — use staging first.",
      inputSchema: {
        type: "object",
        properties: {
          sql: {
            type: "string",
            description: "Single SQL statement (avoid chaining multiple statements).",
          },
        },
        required: ["sql"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "query") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }
  const sql = String(request.params.arguments?.sql ?? "").trim();
  if (!sql) {
    return {
      content: [{ type: "text", text: "Error: empty sql" }],
      isError: true,
    };
  }

  const client = await connect();
  try {
    if (readonly) {
      await client.query("BEGIN TRANSACTION READ ONLY");
      const result = await client.query(sql);
      await client.query("ROLLBACK");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { rows: result.rows, rowCount: result.rowCount, command: result.command },
              null,
              2,
            ),
          },
        ],
        isError: false,
      };
    }

    const result = await client.query(sql);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              rows: result.rows,
              rowCount: result.rowCount,
              command: result.command,
              fields: result.fields?.map((f) => f.name),
            },
            null,
            2,
          ),
        },
      ],
      isError: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  } finally {
    client.release();
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
