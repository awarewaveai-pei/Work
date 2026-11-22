#!/usr/bin/env node
// Codex image worker -- runs on the operator's laptop, draws the app's "Codex 免費生圖" pictures with her own Codex
// login (ChatGPT plan allowance, no API key, no per-image bill). Server side: lib/tarot/codex-bridge.ts in next-admin.
//
//   node scripts/codex-image-worker.mjs            # loop until Ctrl+C
//   node scripts/codex-image-worker.mjs --once     # one claim (smoke test)
//   node scripts/codex-image-worker.mjs --idle-min 0   # never stop on its own (default: stop after 30 idle minutes)
//
// Started on demand from the app's 「啟動筆電」 button (awarewave-codex:// link, registered once by
// scripts/codex-image-worker-install.ps1): nothing runs while no pictures are wanted. Only one copy runs at a time.
//
// Env: CODEX_WORKER_SECRET (required, same value as the app's), CODEX_WORKER_BASE (default https://app.aware-wave.com).
// The laptop only dials out; nothing listens here. One picture at a time (Codex took 47-83 s each, 2026-11-14).
// Codex runs read-only, with no MCP servers, in a fresh temp folder per job. Not --ephemeral: the plan-quota figures
// (rate_limits) are only in Codex's own session record, so the worker reads them from it and then deletes that record.
//
// Text jobs (kind "text", AI subscription channel, agency-os/handoffs/2026-11-22-subscription-ai-channel/PLAN.md): the
// Codex or Claude CLI with every tool off answers system+prompt (stdin / a temp file, never the command line); the
// answer is dropped as sub_output_blocked if it contains any credential string of this machine (PLAN I3, I4).
//   node scripts/codex-image-worker.mjs --lane schedule   # host daemon: SUB_WORKER_HOST_SECRET, no lock, never idles out
// The lane the app serves is decided by which secret it accepts (PLAN I2); --lane only picks the secret and the tools offered.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Command-line flags → settings. Without new flags this is the laptop image worker of before (owner, lock, 30 idle min). */
export function parseArgs(argv) {
  const value = (flag) => { const i = argv.indexOf(flag); return i > 0 ? argv[i + 1] : undefined; };
  const lane = value("--lane") ?? "owner";
  const idle = value("--idle-min");
  return {
    lane,
    once: argv.includes("--once"),
    idleMs: (idle !== undefined ? Number(idle) : lane === "schedule" ? 0 : 30) * 60_000,
    useLock: lane === "owner",
  };
}

const BASE = (process.env.CODEX_WORKER_BASE || "https://app.aware-wave.com").replace(/\/+$/, "");
const ARGS = parseArgs(process.argv);
const { lane: LANE, once: ONCE, idleMs: IDLE_MS } = ARGS;

/** A browser-launched worker inherits the browser's environment, which predates mcp/user-env.ps1 persisting the secret:
 *  fall back to the user's stored environment (HKCU\Environment) on Windows. The schedule lane is a host daemon: its own
 *  secret from its own environment only. */
function readSecret() {
  if (LANE === "schedule") return process.env.SUB_WORKER_HOST_SECRET?.trim();
  const fromEnv = process.env.CODEX_WORKER_SECRET?.trim();
  if (fromEnv || process.platform !== "win32") return fromEnv;
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", "CODEX_WORKER_SECRET"], { encoding: "utf8", windowsHide: true });
    return out.match(/CODEX_WORKER_SECRET\s+REG_\w+\s+(\S+)/)?.[1];
  } catch { return undefined; }
}
const SECRET = readSecret();
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

/** No shell: on Windows the codex.cmd shim would need one, so run the npm package's own entry with this node. */
function codexCommand(args) {
  return CODEX_JS ? { cmd: process.execPath, args: [CODEX_JS, ...args] } : { cmd: "codex", args };
}

/** One CLI run: input on stdin, stdout+stderr collected (each also alone), the whole process tree killed at timeoutMs
 *  (then timedOut is true). */
