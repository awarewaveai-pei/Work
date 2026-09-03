// Regression tests for rules/subagent-budget.js.
//
// WHY THIS FILE EXISTS: v1 of this gate (SubagentStart) shipped with zero
// tests and was completely inert -- nothing here would have caught that,
// because the failure was in EVENT WIRING, not rule logic. That specific
// failure mode is caught live (a real Agent/Workflow spawn either gets
// refused by the harness or it doesn't -- see WORKLOG 2026-09-03 續4/續5
// for the real end-to-end proof), not by these synthetic-payload tests.
// What THESE tests guard against is the logic regressing silently once the
// wiring is known-good: tier boundaries, marker parsing, matcher
// specificity, the sliding window, real Workflow input shapes, and
// concurrency safety.
//
// A round-3 critic pass caught that one of these tests (the original
// "inline guard rejects ListAgents" test) was EMPTY by mutation testing --
// it went through `runNode`+the real manifest, so the anchored matcher
// filtered ListAgents out before the rule ever ran; deleting the inline
// guard entirely still passed the test. That specific test now calls the
// rule module directly (bypassing manifest routing) so it actually
// exercises what it claims to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';

import { runNode, freshSid, REPO_ROOT, HOOKS_DIR } from './helpers.mjs';

const require = createRequire(import.meta.url); // rule/shared modules are CommonJS
const RUNNER = path.join(HOOKS_DIR, 'runner.js');
const RULE_PATH = path.join(HOOKS_DIR, 'rules', 'subagent-budget.js');
const SHARED_PATH = path.join(HOOKS_DIR, 'lib', 'shared.js');

function run(event, payload, opts = {}) {
  return runNode(RUNNER, payload, { args: [event], ...opts });
}

function agentTrackerPathFor(sid) {
  const sanitized = String(sid).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return path.join(os.tmpdir(), `claude-subagent-budget-agent-${sanitized}.txt`);
}

// Tight env overrides so tests don't need 6-11 real payload round trips to
// hit each tier boundary at default thresholds, and don't need to sleep
// for the real 20-minute window.
const TIGHT_ENV = { SUBAGENT_BUDGET_TIER1: '3', SUBAGENT_BUDGET_TIER2: '5', SUBAGENT_BUDGET_WINDOW_MS: '60000' };

// ---------------------------------------------------------------- wiring

test('manifest wires subagent-budget to Agent (anchored) and Workflow (anchored), not to SubagentStart or UserPromptSubmit', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'rules.manifest.json'), 'utf8'));
  const preToolUseGroups = manifest.events.PreToolUse;
  const budgetGroups = preToolUseGroups.filter((g) => (g.rules || []).includes('subagent-budget'));
  const matchers = budgetGroups.map((g) => g.matcher).sort();
  assert.deepEqual(matchers, ['^Agent$', '^Workflow$'],
    'subagent-budget must be wired to exactly these two anchored PreToolUse matchers');

  for (const g of manifest.events.SubagentStart || []) {
    assert.ok(!(g.rules || []).includes('subagent-budget'),
      'subagent-budget must NOT be wired to SubagentStart (v1 proved that event does not block)');
  }
  for (const g of manifest.events.UserPromptSubmit || []) {
    assert.ok(!(g.rules || []).includes('subagent-budget'),
      'subagent-budget must not be wired to UserPromptSubmit -- a reset-on-new-message design was the M-2 bypass');
  }
});

// ---------------------------------------------------------------- M-1: matcher specificity

test('M-1 regression: real matcher regex does not match ListAgents (unanchored "Agent" would)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'rules.manifest.json'), 'utf8'));
  const group = manifest.events.PreToolUse.find((g) => g.matcher === '^Agent$');
  const re = new RegExp(group.matcher);
  assert.ok(re.test('Agent'), 'must match the real Agent tool');
  assert.ok(!re.test('ListAgents'), 'must NOT match ListAgents (real tool, confirmed 2026-09-03 critic finding M-1)');
  assert.ok(!re.test('AgentOutputStyle'), 'must NOT match any other tool containing "Agent" as a substring');
});

test('M-1 regression: inline guard also rejects ListAgents, exercised directly against the rule module (not filtered by the manifest matcher first)', () => {
  delete require.cache[RULE_PATH];
  delete require.cache[SHARED_PATH];
  const rule = require(RULE_PATH);
  const shared = require(SHARED_PATH);
  const sid = freshSid('lg-direct');
  const result = rule.check({
    event: 'PreToolUse', sid, toolName: 'ListAgents', toolInput: {}, shared,
  });
  assert.equal(result, null, 'the rule itself, called directly, must no-op on ListAgents');
  assert.ok(!fs.existsSync(agentTrackerPathFor(sid)), 'ListAgents must not be counted against the Agent budget');
});

