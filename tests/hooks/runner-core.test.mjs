// M2 — runner core guarantees, tested against FIXTURE rules (not the real
// manifest): dispatch, block aggregation, crash isolation, missing-rule
// fail-open, bad-JSON passthrough, matcher semantics, command expansion.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { runNode, makeTmpHome, HOOKS_DIR } from './helpers.mjs';

const RUNNER = path.join(HOOKS_DIR, 'runner.js');
let FIX; // fixture runner-home

before(() => {
  FIX = makeTmpHome();
  fs.mkdirSync(path.join(FIX, 'rules'), { recursive: true });
  const rule = (name, body) =>
    fs.writeFileSync(path.join(FIX, 'rules', `${name}.js`), body);

  rule('always-warn', `module.exports = { check: () => ({ warn: ['[Hook] warned'] }) };`);
  rule('block-if-marker', `module.exports = { check: (ctx) =>
    /MARKER/.test(ctx.command) ? { block: ['[Hook] BLOCKED: marker'] } : null };`);
  rule('block-two', `module.exports = { check: (ctx) =>
    /TWICE/.test(ctx.command) ? { block: ['[Hook] BLOCKED: second'] } : null };`);
  rule('crasher', `module.exports = { check: () => { throw new Error('boom'); } };`);
  rule('expanded-scan', `module.exports = { check: (ctx) =>
    /^\\s*secret-verb\\b/im.test(ctx.commandExpanded) ? { block: ['[Hook] BLOCKED: expanded'] } : null };`);
  rule('sid-echo', `module.exports = { check: (ctx) => ({ warn: ['sid=' + ctx.sid] }) };`);
  rule('subagent-context', `module.exports = { check: () => ({ context: ['shared charter'] }) };`);

  fs.writeFileSync(path.join(FIX, 'rules.manifest.json'), JSON.stringify({
    events: {
      PreToolUse: [
        { matcher: 'Bash', rules: ['crasher', 'block-if-marker', 'block-two', 'expanded-scan'] },
        { matcher: 'Write|Edit', rules: ['always-warn'] },
        { rules: ['sid-echo'] },
        { matcher: '(broken[', rules: ['always-warn'] },
      ],
      Stop: [{ rules: ['missing-rule', 'always-warn'] }],
      SubagentStart: [{ rules: ['subagent-context'] }],
      UserPromptSubmit: [{ rules: ['subagent-context'] }],
    },
  }));
});

function run(event, payload, opts = {}) {
  return runNode(RUNNER, payload, {
    args: [event],
    env: { CLAUDE_HOOKS_RUNNER_HOME: FIX, ...(opts.env || {}) },
    ...opts,
  });
}

test('runner: bad JSON stdin → passthrough exit 0', () => {
  const r = run('PreToolUse', '{{{not-json');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{{{not-json');
});

test('runner: unknown event → passthrough exit 0', () => {
  const r = run('NoSuchEvent', { tool_name: 'Bash', tool_input: { command: 'MARKER' } });
  assert.equal(r.status, 0);
});

test('runner: matcher dispatch — Bash rule does not fire for Edit tool', () => {
  const r = run('PreToolUse', { tool_name: 'Edit', tool_input: { command: 'MARKER' } });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /warned/);            // Write|Edit group fired
  assert.doesNotMatch(r.stderr, /BLOCKED/);    // Bash group did not
});

test('runner: matcher substring semantics — MultiEdit hits Write|Edit group (legacy parity)', () => {
  const r = run('PreToolUse', { tool_name: 'MultiEdit', tool_input: {} });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /warned/);
});

test('runner: omitted matcher matches every tool', () => {
  const r = run('PreToolUse', { session_id: 'fixed-sid-1', tool_name: 'Glob', tool_input: {} });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /sid=fixed-sid-1/);
});

