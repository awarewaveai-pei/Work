// Gate: every `mcp__<server>__<tool>` reference in the shared Claude+Codex assets
// names a server that can actually exist. See scripts/verify-asset-mcp-refs.mjs for
// the invariant and the 2026-09-20 bug that motivated it.
//
// Two halves on purpose:
//   1. rule behaviour, driven in-memory so a broken rule cannot pass by scanning a
//      clean tree;
//   2. the real tree, so the gate fails the moment someone commits a dead reference.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SCRIPT = join(REPO, 'scripts', 'verify-asset-mcp-refs.mjs');
// pathToFileURL, not string concatenation: a bare `file://D:/...` URL is not a valid
// Windows file URL and the import would throw.
const { checkText } = await import(pathToFileURL(SCRIPT).href);

const enabled = new Set(['github', 'posthog']);
const disabled = new Set(['canva']);
const run = (text) => checkText({ text, label: 't', enabled, disabled });

test('a registry server and a host server both pass', () => {
  assert.equal(run('mcp__github__push_files').length, 0);
  assert.equal(run('mcp__claude-in-chrome__navigate').length, 0);
});

test('near-miss casing/punctuation fails and names the right id', () => {
  const [f] = run('mcp__Claude_in_Chrome__navigate');
  assert.ok(f, 'expected a finding');
  assert.match(f.why, /did you mean "claude-in-chrome"/);
});

test('a server disabled in the registry fails', () => {
  const [f] = run('mcp__canva__export_design');
  assert.ok(f);
  assert.match(f.why, /enabled:false/);
});

test('a retired server fails', () => {
  assert.equal(run('mcp__perplexity__perplexity_search').length, 1);
});

test('a hardcoded per-install connector UUID fails', () => {
  const [f] = run('mcp__f7320332-8068-44ba-9e9e-18a5c7ce6e5a__get_message');
  assert.ok(f);
  assert.match(f.why, /per-install connector id/);
});

test('prose naming a server without a tool segment passes', () => {
  assert.equal(run('history of mcp__perplexity__ usage').length, 0);
});

test('the inline ignore marker suppresses a line', () => {
  assert.equal(run('mcp__nope__x <!-- mcp-ref-ignore -->').length, 0);
});

test('one bad ref on a line with a good one is still reported', () => {
  assert.equal(run('mcp__github__push_files and mcp__nope__x').length, 1);
});

test('line numbers are 1-based and point at the offending line', () => {
  const [f] = run('ok\nstill ok\nmcp__nope__x');
  assert.equal(f.line, 3);
});

test('the real asset tree has no unreachable MCP references', () => {
  // execFileSync throws on a non-zero exit, which is exactly the failure we want.
  const out = execFileSync(process.execPath, [SCRIPT], { cwd: REPO, encoding: 'utf8' });
  assert.match(out, /asset MCP refs OK/);
});

test('the script self-test passes', () => {
  const out = execFileSync(process.execPath, [SCRIPT, '--self-test'], { cwd: REPO, encoding: 'utf8' });
  assert.match(out, /self-test OK/);
  assert.doesNotMatch(out, /FAIL/);
});
