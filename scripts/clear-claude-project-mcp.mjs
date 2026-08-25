#!/usr/bin/env node
/**
 * clear-claude-project-mcp.mjs
 *
 * Companion to scripts/sync-claude-userlevel.ps1 (manifest type `clear-collections-json`).
 *
 * Reason this exists:
 *   Claude Code stores per-project MCP state in `%USERPROFILE%\.claude.json` under
 *   `projects["<cwd>"]`. Entries accumulate whenever `claude` is started from an
 *   unrelated directory, and they take precedence over / stack on top of the repo's
 *   project-scoped `.mcp.json`. Repo `.mcp.json` is the SSOT, so these are drift.
 *
 * Why Node rather than PowerShell:
 *   Two independent PS hazards on this specific file.
 *   1. `ConvertFrom-Json` THROWS on it: Claude Code writes project keys that differ
 *      only in case (e.g. 'C:/WINDOWS/system32' and 'C:/WINDOWS/System32') and PS
 *      PSCustomObject property names are case-insensitive, so it reports a duplicate
 *      key. `-AsHashtable` would parse it but does not exist before PowerShell 6,
 *      and this fleet runs Windows PowerShell 5.1 with no pwsh. That is why the
 *      previous PowerShell implementation could never run at all.
 *   2. `ConvertTo-Json` flattens 1-element arrays into objects, and this file holds
 *      the operator's entire Claude Code state (history, per-project settings). A
 *      lossy rewrite here is far more damaging than the drift being cleaned.
 *   Node's JSON.parse/stringify is case-sensitive and round-trips exactly.
 *
 * Usage:
 *   node scripts/clear-claude-project-mcp.mjs \
 *     --target <~/.claude.json> --collections mcpServers,enabledMcpjsonServers,disabledMcpjsonServers \
 *     --mode verify|dry-run|merge
 *
 * Output contract (consumed by sync-claude-userlevel.ps1):
 *   final line is `RESULT status=<clean|drift|repaired|blocked> populated=<N> cleared=<M>`
 *
 *   The status token exists because "nothing populated" and "could not tell" must never
 *   look alike to the caller. `blocked` covers both a structurally wrong file and the
 *   case where the anti-clobber guard refused to write; the wrapper fails on it in every
 *   mode, so drift that was detected but not repaired can never report success.
 */

import { readFileSync, writeFileSync, statSync } from "node:fs";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith("--") ? (i += 1, next) : "true";
  }
  return out;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const targetPath = args.target;
const mode = args.mode || "verify";
const collections = (args.collections || "mcpServers")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

if (!targetPath) fail("--target is required");
if (!["verify", "dry-run", "merge"].includes(mode)) fail(`unknown --mode ${mode}`);

// Claude Code writes this file continuously while it is running (feature-flag cache,
// plugin usage counters, per-project history). A read-modify-write therefore races the
// live process and can silently drop whatever it wrote in between. Record the state at
// read time so the write can refuse rather than clobber. Observed 2026-08-25: three
// unrelated keys changed during a single ~40s edit window.
let readStamp = null;
try {
  const st = statSync(targetPath);
  readStamp = `${st.mtimeMs}:${st.size}`;
} catch {
  readStamp = null;
}

let raw;
try {
  raw = readFileSync(targetPath, "utf8");
} catch (err) {
  if (err.code === "ENOENT") {
    console.log(`target absent at ${targetPath} -- nothing to clear`);
    console.log("RESULT status=clean populated=0 cleared=0");
    process.exit(0);
  }
  fail(`cannot read ${targetPath}: ${err.message}`);
}

let doc;
try {
  doc = JSON.parse(raw.replace(/^﻿/, ""));
} catch (err) {
  // Never degrade to "looks clean" -- a file we cannot parse is a file we cannot vouch for.
  fail(`${targetPath} is not valid JSON: ${err.message}`);
}

const projects = doc && typeof doc === "object" ? doc.projects : null;
if (!projects || typeof projects !== "object" || Array.isArray(projects)) {
  console.log("no `projects` object -- nothing to clear");
  console.log("RESULT status=clean populated=0 cleared=0");
  process.exit(0);
}

// A collection counts as populated when it actually holds something. An already-empty
// object/array is the desired end state, not drift, so it must not keep reporting.
function isPopulated(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

// A collection that is present but neither object nor array is schema-invalid. Skipping it
// as "not populated" would let a malformed file report clean -- the quiet-detector failure
// this contract exists to prevent -- so it blocks instead.
const malformed = [];
for (const [projectKey, project] of Object.entries(projects)) {
  if (!project || typeof project !== "object" || Array.isArray(project)) continue;
  for (const collection of collections) {
    if (!Object.prototype.hasOwnProperty.call(project, collection)) continue;
    const value = project[collection];
    if (value !== null && typeof value !== "object") {
      malformed.push(`${projectKey} .${collection} is ${typeof value}, expected object or array`);
    }
  }
}
if (malformed.length > 0) {
  for (const m of malformed) console.log(`  ${m}`);
  console.log(`RESULT status=blocked populated=0 cleared=0`);
  process.exit(0);
}

const findings = [];
for (const [projectKey, project] of Object.entries(projects)) {
  if (!project || typeof project !== "object" || Array.isArray(project)) continue;
  for (const collection of collections) {
    if (!Object.prototype.hasOwnProperty.call(project, collection)) continue;
    const value = project[collection];
    if (!isPopulated(value)) continue;
    const detail = Array.isArray(value) ? value.join(", ") : Object.keys(value).join(", ");
    findings.push({ projectKey, collection, detail, isArray: Array.isArray(value) });
  }
}

if (findings.length === 0) {
  console.log(`no populated project MCP collections across ${Object.keys(projects).length} project key(s)`);
  console.log("RESULT status=clean populated=0 cleared=0");
  process.exit(0);
}

for (const f of findings) {
  console.log(`  ${f.projectKey} .${f.collection}: ${f.detail}`);
}

if (mode !== "merge") {
  console.log(`mode=${mode} -- not written`);
  console.log(`RESULT status=drift populated=${findings.length} cleared=0`);
  process.exit(0);
}

// Refuse rather than clobber if the live Claude Code process wrote since we read.
// Aborting is safe: the next sync (AO-RESUME runs one every session) retries, and the
// drift we are clearing is not urgent. Losing the operator's session state would be.
if (readStamp !== null) {
  let nowStamp = null;
  try {
    const st = statSync(targetPath);
    nowStamp = `${st.mtimeMs}:${st.size}`;
  } catch {
    nowStamp = null;
  }
  if (nowStamp !== readStamp) {
    console.log("file changed under us since read (Claude Code is running) -- not written");
    // Detected drift we did not repair. `blocked`, never `clean`: the caller must see
    // this as a failed merge so the next run retries rather than reporting success.
    console.log(`RESULT status=blocked populated=${findings.length} cleared=0`);
    process.exit(0);
  }
}

for (const f of findings) {
  projects[f.projectKey][f.collection] = f.isArray ? [] : {};
}

writeFileSync(targetPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(`-> cleared ${findings.length} populated collection(s)`);
console.log(`RESULT status=repaired populated=${findings.length} cleared=${findings.length}`);
process.exit(0);
