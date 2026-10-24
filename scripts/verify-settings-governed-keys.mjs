#!/usr/bin/env node
/**
 * verify-settings-governed-keys.mjs
 *
 * Semantically compares governed keys between the SSOT template and the live
 * settings.json. Called by sync-claude-userlevel.ps1 in verify mode to avoid
 * two categories of false-positive drift:
 *
 *   1. PS5.1 key-ordering non-determinism after deep-clone round-trip
 *      (PSCustomObject key order is not stable across ConvertTo-Json → ConvertFrom-Json)
 *
 *   2. PS5.1 ConvertTo-Json 1-element-array bug
 *      (single-item arrays like hooks.UserPromptSubmit serialize as bare objects)
 *      Normalizer fixes the live file, so it has proper arrays; PS5.1 re-reading
 *      the template still produces objects → string comparison fails.
 *
 * Usage:
 *   node verify-settings-governed-keys.mjs <template.json> <live-settings.json> \
 *        USERPROFILE=C:\Users\me MONOREPO_ROOT=C:\path\to\repo \
 *        overwriteKeys=autoUpdatesChannel,theme,...
 *
 * Exit codes:
 *   0  no drift in governed keys
 *   1  at least one governed key differs
 *   2  usage error / file not found
 */

import fs from 'fs';

// ---- arg parsing --------------------------------------------------------
const positional = [];
const kvArgs = {};
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
  if (m) kvArgs[m[1]] = m[2];
  else positional.push(arg);
}
const [templatePath, livePath] = positional;
if (!templatePath || !livePath) {
  console.error('Usage: node verify-settings-governed-keys.mjs <template.json> <live.json> [KEY=VALUE...]');
  process.exit(2);
}

const USERPROFILE    = kvArgs['USERPROFILE']    || process.env['USERPROFILE']    || '';
const MONOREPO_ROOT  = kvArgs['MONOREPO_ROOT']  || process.env['MONOREPO_ROOT']  || '';
const overwriteKeys  = (kvArgs['overwriteKeys'] || '').split(',').filter(Boolean);

if (!overwriteKeys.length) {
  console.error('overwriteKeys= is required');
  process.exit(2);
}

// ---- helpers ------------------------------------------------------------
function expandVars(str) {
  const fwd = s => s.replace(/\\/g, '/');
  return str
    .replace(/\$\{USERPROFILE_FORWARD\}/g, fwd(USERPROFILE))
    .replace(/\$\{USERPROFILE\}/g, USERPROFILE)
    .replace(/\$\{MONOREPO_ROOT_FORWARD\}/g, fwd(MONOREPO_ROOT))
    .replace(/\$\{MONOREPO_ROOT\}/g, MONOREPO_ROOT);
}

function expandAll(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return expandVars(obj);
  if (Array.isArray(obj)) return obj.map(expandAll);
  if (typeof obj === 'object') {
    const out = {};
    // '_' keys are template comments at ANY depth -- same rule as Expand-VarsRecursive in sync-claude-userlevel.ps1,
    // which never writes them; comparing them here made verify report hooks drift forever (2026-10-24).
    for (const [k, v] of Object.entries(obj)) if (!k.startsWith('_')) out[k] = expandAll(v);
    return out;
  }
  return obj;
}

function getKey(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// canonical representation: sort object keys for order-independent comparison,
// normalize arrays (any non-array wrapped in [...]) for PS5.1 compat.
const ALWAYS_ARRAY_PATHS = [
  /^hooks\.[^.]+$/,
  /^hooks\.[^.]+\.\d+\.hooks$/,
  /^permissions\.(allow|deny|additionalDirectories|ask)$/,
];

function isAlwaysArray(path) {
  return ALWAYS_ARRAY_PATHS.some(r => r.test(path));
}

function canonical(obj, path = '') {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map((v, i) => canonical(v, path ? `${path}.${i}` : `${i}`));
  }
  if (typeof obj === 'object') {
    const sorted = {};
    for (const k of Object.keys(obj).sort()) {
      const childPath = path ? `${path}.${k}` : k;
      let val = obj[k];
      // normalise: if this path must be array but val is plain object, wrap it
      if (isAlwaysArray(childPath) && !Array.isArray(val) && val !== null && typeof val === 'object') {
        val = [val];
      }
      sorted[k] = canonical(val, childPath);
    }
    return sorted;
  }
  return obj;
}

// ---- main ---------------------------------------------------------------
let tplRaw, liveRaw;
try { tplRaw  = JSON.parse(fs.readFileSync(templatePath, 'utf8')); } catch (e) { console.error(`Cannot parse template: ${e.message}`); process.exit(2); }
try { liveRaw = JSON.parse(fs.readFileSync(livePath,     'utf8')); } catch (e) { console.error(`Cannot parse live:     ${e.message}`); process.exit(2); }

const tpl  = expandAll(tplRaw);
const live = liveRaw;

const drifted = [];
for (const key of overwriteKeys) {
  const tplVal  = canonical(getKey(tpl,  key), key);
  const liveVal = canonical(getKey(live, key), key);
  const tplStr  = JSON.stringify(tplVal);
  const liveStr = JSON.stringify(liveVal);
  if (tplStr !== liveStr) {
    drifted.push(key);
    console.log(`  drifted key: ${key}`);
  }
}

if (drifted.length === 0) {
  process.exit(0);
} else {
  process.exit(1);
}