function runCli({ cmd, args, env }, input, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env });
    let out = "", stdout = "", stderr = "", timedOut = false;
    child.on("error", (e) => { out += String(e); stderr += String(e); });
    child.stdout.on("data", (d) => { out += d; stdout += d; });
    child.stderr.on("data", (d) => { out += d; stderr += d; });
    const stop = () => {
      timedOut = true;
      return process.platform === "win32" && child.pid
        ? spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
        : child.kill();
    };
    const timer = setTimeout(stop, timeoutMs);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, out, stdout, stderr, timedOut }); });
    child.stdin.on("error", () => { /* child gone before reading stdin: its exit code tells */ });
    child.stdin.end(input);
  });
}

function runCodex(prompt, imageFiles, cwd, timeoutMs) {
  const args = ["exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", "-c", "mcp_servers={}",
    "-o", "last.txt", ...imageFiles.flatMap((f) => ["-i", f]), "-"];
  return runCli(codexCommand(args), prompt, cwd, timeoutMs);
}

const SESSIONS = path.join(homedir(), ".codex", "sessions");

/** Tokens from the run's turn.completed event, plan quota % from its session record (deleted afterwards). Never throws:
 *  the picture matters more than its bookkeeping. */
const jsonEvents = (text) => text.split(/\r?\n/).flatMap((line) => {
  if (!line.startsWith("{")) return [];
  try { return [JSON.parse(line)]; } catch { return []; }
});

export async function usageOf(jsonl, sessions = SESSIONS) {
  const usage = {};
  let thread = null;
  const events = jsonEvents;
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
    const files = (await readdir(sessions, { recursive: true })).filter((f) => f.endsWith(`${thread}.jsonl`));
    for (const f of files) {
      const full = path.join(sessions, f);
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
    // Stop at the job's lease (timeLeftMs, codex-bridge.ts RUN_LEASE_MS): after it the app has given the picture up, so
    // drawing on would only spend the plan's allowance. An older app sent its caller's remaining wait here; same meaning.
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

// ---- Text jobs (subscription channel) ------------------------------------------------------------------------------

const TEXT_TIMEOUT_MS = 5 * 60_000;
// Every Codex feature that lets the model act (codex features list, 0.165). The sandbox stays read-only besides.
const CODEX_TEXT_FEATURES_OFF = ["shell_tool", "unified_exec", "browser_use", "computer_use", "apps", "plugins",
  "image_generation", "view_image", "hooks", "multi_agent", "skill_mcp_dependency_install"];

/** Codex home for text jobs: a clean one of its own, so the user's hooks.json, AGENTS.md, skills and config.toml never load
 *  (PLAN I3). Logged in once with `CODEX_HOME=<it> codex login`; never a copy of ~/.codex/auth.json (rotating refresh tokens
 *  would void each other). The host's schedule worker runs as its own user, whose default home is already clean. */
export function subCodexHome(lane, env = process.env, home = homedir()) {
  if (env.SUB_CODEX_HOME) return env.SUB_CODEX_HOME;
  return lane === "schedule" ? env.CODEX_HOME || path.join(home, ".codex") : path.join(home, ".codex-sub");
}
// An API key in the CLI's environment bills the API instead of the plan; the worker secrets are not the CLI's business.
const CHILD_ENV_DROP = new Set(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "CODEX_API_KEY",
  "CODEX_WORKER_SECRET", "SUB_WORKER_HOST_SECRET"]);
const DEFAULT_SYSTEM = "You are a careful writer. Answer the request.";

export function childEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !CHILD_ENV_DROP.has(k.toUpperCase())));
}

/** Codex exec has no system-prompt flag: both go on stdin, instructions first, behind a plain divider. */
const codexInput = (job) => (job.system
  ? `${job.system}\n\n===== END OF INSTRUCTIONS. THE REQUEST FOLLOWS. =====\n\n${job.prompt}` : job.prompt);

/** The CLI run for a text job, every tool off (PLAN I3). System and prompt never go on the command line: Claude reads the
 *  system prompt from systemFile (`--system-prompt-file`, accepted by Claude Code 2.1.312 though not in --help). */
