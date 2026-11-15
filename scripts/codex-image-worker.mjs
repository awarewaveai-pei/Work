#!/usr/bin/env node
// Codex image worker -- runs on the operator's laptop, draws the app's "Codex 免費生圖" pictures with her own Codex
// login (ChatGPT plan allowance, no API key, no per-image bill). Server side: lib/tarot/codex-bridge.ts in next-admin.
//
//   node scripts/codex-image-worker.mjs            # loop until Ctrl+C
//   node scripts/codex-image-worker.mjs --once     # one claim (smoke test)
//
// Env: CODEX_WORKER_SECRET (required, same value as the app's), CODEX_WORKER_BASE (default https://app.aware-wave.com).
// The laptop only dials out; nothing listens here. One picture at a time (Codex took 47-83 s each, 2026-11-14).
// Codex runs read-only, with no MCP servers, in a fresh temp folder per job. Not --ephemeral: the plan-quota figures
// (rate_limits) are only in Codex's own session record, so the worker reads them from it and then deletes that record.
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BASE = (process.env.CODEX_WORKER_BASE || "https://app.aware-wave.com").replace(/\/+$/, "");
const SECRET = process.env.CODEX_WORKER_SECRET?.trim();
const ONCE = process.argv.includes("--once");
const CODEX_TIMEOUT_MS = 5 * 60_000;
const GENERATED = path.join(homedir(), ".codex", "generated_images");
// npm global install of @openai/codex (Windows: %APPDATA%\npm); elsewhere `codex` is a real executable on PATH.
const CODEX_JS = process.platform === "win32" && process.env.APPDATA
  ? path.join(process.env.APPDATA, "npm", "node_modules", "@openai", "codex", "bin", "codex.js") : null;
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function api(route, body, timeoutMs) {
  const res = await fetch(`${BASE}/api/internal/codex-images/${route}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const ORIENTATION = { "1:1": "square", "2:3": "portrait", "3:4": "portrait", "4:5": "portrait", "9:16": "portrait",
  "3:2": "landscape", "4:3": "landscape", "16:9": "landscape" };

export function buildPrompt(job) {
  const refs = job.refs.length
    ? `The ${job.refs.length} attached image(s) are references: follow them as the description says (edit target, style, or subject).\n`
    : "";
  return [
    "Use the built-in image_gen tool to generate exactly ONE image.",
    `Aspect ratio ${job.aspectRatio} (${ORIENTATION[job.aspectRatio] ?? "portrait"}), highest available resolution.`,
    refs + "Do not run shell commands and do not call any MCP tools.",
    "When it is generated, reply with only the saved file path.",
    "",
    "Image description:",
    job.prompt,
  ].join("\n");
}

/** stdout/stderr text → a short error code the app shows; quota first, so a spent allowance is never retried. */
export function errorCode(text) {
  if (/usage limit|rate limit|try again at|quota|credits/i.test(text)) return "codex_quota_exhausted";
  if (/not logged in|login|unauthorized|401/i.test(text)) return "codex_not_logged_in";
  return "codex_exec_failed";
}

function runCodex(prompt, imageFiles, cwd, timeoutMs) {
  const args = ["exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", "-c", "mcp_servers={}",
    "-o", "last.txt", ...imageFiles.flatMap((f) => ["-i", f]), "-"];
  return new Promise((resolve) => {
    // No shell: on Windows the codex.cmd shim would need one, so run the npm package's own entry with this node.
    const child = CODEX_JS ? spawn(process.execPath, [CODEX_JS, ...args], { cwd }) : spawn("codex", args, { cwd });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    const stop = () => process.platform === "win32" && child.pid
      ? spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
      : child.kill();
    const timer = setTimeout(stop, timeoutMs);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, out }); });
    child.stdin.end(prompt);
  });
}

const SESSIONS = path.join(homedir(), ".codex", "sessions");

/** Tokens from the run's turn.completed event, plan quota % from its session record (deleted afterwards). Never throws:
 *  the picture matters more than its bookkeeping. */
export async function usageOf(jsonl) {
  const usage = {};
  let thread = null;
  const events = (text) => text.split(/\r?\n/).flatMap((line) => {
    if (!line.startsWith("{")) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  for (const e of events(jsonl)) {
    if (e.type === "thread.started") thread = e.thread_id;
    if (e.type === "turn.completed" && e.usage) {
      usage.codex_input_tokens = e.usage.input_tokens;
      usage.codex_cached_input_tokens = e.usage.cached_input_tokens;
      usage.codex_output_tokens = e.usage.output_tokens;
    }
  }
  if (!thread || !/^[0-9a-f-]{36}$/.test(thread)) return usage;
  try {
    const files = (await readdir(SESSIONS, { recursive: true })).filter((f) => f.endsWith(`${thread}.jsonl`));
    for (const f of files) {
      const full = path.join(SESSIONS, f);
      // The last event_msg carrying rate_limits holds the figures after this picture (Codex 0.165, read 2026-11-15).
      const last = events(await readFile(full, "utf8")).map((e) => e.payload?.rate_limits).filter(Boolean).pop();
      if (last?.primary) { usage.codex_5h_used_pct = last.primary.used_percent; usage.codex_5h_resets_at = last.primary.resets_at; }
      if (last?.secondary) { usage.codex_week_used_pct = last.secondary.used_percent; usage.codex_week_resets_at = last.secondary.resets_at; }
      await rm(full, { force: true });
    }
  } catch { /* no record: tokens only */ }
  return usage;
}

async function draw(job) {
  const dir = await mkdtemp(path.join(tmpdir(), "codex-img-"));
  try {
    const files = [];
    for (const [i, ref] of job.refs.entries()) {
      const f = path.join(dir, `reference-${i}.${EXT[ref.mime] ?? "png"}`);
      await writeFile(f, Buffer.from(ref.b64, "base64"));
      files.push(f);
    }
    // Stop when the app stops waiting for this picture (timeLeftMs): drawing on would only spend the plan's allowance.
    const timeoutMs = Math.min(CODEX_TIMEOUT_MS, Number.isFinite(job.timeLeftMs) ? Math.max(job.timeLeftMs, 0) : CODEX_TIMEOUT_MS);
    const { code, out } = await runCodex(buildPrompt(job), files, dir, timeoutMs);
    const last = (await readFile(path.join(dir, "last.txt"), "utf8").catch(() => "")).trim();
    if (code !== 0) return { error: errorCode(out) };
    // Only a picture Codex itself saved under ~/.codex/generated_images is sent: the reply is text from a model.
    const file = path.resolve(last.split(/\r?\n/).pop() ?? "");
    if (!file.startsWith(GENERATED + path.sep) || !/\.(png|jpe?g|webp)$/i.test(file)) return { error: "codex_empty_output" };
    const mime = /\.png$/i.test(file) ? "image/png" : /\.webp$/i.test(file) ? "image/webp" : "image/jpeg";
    return { image: `data:${mime};base64,${(await readFile(file)).toString("base64")}`, usage: await usageOf(out) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  if (!SECRET) { console.error("CODEX_WORKER_SECRET 沒設定（請先載入 mcp/user-env.ps1）"); process.exit(2); }
  log(`Codex 生圖工人啟動，連線 ${BASE}`);
  for (;;) {
    let claim;
    try {
      claim = await api("claim", { waitMs: 25_000 }, 40_000);
    } catch (e) {
      log("連不上主機，10 秒後重試：", String(e).slice(0, 120));
      if (ONCE) process.exit(1);
      await new Promise((r) => setTimeout(r, 10_000));
      continue;
    }
    if (claim.status === 401) { console.error("密鑰不對（401），停止"); process.exit(2); }
    const job = claim.json?.job;
    if (job) {
      const started = Date.now();
      log(`領到工作 ${job.id.slice(0, 8)}（${job.aspectRatio}，參考圖 ${job.refs.length} 張）`);
      const result = await draw(job).catch((e) => ({ error: "codex_exec_failed", detail: String(e) }));
      const done = await api("complete", { id: job.id, ...result }, 60_000).catch((e) => ({ status: 0, json: { error: String(e) } }));
      const q = result.usage?.codex_5h_used_pct;
      log(result.image ? "完成" : `失敗 ${result.error}`, `${Math.round((Date.now() - started) / 1000)} 秒，回報 ${done.status}`,
        q === undefined ? "" : `，Codex 5 小時額度已用 ${q}%、本週 ${result.usage.codex_week_used_pct}%`);
      if (result.error === "codex_quota_exhausted") { console.error("Codex 額度用完，停止（不改用付費 credits）"); process.exit(3); }
    }
    if (ONCE) return;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
