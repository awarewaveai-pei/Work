#!/usr/bin/env node
/**
 * prune-duplicate-mcp-servers.mjs
 *
 * Companion to scripts/sync-claude-userlevel.ps1 (manifest type `prune-duplicate-json`).
 *
 * STATUS 2026-08-28: no manifest entry currently dispatches to this helper. It is kept
 * on purpose -- see the block comment above Sync-Json-PruneDuplicate in
 * scripts/sync-claude-userlevel.ps1 for why, and TASKS.md for the successor file pair.
 *
 * Reason this exists:
 *   Cursor loads BOTH the project `.cursor/mcp.json` and the user-level
 *   `%USERPROFILE%\.cursor\mcp.json`. A server named in both launches twice per
 *   window. For OAuth servers behind `mcp-remote` that means two proxies racing
 *   the same token lock -- on 2026-08-25 that produced 36 zombie node processes
 *   and 14 browser popups in two hours. Cursor was retired 2026-08-26.
 *
 *   The policy (agency-os/docs/operations/mcp-add-server-quickstart.md) is NOT
 *   "empty the user file": it is "keep it empty EXCEPT keys that do not collide
 *   with the project config", because a non-colliding key is the escape hatch for
 *   an MCP that must never enter the repo. A blunt replace-with-{} would delete
 *   that escape hatch, which is why this file went ungoverned for so long.
 *
 * Why Node rather than PowerShell:
 *   PowerShell 5.1's ConvertTo-Json serializes 1-element arrays as bare objects,
 *   which would silently corrupt an MCP entry whose `args` has a single element.
 *   Node's JSON.parse/stringify round-trips exactly. Detection AND the write both
 *   live here so there is only one definition of "duplicate".
 *
 * Usage:
 *   node scripts/prune-duplicate-mcp-servers.mjs \
 *     --target <user-level.json> --compare <project.json> \
 *     --collection mcpServers --mode verify|dry-run|merge
 *
 * Output contract (consumed by sync-claude-userlevel.ps1):
 *   final line is `RESULT status=<clean|drift|repaired|blocked> duplicates=<N> pruned=<M>`
 *
 *   The status token exists because "0 duplicates" and "could not tell" must never
 *   look alike to the caller. `blocked` means this helper could not establish the end
 *   state -- the wrapper treats that as failure in every mode, so a detector that goes
 *   quiet can never be mistaken for a clean bill of health.
 */

import { readFileSync, writeFileSync } from "node:fs";

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
const comparePath = args.compare;
const collection = args.collection || "mcpServers";
const mode = args.mode || "verify";

if (!targetPath) fail("--target is required");
if (!comparePath) fail("--compare is required");
if (!["verify", "dry-run", "merge"].includes(mode)) fail(`unknown --mode ${mode}`);

// Read a JSON file, returning null when it simply is not there. An unreadable or
// malformed file is a hard failure: silently treating it as empty would let this
// helper report "no duplicates" for a file it never actually understood, which is
// the detector-goes-quiet failure mode this whole change exists to remove.
function readJson(path, label) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    fail(`cannot read ${label} at ${path}: ${err.message}`);
  }
  try {
    return JSON.parse(raw.replace(/^﻿/, ""));
  } catch (err) {
    fail(`${label} at ${path} is not valid JSON: ${err.message}`);
  }
}

// Returns the server names, or null when the document is structurally wrong. A JSON file
// can parse cleanly and still be nonsense (`{"mcpServers":"copilot"}`); reporting that as
// "no servers" would be the quiet-detector failure this contract exists to prevent.
function serverNames(doc, label) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    console.log(`${label} is not a JSON object`);
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(doc, collection)) return [];
  const bag = doc[collection];
  if (!bag || typeof bag !== "object" || Array.isArray(bag)) {
    console.log(`${label} has \`${collection}\` of wrong type (${Array.isArray(bag) ? "array" : typeof bag}); expected an object`);
    return null;
  }
  return Object.keys(bag);
}

const compareDoc = readJson(comparePath, "compare file");
if (compareDoc === null) {
  fail(`compare file not found at ${comparePath} (run scripts/sync-mcp-config.ps1 first)`);
}

const targetDoc = readJson(targetPath, "target file");
if (targetDoc === null) {
  console.log(`target absent at ${targetPath} -- nothing to prune`);
  console.log("RESULT status=clean duplicates=0 pruned=0");
  process.exit(0);
}

const compareList = serverNames(compareDoc, "compare file");
const targetList = serverNames(targetDoc, "target file");
if (compareList === null || targetList === null) {
  console.log("RESULT status=blocked duplicates=0 pruned=0");
  process.exit(0);
}
const compareNames = new Set(compareList);
const targetNames = targetList;
const duplicates = targetNames.filter((name) => compareNames.has(name));
const kept = targetNames.filter((name) => !compareNames.has(name));

if (duplicates.length === 0) {
  console.log(`no duplicates (${targetNames.length} user-level server(s), none collide)`);
  console.log("RESULT status=clean duplicates=0 pruned=0");
  process.exit(0);
}

console.log(`duplicates (${duplicates.length}): ${duplicates.join(", ")}`);
if (kept.length > 0) {
  console.log(`preserved (${kept.length}, no collision): ${kept.join(", ")}`);
}

if (mode !== "merge") {
  console.log(`mode=${mode} -- not written`);
  console.log(`RESULT status=drift duplicates=${duplicates.length} pruned=0`);
  process.exit(0);
}

for (const name of duplicates) {
  delete targetDoc[collection][name];
}

// Write with the same shape Cursor itself uses: 2-space indent, trailing newline,
// no BOM. Only keys inside `collection` are touched; every other property of the
// document is round-tripped untouched.
writeFileSync(targetPath, `${JSON.stringify(targetDoc, null, 2)}\n`, "utf8");
console.log(`-> pruned ${duplicates.length}, kept ${kept.length}`);
console.log(`RESULT status=repaired duplicates=${duplicates.length} pruned=${duplicates.length}`);
process.exit(0);
