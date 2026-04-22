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

app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>node-api — Aware Wave</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:40px 48px;max-width:480px;width:100%;box-shadow:0 25px 50px -12px rgba(0,0,0,.5)}
.badge{display:inline-flex;align-items:center;gap:6px;background:#166534;color:#bbf7d0;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;margin-bottom:24px}
.dot{width:7px;height:7px;border-radius:50%;background:#22c55e}
h1{font-size:22px;font-weight:700;color:#f1f5f9;margin-bottom:8px}
p{font-size:14px;color:#94a3b8;line-height:1.6;margin-bottom:24px}
.endpoints{display:flex;flex-direction:column;gap:8px}
.ep{display:flex;align-items:center;justify-content:space-between;background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:10px 14px;text-decoration:none;color:#94a3b8;font-size:13px;transition:border-color .15s,color .15s}
.ep:hover{border-color:#6366f1;color:#e2e8f0}
.ep-path{font-family:monospace;font-size:13px;color:#818cf8}
.ep-arrow{color:#475569}
.footer{margin-top:24px;font-size:11px;color:#475569;text-align:center}
</style>
</head>
<body>
<div class="card">
  <div class="badge"><span class="dot"></span> Online</div>
  <h1>node-api</h1>
  <p>Aware Wave API server. This endpoint is not meant for direct browser use.</p>
  <div class="endpoints">
    <a href="/health" class="ep"><span class="ep-path">GET /health</span><span class="ep-arrow">›</span></a>
    <a href="/rag/health" class="ep"><span class="ep-path">GET /rag/health</span><span class="ep-arrow">›</span></a>
    <a href="/rag/supabase-health" class="ep"><span class="ep-path">GET /rag/supabase-health</span><span class="ep-arrow">›</span></a>
  </div>
  <div class="footer">api.aware-wave.com</div>
</div>
</body>
</html>`);
});

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
