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

const pool = new pg.Pool({
  connectionString: resolveDsn(),
  max: 4,
});

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

  const client = await pool.connect();
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
