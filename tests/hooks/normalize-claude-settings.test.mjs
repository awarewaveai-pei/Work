// Regression guard for scripts/normalize-claude-settings.mjs.
//
// 2026-09-03 root cause: HOOK_EVENTS omitted 'SubagentStart'. PS5.1's
// ConvertTo-Json flattens 1-element arrays to bare objects on every write of
// settings.json (documented in the script's own header); the normalizer
// exists specifically to undo that, but only for events it knows about. A
// missing event silently stays broken forever -- Claude Code never fires a
// hook whose settings entry is the wrong shape. This test would have failed
// before the 2026-09-03 fix (SubagentStart absent from HOOK_EVENTS) and
// guards every currently-supported event so a future omission is caught the
// same way.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { REPO_ROOT } from './helpers.mjs';

const NORMALIZE = path.join(REPO_ROOT, 'scripts', 'normalize-claude-settings.mjs');

// Mirrors HOOK_EVENTS in the script under test. Kept as a literal list (not
// imported) so this test independently states what MUST be covered instead
// of trivially re-deriving the same value the script already has -- if the
// two lists drift, that is exactly the bug class this test exists to catch.
const REQUIRED_EVENTS = [
  'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'SessionStart', 'SessionEnd', 'SubagentStart', 'SubagentStop', 'Stop',
  'Notification', 'PreCompact',
];

function writeFixture(evt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'normalize-settings-'));
  const file = path.join(dir, 'settings.json');
  // Simulate the PS5.1 lossy-serialize bug: hooks.<evt> and the nested
  // matcher.hooks both collapsed from array(1) to a bare object.
  const cfg = {
    hooks: {
      [evt]: {
        matcher: '.*',
        hooks: { type: 'command', command: 'node ~/.claude/hooks/runner.js ' + evt, timeout: 15 },
      },
    },
    permissions: { allow: 'Bash(git status)' },
  };
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return file;
}

function runNormalize(file) {
  return spawnSync('node', [NORMALIZE, file], { encoding: 'utf8' });
}

for (const evt of REQUIRED_EVENTS) {
  test(`normalize: repairs bare-object hooks.${evt} (and nested matcher.hooks) back to array(1)`, () => {
    const file = writeFixture(evt);
    const r = runNormalize(file);
    assert.equal(r.status, 0, r.stderr);
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(Array.isArray(cfg.hooks[evt]), `hooks.${evt} must be an array after normalize`);
    assert.equal(cfg.hooks[evt].length, 1);
    assert.ok(Array.isArray(cfg.hooks[evt][0].hooks), `hooks.${evt}[0].hooks must be an array after normalize`);
  });
}

test('normalize: idempotent — running twice on an already-correct file makes no further changes', () => {
  const file = writeFixture('SubagentStart');
  assert.equal(runNormalize(file).status, 0);
  const once = fs.readFileSync(file, 'utf8');
  const r2 = runNormalize(file);
  assert.equal(r2.status, 0);
  assert.match(r2.stdout, /OK \(no fixes needed\)/);
  assert.equal(fs.readFileSync(file, 'utf8'), once);
});

test('normalize: also repairs permissions.allow (unrelated key, sanity check it is not clobbered by the event fix)', () => {
  const file = writeFixture('SubagentStart');
  runNormalize(file);
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(cfg.permissions.allow, ['Bash(git status)']);
});