test('m-5 regression: a version-skewed shared (missing isAgentTool) falls back to the inline check instead of crashing', () => {
  delete require.cache[RULE_PATH];
  const rule = require(RULE_PATH);
  const skewedShared = { logFailOpen() {} }; // no isAgentTool -- simulates an older synced copy
  const sid = freshSid('skew');
  const tf = agentTrackerPathFor(sid);
  try { fs.unlinkSync(tf); } catch (_) { /* ignore */ }
  const result = rule.check({
    event: 'PreToolUse', sid, toolName: 'Agent', toolInput: { prompt: 'work' }, shared: skewedShared,
  });
  assert.ok(result && Array.isArray(result.context), 'must still recognize the real Agent tool via the fallback');
  assert.ok(fs.existsSync(tf), 'must still count the spawn');
  fs.unlinkSync(tf);
});

// ---------------------------------------------------------------- tier boundaries (Agent)

test('Agent tiers: 1..(tier1-1) allow, tier1..(tier2-1) block without marker, tier2+ hard-blocks even with marker', () => {
  const sid = freshSid('tiers');
  const env = TIGHT_ENV; // tier1=3, tier2=5

  const r1 = run('PreToolUse', { session_id: sid, tool_name: 'Agent', tool_input: { prompt: 'work' } }, { env }); // count=1
  assert.equal(r1.status, 0);
  const r2 = run('PreToolUse', { session_id: sid, tool_name: 'Agent', tool_input: { prompt: 'work' } }, { env }); // count=2
  assert.equal(r2.status, 0);

  const r3 = run('PreToolUse', { session_id: sid, tool_name: 'Agent', tool_input: { prompt: 'work' } }, { env }); // count=3 -> tier1
  assert.equal(r3.status, 2);
  assert.match(r3.stderr, /requires justification/);

  const r3retry = run('PreToolUse', {
    session_id: sid, tool_name: 'Agent',
    tool_input: { prompt: 'work\nCONFIRMED-INDEPENDENT-WORKSTREAM: separate file set, verified' },
  }, { env }); // count=4, has marker -> allow
  assert.equal(r3retry.status, 0);

  const r5 = run('PreToolUse', {
    session_id: sid, tool_name: 'Agent',
    tool_input: { prompt: 'work\nCONFIRMED-INDEPENDENT-WORKSTREAM: still independent' },
  }, { env }); // count=5 -> tier2, marker present but must NOT unlock
  assert.equal(r5.status, 2);
  assert.match(r5.stderr, /hard cap/);
  assert.doesNotMatch(r5.stderr, /requires justification/, 'tier2 message must be the unconditional one, not tier1\'s');
});

test('marker regex: case-sensitive, anchored, non-empty reason required', () => {
  const env = { SUBAGENT_BUDGET_TIER1: '1', SUBAGENT_BUDGET_TIER2: '999' };

  const cases = [
    ['confirmed-independent-workstream: lowercase must not unlock', false],
    ['prose mentions CONFIRMED-INDEPENDENT-WORKSTREAM: mid-line must not unlock', false],
    ['CONFIRMED-INDEPENDENT-WORKSTREAM:', false],
    ['CONFIRMED-INDEPENDENT-WORKSTREAM: real reason', true],
  ];
  for (const [prompt, expectAllow] of cases) {
    const r = run('PreToolUse', { session_id: freshSid('m'), tool_name: 'Agent', tool_input: { prompt } }, { env });
    assert.equal(r.status, expectAllow ? 0 : 2, `prompt=${JSON.stringify(prompt)}`);
  }
});

// ---------------------------------------------------------------- M-2: sliding window, not per-turn

test('M-2 regression: entries outside the window do not count', () => {
  const sid = freshSid('window');
  const tf = agentTrackerPathFor(sid);
  const old = Date.now() - 5000; // 5s ago
  fs.writeFileSync(tf, `${old}\n${old}\n${old}\n${old}\n${old}\n`); // 5 stale entries
  // window=1000ms -> all 5 are already outside the window
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Agent', tool_input: { prompt: 'work' } },
    { env: { SUBAGENT_BUDGET_WINDOW_MS: '1000', SUBAGENT_BUDGET_TIER1: '3', SUBAGENT_BUDGET_TIER2: '5' } });
  assert.equal(r.status, 0, 'stale entries outside the window must not count toward the tier');
});

// ---------------------------------------------------------------- round-3 M-1: no compaction race

test('round-3 M-1 regression: 20 concurrent real spawns, all counted, zero lost (no compaction to race)', async () => {
  const sid = freshSid('race');
  const tf = agentTrackerPathFor(sid);
  try { fs.unlinkSync(tf); } catch (_) { /* ignore */ }

  const N = 20;
  const results = await Promise.all(Array.from({ length: N }, () => new Promise((resolve) => {
    const child = fork(RUNNER, ['PreToolUse'], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'ignore', 'ignore', 'ipc'],
      env: { ...process.env, HOME: os.tmpdir(), CLAUDE_CODE_SESSION_ID: '', CLAUDE_SESSION_ID: '' },
    });
    child.stdin.end(JSON.stringify({ session_id: sid, tool_name: 'Agent', tool_input: { prompt: 'work' } }));
    child.on('exit', (code) => resolve(code));
  })));

  const lines = fs.readFileSync(tf, 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, N, `expected all ${N} concurrent appends to land, got ${lines.length}`);
  fs.unlinkSync(tf);
});

