// Gate: the shared Claude + Codex asset surface is internally consistent -- every command
// and agent reaches BOTH runtimes, and every index lists what exists on disk.
// See scripts/verify-asset-parity.mjs for the invariant and the 2026-09-20 drift that
// motivated it.
//
// The rule is driven with synthetic trees so a broken rule cannot pass just because the
// real tree happens to be clean; the last test then asserts the real tree IS clean.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SCRIPT = join(REPO, 'scripts', 'verify-asset-parity.mjs');
const { checkParity, collectTree } = await import(pathToFileURL(SCRIPT).href);

const cmd = (name, extra = {}) => ({
  name,
  rel: `.claude/commands/${name}.md`,
  hasBom: false,
  frontmatter: { name, description: 'd', ...extra },
});

// A tree that passes everything, used as the baseline each case perturbs.
function cleanTree() {
  return {
    commands: [cmd('health')],
    agents: [{ name: 'critic', rel: '.claude/agents/critic.md', model: 'opus' }],
    skills: ['tdd'],
    wrappers: new Set(['source-command-health', 'tdd']),
    tomls: new Set(['critic']),
    indexText: '| `/health` | x |\n',
    triggerMapText: '| `/health` | x |\n',
    agentIndexText: '| critic | x |\n',
  };
}

// The count floors exist to stop an empty scan passing; the synthetic trees are deliberately
// tiny, so filter those findings out when asserting on rule behaviour and test them separately.
const FLOOR = /found \(expected at least/;
const whats = (problems) => problems.filter((p) => !FLOOR.test(p.what)).map((p) => p.what).join(' || ');
const real = (problems) => problems.filter((p) => !FLOOR.test(p.what));

test('a fully consistent tree reports nothing', () => {
  assert.deepEqual(real(checkParity(cleanTree())), []);
});

test('an asset file on disk that git does not track fails', () => {
  const t = cleanTree();
  t.untracked = ['.agents/skills/source-command-health/SKILL.md'];
  assert.match(whats(checkParity(t)), /not in git/);
});

test('a git failure is reported instead of passing as clean', () => {
  const t = cleanTree();
  t.untracked = { error: 'fatal: detected dubious ownership' };
  assert.match(whats(checkParity(t)), /could not ask git/);
});

test('a command with no Codex wrapper fails', () => {
  const t = cleanTree();
  t.wrappers.delete('source-command-health');
  assert.match(whats(checkParity(t)), /no Codex wrapper/);
});

test('a command marked codex-skip needs no wrapper', () => {
  const t = cleanTree();
  t.commands = [cmd('health', { 'codex-skip': 'true' })];
  t.wrappers.delete('source-command-health');
  assert.deepEqual(real(checkParity(t)), []);
});

test('a wrapper for a codex-skip command is flagged as stale', () => {
  const t = cleanTree();
  t.commands = [cmd('health', { 'codex-skip': 'true' })];
  assert.match(whats(checkParity(t)), /marked codex-skip/);
});

test('an orphan command wrapper is flagged', () => {
  const t = cleanTree();
  t.wrappers.add('source-command-sg-reboot');
  assert.match(whats(checkParity(t)), /no longer exists/);
});

test('an agent with no Codex bridge fails, and an orphan bridge fails', () => {
  const missing = cleanTree();
  missing.tomls.delete('critic');
  assert.match(whats(checkParity(missing)), /no Codex agent bridge/);

  const orphan = cleanTree();
  orphan.tomls.add('ghost-agent');
  assert.match(whats(checkParity(orphan)), /no longer exists/);
});

test('an agent that declares no model fails', () => {
  // The real regression: critic, db-expert, vuln-verifier, debugger and planner declared no
  // `model:` while AGENT_INDEX.md documented `opus` for all five, so they silently ran on
  // whatever the parent session was.
  const t = cleanTree();
  delete t.agents[0].model;
  assert.match(whats(checkParity(t)), /declares no `model:`/);
});

test('an agent that declares an unknown model tier fails', () => {
  const t = cleanTree();
  t.agents[0].model = 'claude-opus-5';
  assert.match(whats(checkParity(t)), /is not one of/);
});

test('every declared tier alias is accepted', () => {
  for (const tier of ['opus', 'sonnet', 'haiku', 'inherit']) {
    const t = cleanTree();
    t.agents[0].model = tier;
    assert.deepEqual(real(checkParity(t)), [], `tier ${tier} should pass`);
  }
});

test('a command with no frontmatter fails', () => {
  const t = cleanTree();
  t.commands = [{ name: 'health', rel: 'x', hasBom: false, frontmatter: null }];
  assert.match(whats(checkParity(t)), /no YAML frontmatter/);
});

test('a frontmatter name that disagrees with the filename fails', () => {
  const t = cleanTree();
  t.commands = [cmd('health', { name: 'healthz' })];
  assert.match(whats(checkParity(t)), /does not match the filename/);
});

test('a BOM at the start of a command fails', () => {
  const t = cleanTree();
  t.commands[0].hasBom = true;
  assert.match(whats(checkParity(t)), /UTF-8 BOM/);
});

test('an index mention inside another row\'s prose does NOT count as a row', () => {
  // The exact false negative the first version of this gate had: /ks-aw-01-reboot passed
  // because a retired row's description said "已被 `/ks-aw-01-reboot` 取代".
  const t = cleanTree();
  t.indexText = '| `/other` | 已被 `/health` 取代 |\n';
  assert.match(whats(checkParity(t)), /has no table row for \/health/);
});

test('a first cell with a trailing annotation still counts as a row', () => {
  // TOOL_TRIGGER_MAP really writes "| `/codex-review`（2026-08-30 起主力）|".
  const t = cleanTree();
  t.triggerMapText = '| `/health`（2026-08-30 起主力，本 repo 自建 command）| x |\n';
  assert.deepEqual(real(checkParity(t)), []);
});

test('a longer command name does not satisfy a shorter one', () => {
  const t = cleanTree();
  t.indexText = '| `/health-extended` | x |\n';
  assert.match(whats(checkParity(t)), /has no table row for \/health/);
});

test('a missing trigger-map row fails', () => {
  const t = cleanTree();
  t.triggerMapText = '| `/something-else` | x |\n';
  assert.match(whats(checkParity(t)), /nothing routes an operator phrase to it/);
});

test('a skill with no Codex wrapper fails', () => {
  const t = cleanTree();
  t.wrappers.delete('tdd');
  assert.match(whats(checkParity(t)), /no Codex wrapper/);
});

test('an almost-empty scan fails instead of reporting OK', () => {
  // A gate that passes because it found nothing to check is the false-green shape this whole
  // change exists to remove; assert the floor rather than trust an empty pass.
  const t = cleanTree();
  t.commands = [];
  t.agents = [];
  t.skills = [];
  t.wrappers = new Set();
  t.tomls = new Set();
  const problems = checkParity(t);
  assert.ok(problems.length >= 3, 'expected a finding per empty collection');
  assert.match(problems.map((p) => p.what).join(' '), /expected at least/);
});

test('the real asset tree is consistent', () => {
  const problems = checkParity(collectTree());
  assert.deepEqual(problems, [], `parity problems:\n${problems.map((p) => `${p.where}: ${p.what}`).join('\n')}`);
});

test('the CLI exits zero on the real tree', () => {
  const out = execFileSync(process.execPath, [SCRIPT], { cwd: REPO, encoding: 'utf8' });
  assert.match(out, /asset parity OK/);
});
