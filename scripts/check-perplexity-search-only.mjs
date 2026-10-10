#!/usr/bin/env node
// Perplexity may only ever be called on the Search API (POST /search).
// Per-token chat/agent endpoints drained the account on 2026-06-21 and 2026-09-12
// (WORKLOG 2026-09-19 續78/續79). This scans every tracked file so a new call site,
// SDK, template, or plugin cannot slip back in unnoticed.
//
// Usage: node scripts/check-perplexity-search-only.mjs [--self-test]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SELF = "scripts/check-perplexity-search-only.mjs";
const PROVIDERS = "lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/providers.ts";
const PROVIDER_TEST = "lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-provider-tier.test.ts";
const CLI = "scripts/perplexity-cli.ps1";

// The only files allowed to name the API host — each exactly once, and each enforces /search itself.
const HOST_ALLOWED = new Set([PROVIDERS, PROVIDER_TEST, CLI]);

// The only files allowed to read the key. Any new caller (SDK, env base URL, split host string) must read it.
const KEY_READER_ALLOWED = new Set([
  CLI,
  PROVIDER_TEST,
  "lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/collectors/web-search.ts",
  "lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-web-search-live.test.ts",
]);

// Prose that names the plugin only to say it is not installed.
const LLM_PLUGIN_PROSE_ALLOWED = new Set(["scripts/ensure-agent-bootstrap-prompts.ps1"]);

const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|zip|lock|woff2?|ttf|mp4|mp3|wav)$/i;
// Markdown is documentation, except where agents read it as instructions.
const AGENT_MD = /^(\.claude|\.agents|\.codex)\/|(^|\/)SKILL\.md$/;
// Append-only agent records quote reviews verbatim: data, never a call site. Scripts under these roots are still scanned.
const RECORD_DATA = /^agency-os\/(reports|handoffs|memory)\/.+\.(jsonl|json|txt|log|csv)$/i;

