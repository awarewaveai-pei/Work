#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import process from "node:process";

loadDotenv(path.resolve(process.cwd(), ".env.local"));
loadDotenv(path.resolve(process.cwd(), ".env"));

const root = process.cwd();
const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [k, v] = arg.split("=");
  args.set(k.replace(/^--/, ""), v ?? "true");
}

const checks = [];
function pass(name, detail = "") {
  checks.push({ ok: true, name, detail });
}
function fail(name, detail = "") {
  checks.push({ ok: false, name, detail });
}
function warn(name, detail = "") {
  checks.push({ ok: null, name, detail });
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function env(name) {
  return (process.env[name] ?? "").trim();
}

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

function envConfigured(name) {
  return Boolean(env(name));
}

function checkFile(rel, label = rel) {
  if (exists(rel)) pass(`file: ${label}`, rel);
  else fail(`file missing: ${label}`, rel);
}

function requestText(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "http:" ? http : https;
    const req = transport.request(
      parsed,
      {
        method: options.method ?? "GET",
        headers: options.headers ?? {},
        timeout: options.timeoutMs ?? 10000,
      },
      (res) => {
        const chunks = [];
        res.setEncoding("utf8");
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: chunks.join(""),
          });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`Request timed out after ${options.timeoutMs ?? 10000}ms`)));
    req.on("error", reject);
    req.end();
  });
}

async function checkHttp(baseUrl) {
  if (!baseUrl) {
    warn("http: skipped", "Set --base-url=https://app.aware-wave.com or REPAIR_CENTER_BASE_URL to check deployed endpoints.");
    return;
  }
  const base = baseUrl.replace(/\/$/, "");
  for (const route of ["/api/ops/repairs/health", "/api/ops/inbox/health"]) {
    try {
      const res = await requestText(`${base}${route}`);
      const text = res.text;
      const short = text.slice(0, 500).replace(/\s+/g, " ");
      if (res.ok) pass(`http: ${route}`, `HTTP ${res.status} ${short}`);
      else fail(`http: ${route}`, `HTTP ${res.status} ${short}`);
    } catch (e) {
      fail(`http: ${route}`, e instanceof Error ? e.message : String(e));
    }
  }
}

async function checkSupabase() {
  const url = env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    warn("db: skipped", "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for DB smoke.");
    return;
  }
  try {
    const restUrl = `${url.replace(/\/$/, "")}/rest/v1/repair_runs?select=id&limit=1`;
    const res = await requestText(restUrl, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        prefer: "count=exact",
      },
    });
    const text = res.text;
    if (res.ok) {
      pass("db: repair_runs", `HTTP ${res.status}; content-range=${res.headers["content-range"] ?? "n/a"}`);
    } else {
      fail("db: repair_runs", `HTTP ${res.status} ${text.slice(0, 500)}`);
    }
  } catch (e) {
    fail("db: repair_runs", e instanceof Error ? e.message : String(e));
  }
}

function checkEnv() {
  const hasWebhook = envConfigured("AUTO_REPAIR_BACKUP_WEBHOOK_URL");
  const hasSgSsh = envConfigured("AUTO_REPAIR_SG_SSH_HOST") && (envConfigured("AUTO_REPAIR_SG_SSH_KEY_B64") || envConfigured(env("AUTO_REPAIR_SG_SSH_KEY_ENV")));
  const euRequired = env("AUTO_REPAIR_REQUIRE_EU_BACKUP").toLowerCase() !== "false";
  const hasEuSsh = envConfigured("AUTO_REPAIR_EU_SSH_HOST") && (envConfigured("AUTO_REPAIR_EU_SSH_KEY_B64") || envConfigured(env("AUTO_REPAIR_EU_SSH_KEY_ENV")));

  if (hasWebhook) pass("env: backup gate", "webhook configured");
  else if (hasSgSsh && (!euRequired || hasEuSsh)) pass("env: backup gate", euRequired ? "SG+EU SSH configured" : "SG SSH configured; EU optional");
  else fail("env: backup gate", "configure AUTO_REPAIR_BACKUP_WEBHOOK_URL or SG/EU SSH envs");

  if (envConfigured("AUTO_REPAIR_GITHUB_TOKEN") || envConfigured("GITHUB_TOKEN")) pass("env: GitHub token", "configured");
  else fail("env: GitHub token", "AUTO_REPAIR_GITHUB_TOKEN or GITHUB_TOKEN required");

  if (envConfigured("SLACK_SIGNING_SECRET")) pass("env: Slack signing", "configured");
  else fail("env: Slack signing", "SLACK_SIGNING_SECRET required for interactive approve");

  if (envConfigured("ANTHROPIC_API_KEY")) pass("env: Anthropic", "configured");
  else warn("env: Anthropic", "ANTHROPIC_API_KEY is required by GitHub Secrets, not necessarily local runtime.");
}

async function main() {
  checkFile("lobster-factory/packages/db/migrations/0027_repair_runs.sql", "repair_runs migration");
  checkFile("lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts", "repair service");
  checkFile("lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/backup.ts", "backup gate");
  checkFile("lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/health/route.ts", "repair health route");
  checkFile("lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/commands/slack/route.ts", "Slack callback route");
  checkFile(".github/workflows/auto-repair-claude.yml", "Claude auto-repair workflow");
  checkFile(".github/workflows/auto-repair-pr-notify.yml", "PR notify workflow");

  checkEnv();
  await checkSupabase();
  await checkHttp(args.get("base-url") || env("REPAIR_CENTER_BASE_URL"));

  for (const c of checks) {
    const mark = c.ok === true ? "PASS" : c.ok === false ? "FAIL" : "WARN";
    console.log(`${mark} ${c.name}${c.detail ? ` | ${c.detail}` : ""}`);
  }

  const failed = checks.filter((c) => c.ok === false).length;
  const warned = checks.filter((c) => c.ok === null).length;
  console.log(`\nrepair-center-smoke: ${failed} failed, ${warned} warning(s), ${checks.length} checks`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
