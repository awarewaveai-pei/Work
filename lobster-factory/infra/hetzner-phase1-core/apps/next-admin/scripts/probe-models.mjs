#!/usr/bin/env node
// probe-models.mjs -- one minimal real request per active text model in lib/ai/cost-model.ts TEXT_RATES, so a
// vendor retiring an id (gemini-2.0-flash-lite, 404 since 2026-10-24, nobody noticed) fails loudly.
//
//   node scripts/probe-models.mjs                    JSON report on stdout
//   node scripts/probe-models.mjs --include-legacy   also probe legacy/retired rows (they never set the exit code)
//   node scripts/probe-models.mjs --write-verified   stamp verifiedAt=today on rows that answered (laptop only)
//   node scripts/probe-models.mjs --registry <file>  read TEXT_RATES from another copy of cost-model.ts
//
// Exit 1 = some active id AND its fallback both failed (an active id without a fallback fails alone).
// Keys come from ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY only and are never printed.
// Plain Node >= 20, no dependencies: the production image has no tsx, so the registry is read as text;
// lib/ai/__tests__/model-registry.test.ts keeps this parser equal to the TS object.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REGISTRY = path.join(HERE, "..", "lib", "ai", "cost-model.ts");
const ROW = /^\s*"([^"]+)":\s*\{(.*)\},?\s*$/;
const KEY_ENV = { Anthropic: "ANTHROPIC_API_KEY", OpenAI: "OPENAI_API_KEY", Google: "GEMINI_API_KEY" };
// Smallest output budget first; the next one only when the vendor rejects the budget itself.
const BUDGETS = [1, 16, 64];
const TIMEOUT_MS = 60_000;

/** TEXT_RATES rows as { id, vendor, status, fallback, verifiedAt }; one row per `"id": { ... },` line. */
export function parseTextRates(src) {
  const start = src.indexOf("export const TEXT_RATES");
  if (start < 0) throw new Error("TEXT_RATES not found in registry source");
  const end = src.indexOf("\n};", start);
  const rows = [];
  for (const line of src.slice(start, end).split("\n").slice(1)) {
    const m = ROW.exec(line.replace(/\r$/, ""));
    if (!m) continue;
    const field = (name) => new RegExp(`\\b${name}: "([^"]*)"`).exec(m[2])?.[1];
    rows.push({ id: m[1], vendor: field("vendor"), status: field("status"), fallback: field("fallback"), verifiedAt: field("verifiedAt") });
  }
  return rows;
}

function request(vendor, id, budget, key) {
  if (vendor === "Anthropic") {
    return ["https://api.anthropic.com/v1/messages", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: { model: id, max_tokens: budget, messages: [{ role: "user", content: "hi" }] },
    }];
  }
  if (vendor === "OpenAI" && id.startsWith("text-embedding-")) {
    return ["https://api.openai.com/v1/embeddings", { headers: { authorization: `Bearer ${key}` }, body: { model: id, input: "hi" } }];
  }
  if (vendor === "OpenAI") {
    return ["https://api.openai.com/v1/chat/completions", {
      headers: { authorization: `Bearer ${key}` },
      body: { model: id, max_completion_tokens: budget, messages: [{ role: "user", content: "hi" }] },
    }];
  }
  return [`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent`, {
    headers: { "x-goog-api-key": key },
    body: { contents: [{ parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: budget } },
  }];
}

async function probe(row) {
  const envName = KEY_ENV[row.vendor];
  const key = envName ? process.env[envName]?.trim() : "";
  const base = { id: row.id, vendor: row.vendor, status: row.status };
  if (!key) return { ...base, ok: false, http: 0, ms: 0, budget: null, error: `${envName ?? "key"} not set` };
  const t0 = Date.now();
  let last = null;
  for (const budget of BUDGETS) {
    const [url, { headers, body }] = request(row.vendor, row.id, budget, key);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await resp.text();
      last = { ...base, ok: resp.ok, http: resp.status, ms: Date.now() - t0, budget, error: resp.ok ? null : text.split(key).join("***").slice(0, 200) };
      if (resp.ok || resp.status !== 400 || !/max_tokens|max_completion_tokens|maxOutputTokens|output.{0,20}tokens/i.test(text)) return last;
    } catch (err) {
      return { ...base, ok: false, http: 0, ms: Date.now() - t0, budget, error: String(err?.message ?? err).slice(0, 200) };
    }
  }
  return last;
}

/** Active rows whose own probe and whose fallback's probe both failed. */
export function hardFailures(rows, results) {
  const byId = new Map(results.map((r) => [r.id, r]));
  return rows
    .filter((r) => r.status === "active" && byId.get(r.id) && !byId.get(r.id).ok)
    .filter((r) => !r.fallback || !byId.get(r.fallback)?.ok)
    .map((r) => r.id);
}

function writeVerified(file, ids, day) {
  let src = readFileSync(file, "utf8");
  for (const id of ids) {
    const lineRe = new RegExp(`^(\\s*"${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":\\s*\\{.*?)(, verifiedAt: "[^"]*")?( \\},?)$`, "m");
    src = src.replace(lineRe, (_m, head, _old, tail) => `${head}, verifiedAt: "${day}"${tail}`);
  }
  writeFileSync(file, src);
}

async function main(argv) {
  const flag = (name) => argv.includes(name);
  const regIdx = argv.indexOf("--registry");
  const file = regIdx >= 0 ? path.resolve(argv[regIdx + 1]) : DEFAULT_REGISTRY;
  const rows = parseTextRates(readFileSync(file, "utf8"));
  const targets = rows.filter((r) => r.vendor !== "Serper" && (r.status === "active" || flag("--include-legacy")));
  const results = await Promise.all(targets.map(probe));
  const failures = hardFailures(rows, results);
  const day = new Date().toISOString().slice(0, 10);
  if (flag("--write-verified")) writeVerified(file, results.filter((r) => r.ok).map((r) => r.id), day);
  process.stdout.write(`${JSON.stringify({ probedAt: new Date().toISOString(), registry: file, failures, results }, null, 2)}\n`);
  return failures.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    process.stderr.write(`probe-models: ${err?.stack ?? err}\n`);
    process.exit(2);
  });
}