const HOST = /api\.perplexity\.ai/gi;
const SDK_OR_GATEWAY = /@ai-sdk\/perplexity|@perplexity-ai\/|\bperplexityai\b|ChatPerplexity|createPerplexity|["']perplexity\/|PERPLEXITY_BASE_URL|server-perplexity|perplexity-ask|mcp\/perplexity|perplexity-mcp/i;
const KEY_READER = /(process\.env|\benv|environ|getenv|\$env:|GetEnvironmentVariable\()[^A-Za-z0-9]{0,4}PERPLEXITY_API_KEY/g;
// A plain assignment or `delete` only sets/clears the variable (a test's fake key): no call without HOST or SDK,
// which are checked separately. `??=`, `||=`, `===` read it, so they stay readers.
const KEY_WRITE_AFTER = /^\s*(?:["']\s*)?(?:\]\s*)?=(?!=)/;
const KEY_DELETE_BEFORE = /\bdelete\s+$/;

export function readsKey(text) {
  for (const m of text.matchAll(KEY_READER)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
    const before = text.slice(Math.max(0, m.index - 8), m.index);
    if (!KEY_WRITE_AFTER.test(after) && !KEY_DELETE_BEFORE.test(before)) return true;
  }
  return false;
}

export function skipped(file) {
  if (file === SELF || SKIP_EXT.test(file)) return true;
  if (/\.mdx?$/i.test(file) && !AGENT_MD.test(file)) return true;
  if (RECORD_DATA.test(file)) return true;
  return false;
}

export function scanText(file, text) {
  const out = [];
  if (skipped(file)) return out;

  const hostHits = text.match(HOST)?.length ?? 0;
  if (hostHits && !HOST_ALLOWED.has(file)) {
    out.push(`${file}: names api.perplexity.ai outside the guarded exits (providers.ts, perplexity-cli.ps1)`);
  }
  if (HOST_ALLOWED.has(file) && hostHits > 1) {
    out.push(`${file}: names api.perplexity.ai ${hostHits} times — a second, unguarded call site`);
  }
  if (file === PROVIDER_TEST && /api\.perplexity\.ai(?!\/search\b)/i.test(text)) {
    out.push(`${file}: may only reference api.perplexity.ai/search`);
  }
  const sdk = SDK_OR_GATEWAY.exec(text);
  if (sdk) out.push(`${file}: uses a Perplexity SDK / gateway / MCP package ("${sdk[0]}")`);
  if (readsKey(text) && !KEY_READER_ALLOWED.has(file)) {
    out.push(`${file}: reads PERPLEXITY_API_KEY outside the guarded exits`);
  }
  if (/llm-perplexity/i.test(text) && !LLM_PLUGIN_PROSE_ALLOWED.has(file)) {
    out.push(`${file}: references the llm-perplexity plugin (direct access to sonar/agent models)`);
  }
  return out;
}

export function checkInvariants(read) {
  const out = [];
  const providers = read(PROVIDERS) ?? "";
  const perplexityBlock = /perplexity:\s*\{[^}]*\}/s.exec(providers)?.[0] ?? "";
  if (!/allowedPaths:\s*\[\s*["']\/search["']\s*\]/.test(perplexityBlock)) {
    out.push('providers.ts: perplexity provider must declare allowedPaths: ["/search"]');
  }
  if (!/spec\.allowedPaths && !spec\.allowedPaths\.includes\(url\.pathname\)/.test(providers)) {
    out.push("providers.ts: createProviderCall no longer enforces allowedPaths");
  }

  const cli = read(CLI) ?? "";
  if (!/\$AllowedPath\s*=\s*"\/search"/.test(cli)) out.push('perplexity-cli.ps1: $AllowedPath must be "/search"');
  if (!/if \(\$Path -ne \$AllowedPath\)/.test(cli)) out.push("perplexity-cli.ps1: Invoke-PerplexitySearch no longer refuses other paths");

  let deny = [];
  try {
    deny = JSON.parse(read("mcp/claude-userlevel/settings.template.json") ?? "{}")?.permissions?.deny ?? [];
  } catch {
    out.push("settings.template.json: not valid JSON");
  }
  for (const t of ["perplexity_ask", "perplexity_reason", "perplexity_research"]) {
    if (!deny.includes(`mcp__perplexity__${t}`)) out.push(`settings.template.json: permissions.deny must contain mcp__perplexity__${t}`);
  }
  return out;
}

// Bytes -> text with zero bytes dropped, so UTF-16 files (PowerShell 5.1 default) are scanned too.
function decode(buf) {
  return buf.indexOf(0) === -1 ? buf.toString("utf8") : Buffer.from(buf.filter((b) => b !== 0)).toString("latin1");
}

function selfTest() {
  const cases = [
    ["app/x.ts", "fetch('https://api.perplexity.ai/v1/agent')", 1],
    ["app/y.ts", "import { perplexity } from '@ai-sdk/perplexity'", 1],
    ["app/z.py", 'completion(model="perplexity/sonar-pro")', 1],
    ["app/w.ts", "new OpenAI({ baseURL: process.env.PERPLEXITY_BASE_URL })", 1],
    ["app/v.ts", 'const k = process.env["PERPLEXITY_API_KEY"]', 1],
    ["mcp.json.template", '"args": ["-y", "@perplexity-ai/mcp-server"]', 1],
    ["requirements.txt", "llm-perplexity==2026.2.1", 1],
    [".claude/commands/research.md", "curl https://api.perplexity.ai/chat/completions", 1],
    [CLI, 'Uri "https://api.perplexity.ai/search"; Uri "https://api.perplexity.ai/v1/responses"', 1],
    [PROVIDER_TEST, 'expect(hit).toEqual(["https://api.perplexity.ai/chat/completions"])', 1],
    ["docs/notes.md", "https://api.perplexity.ai/chat/completions", 0],
    [CLI, 'Uri ("https://api.perplexity.ai" + $Path); GetEnvironmentVariable("PERPLEXITY_API_KEY", "User")', 0],
    ["scripts/ensure-agent-bootstrap-prompts.ps1", "the llm-perplexity plugin is intentionally not installed", 0],
    ["agency-os/reports/agent-dispatch/d.jsonl", '{"result_snippet":"a literal `api.perplexity.ai` in a file"}', 0],
    ["agency-os/reports/agent-dispatch/d.ps1", "Invoke-RestMethod https://api.perplexity.ai/chat/completions", 1],
    ["agency-os/memory/x.mjs", "fetch('https://api.perplexity.ai/v1/agent')", 1],
    ["agency-os/config/x.json", '{"url":"https://api.perplexity.ai/chat/completions"}', 1],
    ["app/t.test.ts", 'process.env.PERPLEXITY_API_KEY = "test-perplexity"', 0],
    ["app/t.test.ts", "delete process.env.PERPLEXITY_API_KEY", 0],
    ["app/t.py", 'os.environ["PERPLEXITY_API_KEY"] = "x"', 0],
    ["app/t.ps1", '$env:PERPLEXITY_API_KEY = "x"', 0],
    ["app/u.ts", 'process.env.PERPLEXITY_API_KEY = "x"; const k = process.env.PERPLEXITY_API_KEY', 1],
    ["app/u.ts", 'if (process.env.PERPLEXITY_API_KEY === undefined) {}', 1],
    ["app/u.ts", 'process.env.PERPLEXITY_API_KEY ??= "x"', 1],
    ["app/u.py", 'k = os.environ["PERPLEXITY_API_KEY"]', 1],
  ];
  let bad = 0;
  for (const [f, t, want] of cases) {
    const got = scanText(f, t).length;
    if (got !== want) { console.error(`self-test FAIL ${f} [${t.slice(0, 50)}]: want ${want} got ${got}`); bad++; }
  }
  const utf16 = decode(Buffer.from("x = 'https://api.perplexity.ai/chat'", "utf16le"));
  if (!scanText("tools/a.ps1", utf16).length) { console.error("self-test FAIL: UTF-16 file not scanned"); bad++; }
  if (checkInvariants(() => "{}").length < 5) { console.error("self-test FAIL: invariants did not fire on empty input"); bad++; }
  if (bad) process.exit(1);
  console.log(`self-test ok (${cases.length} scan cases + UTF-16 + invariants)`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const read = (rel) => {
    try { return decode(fs.readFileSync(path.join(root, rel))); } catch { return null; }
  };
  const violations = [];
  for (const f of files) {
    if (skipped(f)) continue;
    const text = read(f);
    if (text !== null) violations.push(...scanText(f, text));
  }
  violations.push(...checkInvariants(read));
  if (violations.length) {
    console.error("Perplexity Search-only guard FAILED:\n  - " + violations.join("\n  - "));
    process.exit(1);
  }
  console.log(`Perplexity Search-only guard ok (${files.length} tracked files)`);
}

main();
