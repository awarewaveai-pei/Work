#!/usr/bin/env node
/**
 * normalize-claude-settings.mjs
 *
 * Companion to scripts/sync-claude-userlevel.ps1.
 *
 * Reason this exists:
 *   PowerShell 5.1 ConvertTo-Json has a known bug where 1-element arrays are
 *   serialized as bare objects (lossy). Every time sync-claude-userlevel.ps1
 *   writes settings.json, single-entry hook arrays get flattened to objects.
 *   Claude Code then refuses to parse settings.json with:
 *     "Settings file failed to parse: ... Expected array, but received object"
 *
 * What this does:
 *   Reads a settings.json, ensures every path that MUST be an array is an array,
 *   writes back. Idempotent. Safe to run on already-correct files (no-op).
 *
 * Usage:
 *   node scripts/normalize-claude-settings.mjs <path-to-settings.json> [...]
 *
 * Exit codes:
 *   0  success (whether fixes were applied or not)
 *   1  unrecoverable error (file not found, invalid JSON, write failure)
 *
 * Schema version: 1
 * Last reviewed: 2026-05-07
 */

import fs from 'fs';
import path from 'path';

// Hook event names Claude Code currently supports + reserved future names.
// If Claude Code adds a new event, add it here so the fix applies automatically.
const HOOK_EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SessionStart',
  'SessionEnd',
  'SubagentStop',
  'Stop',
  'Notification',
  'PreCompact',
];

// permissions.* keys that must be arrays (per Claude Code schema).
const PERMISSION_ARRAY_KEYS = ['allow', 'deny', 'additionalDirectories', 'ask'];

function normalize(cfg) {
  const fixes = [];

  if (cfg.hooks && typeof cfg.hooks === 'object') {
    for (const evt of HOOK_EVENTS) {
      const v = cfg.hooks[evt];
      if (v === undefined || v === null) continue;

      // Top-level: hooks.{Event} must be array
      if (!Array.isArray(v)) {
        cfg.hooks[evt] = [v];
        fixes.push(`hooks.${evt}: object → array(1)`);
      }

      // Nested: hooks.{Event}[N].hooks must be array
      const arr = cfg.hooks[evt];
      if (Array.isArray(arr)) {
        arr.forEach((matcher, idx) => {
          if (
            matcher &&
            typeof matcher === 'object' &&
            matcher.hooks !== undefined &&
            matcher.hooks !== null &&
            !Array.isArray(matcher.hooks)
          ) {
            matcher.hooks = [matcher.hooks];
            fixes.push(`hooks.${evt}[${idx}].hooks: object → array(1)`);
          }
        });
      }
    }
  }

  if (cfg.permissions && typeof cfg.permissions === 'object') {
    for (const k of PERMISSION_ARRAY_KEYS) {
      const v = cfg.permissions[k];
      if (v === undefined || v === null) continue;
      if (!Array.isArray(v)) {
        cfg.permissions[k] = [v];
        fixes.push(`permissions.${k}: ${typeof v} → array(1)`);
      }
    }
  }

  return fixes;
}

function processFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[normalize] ERROR: file not found: ${filePath}`);
    return 1;
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error(`[normalize] ERROR: read failed: ${filePath}: ${e.message}`);
    return 1;
  }

  const hadBom = raw.charCodeAt(0) === 0xFEFF;
  if (hadBom) raw = raw.slice(1);

  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    console.error(`[normalize] ERROR: invalid JSON in ${filePath}: ${e.message}`);
    return 1;
  }

  const fixes = normalize(cfg);

  if (fixes.length === 0) {
    console.log(`[normalize] OK (no fixes needed): ${path.basename(filePath)}`);
    return 0;
  }

  const out = (hadBom ? '﻿' : '') + JSON.stringify(cfg, null, 2) + '\n';
  try {
    fs.writeFileSync(filePath, out, 'utf8');
  } catch (e) {
    console.error(`[normalize] ERROR: write failed: ${filePath}: ${e.message}`);
    return 1;
  }

  console.log(`[normalize] FIXED ${fixes.length} structural issue(s) in ${path.basename(filePath)}:`);
  for (const f of fixes) console.log(`  - ${f}`);
  return 0;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/normalize-claude-settings.mjs <path-to-settings.json> [...]');
  process.exit(1);
}

let exitCode = 0;
for (const arg of args) {
  const ec = processFile(arg);
  if (ec !== 0) exitCode = ec;
}
process.exit(exitCode);