// ---------------------------------------------------------------- Workflow path (C-1 + round-3 C-1)

test('Workflow (script shape): no estimate marker is blocked', () => {
  const r = run('PreToolUse', { session_id: freshSid('wf'), tool_name: 'Workflow', tool_input: { script: 'export const meta = {}; agent("x")' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no declared agent-count estimate/);
});

test('Workflow (script shape): estimate within the operator-set limit (10) allows', () => {
  const r = run('PreToolUse', {
    session_id: freshSid('wf'), tool_name: 'Workflow',
    tool_input: { script: '// SUBAGENT-BUDGET-ESTIMATE: 4\nexport const meta = {};' },
  });
  assert.equal(r.status, 0);
});

test('Workflow (script shape): estimate over the limit is blocked (this is the exact 102-agent incident shape)', () => {
  const r = run('PreToolUse', {
    session_id: freshSid('wf'), tool_name: 'Workflow',
    tool_input: { script: '// SUBAGENT-BUDGET-ESTIMATE: 102\nexport const meta = {};' },
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /exceeds the operator-set limit/);
});

test('round-3 m-1 regression: multiple estimate lines are SUMMED, not just the first one read', () => {
  // Two honestly-labeled batches of 6 each = 12 real total, over the
  // default limit of 10 -- must block on the SUM, not pass on the first "6".
  const r = run('PreToolUse', {
    session_id: freshSid('wf'), tool_name: 'Workflow',
    tool_input: { script: '// SUBAGENT-BUDGET-ESTIMATE: 6\nbatchA();\n// SUBAGENT-BUDGET-ESTIMATE: 6\nbatchB();' },
  });
  assert.equal(r.status, 2, 'sum of 6+6=12 must exceed the limit of 10 even though the first line alone (6) would not');
});

test('round-3 C-1 regression: scriptPath shape reads the file and applies the same marker rule', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-scriptpath-'));
  const scriptFile = path.join(tmp, 'workflow.mjs');
  fs.writeFileSync(scriptFile, '// SUBAGENT-BUDGET-ESTIMATE: 3\nexport const meta = {};');

  const allowed = run('PreToolUse', { session_id: freshSid('wfsp'), tool_name: 'Workflow', tool_input: { scriptPath: scriptFile, resumeFromRunId: 'wf_abc' } });
  assert.equal(allowed.status, 0, 'a scriptPath file with a valid marker must allow, same as an inline script would');

  fs.writeFileSync(scriptFile, '// no marker here');
  const blocked = run('PreToolUse', { session_id: freshSid('wfsp'), tool_name: 'Workflow', tool_input: { scriptPath: scriptFile } });
  assert.equal(blocked.status, 2, 'a scriptPath file with no marker must still block, same as inline script would');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('round-3 C-1 regression: scriptPath that cannot be read blocks with a read-failure message, not the "add a line to script" message', () => {
  const r = run('PreToolUse', {
    session_id: freshSid('wfsp'), tool_name: 'Workflow',
    tool_input: { scriptPath: 'C:\\definitely\\does\\not\\exist\\workflow.mjs', resumeFromRunId: 'wf_xyz' },
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /could not read Workflow scriptPath/);
  assert.doesNotMatch(r.stderr, /Add a line \(own line, in `script`/, 'must not tell the caller to edit a script field that does not exist in this input shape');
});

test('round-3 C-1 regression: resumeFromRunId-only (no script, no scriptPath) allows -- blocking a resume forces a costlier full restart', () => {
  const r = run('PreToolUse', {
    session_id: freshSid('wfresume'), tool_name: 'Workflow',
    tool_input: { resumeFromRunId: 'wf_realistic123' },
  });
  assert.equal(r.status, 0, 'a bare resume must be allowed, not blocked into an unsatisfiable state (round-3 C-1: this was the 31%-of-real-traffic finding)');
});

test('Workflow estimate is a pure declared-honesty gate, not a real parse -- documented limitation, asserted here so nobody "fixes" this into a false sense of security later', () => {
  // A script that declares 3 but actually loops 100x is indistinguishable
  // from an honest 3 to this gate. This test exists to make that limitation
  // an explicit, checked fact rather than an assumption that quietly rots.
  const r = run('PreToolUse', {
    session_id: freshSid('wf'), tool_name: 'Workflow',
    tool_input: { script: '// SUBAGENT-BUDGET-ESTIMATE: 3\nitems.map(x => agent(x)) // items.length is actually 100 at runtime' },
  });
  assert.equal(r.status, 0, 'this gate cannot see through the lie -- allow is the documented, accepted behavior, not a bug');
});