export function textCommand(job, systemFile, env = process.env, codexHome = subCodexHome(LANE, env)) {
  if (job.tool === "claude") {
    const args = ["-p", ...(job.cliModel ? ["--model", job.cliModel] : []), "--system-prompt-file", systemFile,
      "--tools", "", "--setting-sources", "", "--strict-mcp-config", "--disable-slash-commands",
      "--no-session-persistence", "--output-format", "json"];
    return { cmd: "claude", args, env: childEnv(env), input: job.prompt };
  }
  if (job.tool === "codex") {
    const args = ["exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", "-c", "mcp_servers={}",
      ...CODEX_TEXT_FEATURES_OFF.flatMap((f) => ["--disable", f]), "-o", "last.txt",
      ...(job.cliModel ? ["-m", job.cliModel] : []), "-"];
    return { ...codexCommand(args), env: { ...childEnv(env), CODEX_HOME: codexHome }, input: codexInput(job) };
  }
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "try again at Nov 24th, 2026 11:02 AM" (Codex, this machine's local time) → epoch ms; undefined when not parseable. */
export function parseResetsAt(text) {
  const m = /try again at\s+([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*([ap]m)?/i.exec(text);
  const month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  if (month < 0) return undefined;
  let hour = Number(m[4]) % (m[6] ? 12 : 24);
  if (m[6]?.toLowerCase() === "pm") hour += 12;
  const at = new Date(Number(m[3]), month, Number(m[2]), hour, Number(m[5])).getTime();
  return Number.isFinite(at) ? at : undefined;
}

/** The CLI's own error message of a failed text run → wire error (PLAN §3); quota first, so a spent allowance is never
 *  retried. Only ever given CLI error text, never model output: an article about "credits" must not block a tool. */
export function textError(text) {
  if (/usage limit|rate limit|hit your limit|limit reached|try again at|quota|credits/i.test(text)) {
    const quotaResetsAt = parseResetsAt(text);
    return quotaResetsAt ? { error: "sub_quota_exhausted", quotaResetsAt } : { error: "sub_quota_exhausted" };
  }
  if (/not logged in|login|unauthorized|oauth token|\b401\b/i.test(text)) return { error: "sub_not_logged_in" };
  return { error: "sub_exec_failed" };
}

/** Codex --json stream → the messages of its `error` and `turn.failed` events (not agent messages). */
function codexErrorText(stdout) {
  return jsonEvents(stdout).flatMap((e) => (e.type === "error" ? [e.message] : e.type === "turn.failed" ? [e.error?.message] : []))
    .filter((m) => typeof m === "string").join("\n");
}

/** True when the text contains any of the secrets (PLAN I4). */
export function leaks(text, secrets) {
  return secrets.some((s) => typeof s === "string" && s.length > 0 && text.includes(s));
}

/** Every credential string on this machine, read fresh per job (tokens refresh): the CLIs' login files (string values
 *  of 20+ characters), the worker secrets, and environment values of 16+ characters under a KEY/TOKEN/SECRET/PASSWORD name. */
export async function collectSecrets(env = process.env, home = homedir(), codexHome = subCodexHome(LANE, env, home)) {
  const found = new Set(SECRET ? [SECRET] : []);
  const walk = (v) => {
    if (typeof v === "string") { if (v.length >= 20) found.add(v); }
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  const files = [path.join(codexHome, "auth.json"), path.join(home, ".codex", "auth.json"), path.join(home, ".claude", ".credentials.json")];
  for (const f of new Set(files)) {
    try { walk(JSON.parse(await readFile(f, "utf8"))); } catch { /* that CLI is not logged in here */ }
  }
  for (const [k, v] of Object.entries(env)) {
    const value = v?.trim();
    if (!value) continue;
    if (/^(CODEX_WORKER_SECRET|SUB_WORKER_HOST_SECRET)$/i.test(k) || (/KEY|TOKEN|SECRET|PASSWORD/i.test(k) && value.length >= 16)) found.add(value);
  }
  return [...found];
}

/** Claude `--output-format json` → its result object, or null. */
function claudeResult(stdout) {
  const line = stdout.trim().split(/\r?\n/).filter((l) => l.startsWith("{")).pop();
  try { return line ? JSON.parse(line) : null; } catch { return null; }
}

/** One text job → { text, usage, answeredModel } or { error, quotaResetsAt? }. `run`/`secrets`/`codexHome` are swappable
 *  for tests. */
export async function write(job, { run = runCli, secrets = collectSecrets, codexHome = subCodexHome(LANE) } = {}) {
  if (job.tool === "codex" && !existsSync(path.join(codexHome, "auth.json"))) return { error: "sub_not_logged_in" };
  const dir = await mkdtemp(path.join(tmpdir(), "sub-text-"));
  const systemFile = `${dir}.system.txt`; // beside the empty working folder, not in it
  let codexOut = null;
  try {
    const command = textCommand(job, systemFile, process.env, codexHome);
    if (!command) return { error: "sub_exec_failed" };
    if (job.tool === "claude") await writeFile(systemFile, job.system || DEFAULT_SYSTEM, "utf8");
    const timeoutMs = Math.min(TEXT_TIMEOUT_MS, Number.isFinite(job.timeLeftMs) ? Math.max(job.timeLeftMs, 0) : TEXT_TIMEOUT_MS);
    const { code, stdout, stderr, timedOut } = await run(command, command.input, dir, timeoutMs);
    if (job.tool === "codex") codexOut = stdout;
    // Killed by this worker: whatever the model wrote so far says nothing about quota or login.
    if (timedOut) return { error: "sub_worker_timeout" };
    let answer;
    if (job.tool === "claude") {
      const r = claudeResult(stdout);
      if (code !== 0 || !r || r.is_error || r.subtype !== "success") {
        return textError(`${r?.is_error ? String(r.result ?? "") : ""}\n${stderr}`);
      }
      const usage = {};
      for (const k of ["input_tokens", "output_tokens"]) if (Number.isFinite(r.usage?.[k])) usage[k] = r.usage[k];
      const [answeredModel] = Object.entries(r.modelUsage ?? {})
        .sort(([, a], [, b]) => (b?.outputTokens ?? 0) - (a?.outputTokens ?? 0)).map(([name]) => name);
      answer = { text: String(r.result ?? ""), usage, answeredModel };
    } else {
      if (code !== 0) return textError(`${codexErrorText(stdout)}\n${stderr}`);
      const usage = await usageOf(stdout, path.join(codexHome, "sessions"));
      codexOut = null; // usageOf deleted the session record
      answer = { text: await readFile(path.join(dir, "last.txt"), "utf8").catch(() => ""), usage };
    }
    answer.text = answer.text.trim();
    if (!answer.text) return { error: "sub_empty_output" };
    if (leaks(answer.text, await secrets())) return { error: "sub_output_blocked" };
    return answer;
  } finally {
    // A failed or killed Codex run still left its session record (the prompt) on disk.
    if (codexOut !== null) await usageOf(codexOut, path.join(codexHome, "sessions")).catch(() => {});
    await rm(dir, { recursive: true, force: true });
    await rm(systemFile, { force: true });
  }
}

/** Claim body: both lanes offer exactly the CLIs this machine can run (contract change 2026-11-22: the schedule lane may
 *  use Claude too). Which lane is served still comes from the secret the app accepted (PLAN I2). */
export function claimBody(available) {
  return { waitMs: 25_000, tools: ["codex", "claude"].filter((t) => available[t]) };
}

const canRun = (cmd, args) => {
  try { return spawnSync(cmd, args, { stdio: "ignore", timeout: 30_000, windowsHide: true }).status === 0; } catch { return false; }
};
const detectTools = () => ({
  codex: Boolean(CODEX_JS && existsSync(CODEX_JS)) || canRun("codex", ["--version"]),
  claude: canRun("claude", ["--version"]),
});

const LOCK =path.join(process.env.LOCALAPPDATA || tmpdir(), "awarewave", "codex-image-worker.pid");

/** One worker per laptop: a second start (the button pressed twice) exits at once. A lock whose process is gone is taken over. */
function takeLock() {
  mkdirSync(path.dirname(LOCK), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(LOCK, "wx");
      writeSync(fd, String(process.pid));
      closeSync(fd);
      const release = () => { try { if (readFileSync(LOCK, "utf8") === String(process.pid)) rmSync(LOCK); } catch { /* gone */ } };
      process.on("exit", release);
      for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => process.exit(0));
      return true;
    } catch {
      let pid = 0, ageMs = Infinity;
      try { pid = Number(readFileSync(LOCK, "utf8").trim()); ageMs = Date.now() - statSync(LOCK).mtimeMs; } catch { continue; }
      // Empty = another worker is between creating the file and writing its pid: it is starting, not dead.
      if (!(pid > 0)) { if (ageMs < 10_000) return false; }
      else { try { process.kill(pid, 0); return false; } catch { /* that process is gone: stale lock */ } }
      rmSync(LOCK, { force: true });
    }
  }
  return false;
}

async function main() {
  if (LANE !== "owner" && LANE !== "schedule") { console.error(`--lane 只能是 owner 或 schedule（收到 ${LANE}）`); process.exit(2); }
  if (!SECRET) {
    console.error(LANE === "schedule" ? "SUB_WORKER_HOST_SECRET 沒設定" : "CODEX_WORKER_SECRET 沒設定（請先載入 mcp/user-env.ps1）");
    process.exit(2);
  }
  if (ARGS.useLock && !ONCE && !takeLock()) { log("已經有一個 Codex 生圖工人在跑，這個結束。"); return; }
  const claim0 = claimBody(detectTools());
  if (!claim0.tools.length) { console.error("這台機器找不到 codex 也找不到 claude CLI，工人無事可做，停止"); process.exit(2); }
  log(`Codex 生圖工人啟動（${LANE}，工具 ${claim0.tools.join("、")}），連線 ${BASE}`
    + (IDLE_MS > 0 ? `（${IDLE_MS / 60_000} 分鐘沒有工作會自己關掉）` : ""));
  let lastWorkAt = Date.now();
  let loginWarnedAt = -Infinity;
  for (;;) {
    if (!ONCE && IDLE_MS > 0 && Date.now() - lastWorkAt >= IDLE_MS) {
      // Tell the app at once; otherwise it would count this laptop online for up to 45 s more (codex-bridge workerLeft).
      await api("claim", { leaving: true }, 10_000).catch(() => {});
      log("閒置太久，自動關閉。");
      return;
    }
    let claim;
    try {
      claim = await api("claim", claim0, 40_000);
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
      lastWorkAt = started;
      const text = job.kind === "text";
      log(text ? `領到文字工作 ${job.id.slice(0, 8)}（${job.tool}${job.cliModel ? ` ${job.cliModel}` : ""}）`
        : `領到工作 ${job.id.slice(0, 8)}（${job.aspectRatio}，參考圖 ${job.refs.length} 張）`);
      // A job without `kind` comes from an app before text jobs existed: a picture.
      const result = text ? await write(job).catch(() => ({ error: "sub_exec_failed" }))
        : job.kind === undefined || job.kind === "image" ? await draw(job).catch((e) => ({ error: "codex_exec_failed", detail: String(e) }))
        : { error: "sub_exec_failed" };
      // A text failure names its tool: the app records a quota block even when the job has already expired there.
      const body = text && result.error ? { id: job.id, ...result, tool: job.tool } : { id: job.id, ...result };
      const done = await api("complete", body, 60_000).catch((e) => ({ status: 0, json: { error: String(e) } }));
      const q = result.usage?.codex_5h_used_pct;
      const tokens = result.usage?.output_tokens;
      log(result.image || result.text ? "完成" : `失敗 ${result.error}`, `${Math.round((Date.now() - started) / 1000)} 秒，回報 ${done.status}`,
        q === undefined ? "" : `，Codex 5 小時額度已用 ${q}%、本週 ${result.usage.codex_week_used_pct}%`,
        tokens === undefined ? "" : `，tokens 輸入 ${result.usage.input_tokens} 輸出 ${tokens}`);
      if (result.error === "codex_quota_exhausted") { console.error("Codex 額度用完，停止（不改用付費 credits）"); process.exit(3); }
      // Text quota is a state the app keeps until quotaResetsAt (PLAN I7): this worker stays for other tools and lanes.
      if (result.error === "sub_quota_exhausted") {
        log(`${job.tool} 訂閱額度用完` + (result.quotaResetsAt ? `，約 ${new Date(result.quotaResetsAt).toLocaleString()} 恢復` : "") + "；工人繼續等其他工作");
      }
      if (result.error === "sub_not_logged_in" && Date.now() - loginWarnedAt >= 10 * 60_000) {
        loginWarnedAt = Date.now();
        console.error(`${job.tool} 沒有登入：請在這台機器執行 ${job.tool === "claude" ? "claude（/login）" : `CODEX_HOME=${subCodexHome(LANE)} codex login`}`);
      }
      lastWorkAt = Date.now();
    }
    if (ONCE) return;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
