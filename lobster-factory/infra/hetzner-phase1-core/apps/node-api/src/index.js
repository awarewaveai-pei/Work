import * as Sentry from "@sentry/node";
import express from "express";
import { createClient } from "@supabase/supabase-js";

// Compose injects SENTRY_DSN; local / docs may use SENTRY_DSN_NODE_API (see hetzner-phase1-core README).
const sentryDsn = (
  process.env.SENTRY_DSN_NODE_API ||
  process.env.SENTRY_DSN ||
  ""
).trim();
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || "staging",
  });
}

function captureExceptionIfSentry(err, context) {
  if (!sentryDsn) return;
  Sentry.captureException(err, context);
}

const app = express();
const port = process.env.PORT || 3001;
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "node-api",
    port: Number(port)
  });
});

app.get("/rag/health", (_req, res) => {
  res.json({
    ok: true,
    service: "rag",
    supabaseUrl: process.env.SUPABASE_URL ? "configured" : "missing",
    openai: process.env.OPENAI_API_KEY ? "configured" : "missing"
  });
});

async function runSupabaseQueryWithSentry(operation, context) {
  if (!supabase) {
    const err = new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
    captureExceptionIfSentry(err, {
      tags: { component: "node-api", integration: "supabase" },
      extra: context,
    });
    throw err;
  }

  const result = await operation();
  if (result?.error) {
    const err = new Error(`[supabase] ${result.error.message}`);
    captureExceptionIfSentry(err, {
      tags: { component: "node-api", integration: "supabase" },
      extra: {
        ...context,
        code: result.error.code,
        details: result.error.details,
        hint: result.error.hint,
      },
    });
    throw err;
  }
  return result;
}

app.get("/rag/supabase-health", async (_req, res, next) => {
  try {
    const { data } = await runSupabaseQueryWithSentry(
      () => supabase.auth.admin.listUsers({ page: 1, perPage: 1 }),
      { route: "/rag/supabase-health", operation: "auth.admin.listUsers" }
    );

    res.json({
      ok: true,
      service: "rag",
      supabase: "reachable",
      sampledUsers: Array.isArray(data?.users) ? data.users.length : 0,
    });
  } catch (error) {
    next(error);
  }
});

if (sentryDsn) {
  Sentry.setupExpressErrorHandler(app);
}

app.use((err, _req, res, _next) => {
  res.status(500).json({
    ok: false,
    error: err instanceof Error ? err.message : "Internal server error",
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`node-api listening on ${port}`);
});
