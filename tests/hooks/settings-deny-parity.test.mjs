// Regression guard: the Workflow tool must be denied on BOTH settings sources.
//
// 2026-09-03 root cause: one Workflow call fanned out to 99 agents and burned
// the 5-hour quota in ~30 minutes. subagent-budget.js cannot stop that class:
// Workflow's agent() calls run in the background, invisible to PreToolUse, so
// the hook can only check a self-declared estimate. The only mechanical
// closure is a permissions.deny on the tool itself. Workstations get settings
// from mcp/claude-userlevel/settings.template.json; remote containers get
// them from the JSON that scripts/wire-remote-hooks.sh generates. If either
// drops the deny, the incident is possible again on that surface -- this
// test fails on whichever one drifted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { REPO_ROOT } from './helpers.mjs';

const TEMPLATE = path.join(REPO_ROOT, 'mcp', 'claude-userlevel', 'settings.template.json');
const WIRE = path.join(REPO_ROOT, 'scripts', 'wire-remote-hooks.sh');

// Perplexity is Search-API only: these chat tools bill per token on sonar-pro / reasoning /
// deep-research and drained the account on 2026-06-21 and 2026-09-12.
const PERPLEXITY_CHAT_TOOLS = [
  'mcp__perplexity__perplexity_ask',
  'mcp__perplexity__perplexity_reason',
  'mcp__perplexity__perplexity_research',
];

test('settings.template.json denies the Workflow tool', () => {
  const settings = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  const deny = settings?.permissions?.deny;
  assert.ok(Array.isArray(deny), 'permissions.deny must be an array');
  assert.ok(deny.includes('Workflow'), 'permissions.deny must contain the bare tool name "Workflow"');
});

test('settings.template.json denies every Perplexity chat tool and allows none', () => {
  const perm = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8')).permissions;
  for (const tool of PERPLEXITY_CHAT_TOOLS) {
    assert.ok(perm.deny.includes(tool), `permissions.deny must contain ${tool}`);
    assert.ok(!(perm.allow ?? []).includes(tool), `permissions.allow must not contain ${tool}`);
  }
});

test('wire-remote-hooks.sh generates a settings.local.json that denies Workflow', (t) => {
  if (process.platform === 'win32' && !spawnSync('bash', ['--version']).stdout) {
    t.skip('bash not available');
    return;
  }
  // Run the generator against a throwaway repo root so the real
  // .claude/settings.local.json is never touched by the test.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-remote-'));
  const scriptsDir = path.join(tmp, 'scripts');
  fs.mkdirSync(scriptsDir);
  fs.copyFileSync(WIRE, path.join(scriptsDir, 'wire-remote-hooks.sh'));
  const r = spawnSync('bash', [path.join(scriptsDir, 'wire-remote-hooks.sh')], { encoding: 'utf8' });
  assert.equal(r.status, 0, `generator failed: ${r.stderr}`);
  const out = JSON.parse(fs.readFileSync(path.join(tmp, '.claude', 'settings.local.json'), 'utf8'));
  assert.ok(Array.isArray(out?.permissions?.deny), 'generated permissions.deny must be an array');
  assert.ok(out.permissions.deny.includes('Workflow'), 'generated settings must deny "Workflow"');
  for (const tool of PERPLEXITY_CHAT_TOOLS) {
    assert.ok(out.permissions.deny.includes(tool), `generated settings must deny ${tool}`);
  }
  assert.ok(out.hooks?.PreToolUse, 'hook wiring must survive the permissions addition');
  assert.deepEqual(underscoreKeys(out), [], 'generated settings must carry no comment keys');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// The CLI rejects an unknown nested key or a malformed rule and then skips the WHOLE settings file -- every hook and
// deny rule (2026-10-24: hooks._comment and "Bash(:(){ *)" made every CLI session run with no gates).
// sync-claude-userlevel.ps1 strips '_' keys at any depth; rules are copied verbatim, so they are checked here.
function underscoreKeys(obj, at = '') {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.entries(obj).flatMap(([k, v]) => (k.startsWith('_') ? [at + k] : []).concat(underscoreKeys(v, `${at}${k}.`)));
}

test('settings.template.json permission rules have no empty parentheses inside a Tool(...) pattern', () => {
  const perm = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8')).permissions;
  for (const rule of [...(perm.deny ?? []), ...(perm.allow ?? [])]) {
    const inner = rule.match(/^[^(]+\((.*)\)$/)?.[1];
    assert.ok(inner === undefined || !inner.includes('()'), `rule the CLI refuses ("Empty parentheses"): ${rule}`);
  }
});