test('runner: block aggregation — two blocking rules both report, single exit 2', () => {
  const r = run('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'MARKER TWICE' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BLOCKED: marker/);
  assert.match(r.stderr, /BLOCKED: second/);
});

test('runner: crash isolation — crasher fails open loudly, later rules still block', () => {
  const r = run('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'MARKER' } });
  assert.equal(r.status, 2); // block-if-marker still fired after crasher blew up
  assert.match(r.stderr, /fail-open.*crasher/);
});

test('runner: missing rule file → loud fail-open, remaining rules run, never blocks', () => {
  const r = run('Stop', { tool_name: 'x' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /fail-open.*missing-rule/);
  assert.match(r.stderr, /warned/);
});

test('runner: broken matcher regex → group skipped (fail-open), no crash', () => {
  const r = run('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'nothing' } });
  assert.equal(r.status, 0);
});

test('runner: commandExpanded — bash -c wrapped verb is visible to line-anchored rules', () => {
  const r = run('PreToolUse', {
    tool_name: 'Bash',
    tool_input: { command: 'bash -c "secret-verb now"' },
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BLOCKED: expanded/);
});

test('runner: commandExpanded — nested sh -lc single-quoted payload unwrapped', () => {
  const r = run('PreToolUse', {
    tool_name: 'Bash',
    tool_input: { command: `sh -lc 'secret-verb deep'` },
  });
  assert.equal(r.status, 2);
});

test('runner: passthrough echoes stdin exactly on pass', () => {
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ok' } });
  const r = run('PreToolUse', payload);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, payload);
});

test('runner: SubagentStart injects rule context as structured hook JSON, never the raw payload', () => {
  // SubagentStart is NOT on Claude Code's documented plain-stdout-context
  // whitelist (only UserPromptSubmit/UserPromptExpansion/SessionStart/
  // PostModelSwitch are, per code.claude.com/docs/en/hooks checked
  // 2026-09-03) -- plain text here is silently dropped by the host, so this
  // must always be the same hookSpecificOutput.additionalContext JSON shape
  // Codex requires. This is the exact bug that made subagent-charter.js
  // context injection silently dead: runner.js used to write plain stdout
  // for every native-Claude context event, this one included.
  const r = run('SubagentStart', { session_id: 'subagent-core', secret: 'must-not-echo' });
  assert.equal(r.status, 0);
  const output = JSON.parse(r.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'SubagentStart');
  assert.equal(output.hookSpecificOutput.additionalContext, 'shared charter');
  assert.doesNotMatch(r.stdout, /must-not-echo/);
});

test('runner: Codex context event emits documented hook JSON, never raw payload', () => {
  // turn_id is the real Codex-specific signal (2026-09-03 fix) -- see runner.js
  // isCodexPayload comment. hook_event_name alone is NOT Codex-specific: Claude
  // Code's own official hook payload includes it too (code.claude.com/docs/en/hooks).
  const r = run('UserPromptSubmit', {
    hook_event_name: 'UserPromptSubmit',
    turn_id: 'turn-abc123',
    secret: 'must-not-echo',
  });
  assert.equal(r.status, 0);
  const output = JSON.parse(r.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(output.hookSpecificOutput.additionalContext, 'shared charter');
  assert.doesNotMatch(r.stdout, /must-not-echo/);
});

test('runner: a real Claude Code payload (has hook_event_name, no turn_id) is NOT misclassified as Codex (2026-09-03 fix)', () => {
  // Regression test for the actual bug: Claude Code's own documented hook input
  // schema includes hook_event_name on every event -- checking for its presence
  // alone used to classify every genuine Claude Code call as Codex, which meant
  // UserPromptSubmit (on the plain-stdout-context whitelist, per
  // code.claude.com/docs/en/hooks) emitted Codex's structured JSON
  // hookSpecificOutput shape instead of the plain text Claude Code expects
  // for THIS event. (SubagentStart is a different case, covered above: it is
  // NOT on that whitelist and needs the JSON shape regardless of vendor.)
  const r = run('UserPromptSubmit', {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'real-claude-session',
    cwd: '/x',
  });
  assert.equal(r.status, 0);
  // Plain text context, NOT the Codex hookSpecificOutput JSON wrapper.
  assert.equal(r.stdout, 'shared charter\n');
  assert.doesNotMatch(r.stdout, /hookSpecificOutput/);
});

test('runner: real manifest parses and every referenced rule name is unique per group', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'rules.manifest.json'), 'utf8'));
  const events = Object.keys(manifest.events);
  assert.ok(events.includes('PreToolUse') && events.includes('Stop'));
  for (const [ev, groups] of Object.entries(manifest.events)) {
    for (const g of groups) {
      const names = g.rules || [];
      assert.equal(new Set(names).size, names.length, `${ev} has duplicate rule in one group`);
    }
  }
});
