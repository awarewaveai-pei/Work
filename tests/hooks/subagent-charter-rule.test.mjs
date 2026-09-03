// Direct unit coverage for mcp/claude-userlevel/hooks/rules/subagent-charter.js.
//
// Gap this closes: runner-parity.test.mjs exercises this rule only through the
// full runner, from its real repo location, where CHARTER_PATH always
// resolves (two levels up from hooks/rules/ lands on mcp/claude-userlevel/,
// which really does have SUBAGENT_CHARTER.md in dev). That never exercised
// the failure path -- exactly the shape of the 2026-09-03 bug, where the
// SAME rule crashed in every DEPLOYED location (~/.claude/hooks/rules/, two
// levels up = ~/.claude/, no charter file there) without a single test
// catching it. This file loads the rule from a synthetic location that does
// NOT have the charter two levels up, to directly exercise the fail-open path
// wrapping fs.readFileSync (2026-09-03 fix).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { REPO_ROOT } from './helpers.mjs';

const require = createRequire(import.meta.url);

const RULE_SRC = path.join(REPO_ROOT, 'mcp', 'claude-userlevel', 'hooks', 'rules', 'subagent-charter.js');

test('subagent-charter rule: returns injected context when the charter file exists two levels up', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'charter-rule-ok-'));
  const rulesDir = path.join(home, 'hooks', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(path.join(rulesDir, 'subagent-charter.js'), fs.readFileSync(RULE_SRC, 'utf8'));
  fs.writeFileSync(path.join(home, 'SUBAGENT_CHARTER.md'), 'Test charter body.\n');

  delete require.cache[require.resolve(path.join(rulesDir, 'subagent-charter.js'))];
  const rule = require(path.join(rulesDir, 'subagent-charter.js'));
  const logCalls = [];
  const res = rule.check({ shared: { logFailOpen: (...a) => logCalls.push(a) } });

  assert.ok(res && Array.isArray(res.context), 'must return a context array when the file exists');
  assert.match(res.context[0], /\[Subagent Charter\]/);
  assert.match(res.context[0], /Test charter body\./);
  assert.equal(logCalls.length, 0, 'must not fail-open-log on the success path');
});

test('subagent-charter rule: fails open (returns null, logs via ctx.shared.logFailOpen) when the charter file is missing — 2026-09-03 regression guard', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'charter-rule-missing-'));
  const rulesDir = path.join(home, 'hooks', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(path.join(rulesDir, 'subagent-charter.js'), fs.readFileSync(RULE_SRC, 'utf8'));
  // Deliberately NOT writing SUBAGENT_CHARTER.md at `home` — reproduces the
  // exact deployed-but-ungoverned-file state that used to throw uncaught.

  delete require.cache[require.resolve(path.join(rulesDir, 'subagent-charter.js'))];
  const rule = require(path.join(rulesDir, 'subagent-charter.js'));
  const logCalls = [];
  const ctx = { shared: { logFailOpen: (...a) => logCalls.push(a) } };

  let res;
  assert.doesNotThrow(() => { res = rule.check(ctx); }, 'must never throw — this is the exact fail-open contract every other rule in rules/ follows');
  assert.equal(res, null, 'must return null (no context injected) when the charter cannot be read');
  assert.equal(logCalls.length, 1, 'must log exactly once via ctx.shared.logFailOpen');
  assert.equal(logCalls[0][0], 'subagent-charter');
  assert.equal(logCalls[0][1].code, 'ENOENT');
});

test('subagent-charter rule: does not throw even when ctx or ctx.shared is absent (defensive against a malformed ctx)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'charter-rule-noctx-'));
  const rulesDir = path.join(home, 'hooks', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(path.join(rulesDir, 'subagent-charter.js'), fs.readFileSync(RULE_SRC, 'utf8'));

  delete require.cache[require.resolve(path.join(rulesDir, 'subagent-charter.js'))];
  const rule = require(path.join(rulesDir, 'subagent-charter.js'));

  assert.doesNotThrow(() => rule.check(undefined));
  assert.doesNotThrow(() => rule.check({}));
});
