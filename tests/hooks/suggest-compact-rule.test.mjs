// Direct unit coverage for mcp/claude-userlevel/hooks/rules/suggest-compact.js
// (2026-10-15 rewrite: context measured from the transcript and injected on
// UserPromptSubmit, replacing the tool-call counter that warned every 50
// Write/Edit calls on stderr where the operator never saw it).
//
// Covers: the last non-sidechain assistant record wins; the 50% / 80% bands;
// window resolution (Claude 5 family and [1m] ids = 1M, CLAUDE_CONTEXT_WINDOW,
// the 200k assumption bumped to 1M once a measurement exceeds it); silent null
// for a missing path, a transcript not yet on disk, no assistant record, and
// the Codex host; the 1 MiB tail read survives a record cut at the boundary;
// and the real runner prints the line on plain stdout for UserPromptSubmit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { runNode, freshSid, HOOKS_DIR } from './helpers.mjs';

const require = createRequire(import.meta.url);
const rule = require(path.join(HOOKS_DIR, 'rules', 'suggest-compact.js'));
const RUNNER = path.join(HOOKS_DIR, 'runner.js');

// Default model id is a Claude 4 era id: not in the window table, so the 200k assumption applies.
const OLD_MODEL = 'claude-opus-4-1-20250805';

function assistant({ model = OLD_MODEL, inp = 0, create = 0, read = 0, out = 0, sidechain = false } = {}) {
  return JSON.stringify({
    type: 'assistant',
    isSidechain: sidechain,
    message: {
      model,
      usage: { input_tokens: inp, cache_creation_input_tokens: create, cache_read_input_tokens: read, output_tokens: out },
    },
  });
}

function writeTranscript(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-compact-'));
  const p = path.join(dir, 'session.jsonl');
  fs.writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

function check(transcriptPath, extra = {}) {
  const failOpen = [];
  const res = rule.check({
    host: 'claude',
    payload: { transcript_path: transcriptPath },
    shared: { logFailOpen: (...a) => failOpen.push(a) },
    ...extra,
  });
  return { res, failOpen };
}

const line = (p, extra) => check(p, extra).res.context[0];

test('suggest-compact: sums the LAST non-sidechain assistant usage (input + cache create + cache read + output); a later sidechain record is ignored', () => {
  const p = writeTranscript([
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
    assistant({ inp: 1000, create: 2000, read: 3000, out: 4000 }), // 10k — the one that counts
    assistant({ inp: 150000, sidechain: true }), // subagent record: later and bigger, must not win
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'next' } }),
  ]);
  const { res, failOpen } = check(p);
  assert.ok(res && Array.isArray(res.context) && res.context.length === 1, 'one context line');
  assert.match(res.context[0], /^\[Hook\]\[CTX\] 10k tokens ≈ 5%（視窗 200k，假定）→ OK/);
  assert.match(res.context[0], /AGENTS\.md §5 Session 切換/);
  assert.equal(failOpen.length, 0);
});

test('suggest-compact: bands on the assumed 200k window — < 50% OK, >= 50% /compact, >= 80% /tomo then /clear', () => {
  assert.match(line(writeTranscript([assistant({ read: 98000 })])), /≈ 49%.*→ OK/);
  assert.match(line(writeTranscript([assistant({ read: 100000 })])), /≈ 50%.*\/compact/);
  assert.match(line(writeTranscript([assistant({ read: 158000 })])), /≈ 79%.*\/compact/);
  assert.match(line(writeTranscript([assistant({ read: 160000 })])), /≈ 80%.*\/tomo.*\/clear/);
});

test('suggest-compact: window table — Claude 5 family ids and [1m] ids are 1M (evidence 2026-10-15: get_usage 1,000,000 on fable-5-1; 823k measured on opus-5-5)', () => {
  assert.match(line(writeTranscript([assistant({ model: 'claude-fable-5-1', read: 300000 })])), /300k tokens ≈ 30%（視窗 1M，model）→ OK/);
  assert.match(line(writeTranscript([assistant({ model: 'claude-opus-5-5', read: 823000 })])), /823k tokens ≈ 82%（視窗 1M，model）→ .*\/tomo/);
  assert.match(line(writeTranscript([assistant({ model: 'claude-sonnet-5', read: 477000 })])), /≈ 48%（視窗 1M，model）→ OK/);
  assert.match(line(writeTranscript([assistant({ model: 'claude-opus-4-1-20250805[1m]', read: 500000 })])), /≈ 50%（視窗 1M，model）→ .*\/compact/);
});

test('suggest-compact: an unknown model id is assumed 200k, and the assumption is bumped to 1M once the measurement exceeds it', () => {
  assert.match(line(writeTranscript([assistant({ read: 150000 })])), /≈ 75%（視窗 200k，假定）/);
  assert.match(line(writeTranscript([assistant({ read: 300000 })])), /300k tokens ≈ 30%（視窗 1M，推（已超過假定 200k））→ OK/);
});

test('suggest-compact: CLAUDE_CONTEXT_WINDOW overrides the table and the assumption', () => {
  const p = writeTranscript([assistant({ model: 'claude-fable-5-1', read: 300000 })]);
  process.env.CLAUDE_CONTEXT_WINDOW = '500000';
  try {
    assert.match(line(p), /≈ 60%（視窗 500k，env）→ .*\/compact/);
  } finally {
    delete process.env.CLAUDE_CONTEXT_WINDOW;
  }
});

test('suggest-compact: silent null — no transcript_path, transcript not on disk yet, no assistant record yet, Codex host', () => {
  assert.equal(check(undefined).res, null);
  const missing = check(path.join(os.tmpdir(), `suggest-compact-missing-${freshSid('x')}.jsonl`));
  assert.equal(missing.res, null);
  assert.equal(missing.failOpen.length, 0, 'ENOENT is the normal first-prompt state, not a fail-open');
  assert.equal(check(writeTranscript([JSON.stringify({ type: 'user', message: {} })])).res, null);
  assert.equal(check(writeTranscript([assistant({ read: 180000 })]), { host: 'codex' }).res, null);
});

test('suggest-compact: a transcript longer than the 1 MiB tail still resolves (the record cut at the tail boundary is skipped)', () => {
  const junk = JSON.stringify({ type: 'user', message: { content: 'x'.repeat(1200000) } });
  const p = writeTranscript([junk, assistant({ read: 50000 })]);
  assert.match(line(p), /50k tokens ≈ 25%/);
});

test('suggest-compact: a > 1 MiB record AFTER the last assistant record does not hide it — the tail grows instead of going silent (Codex finding 2026-10-15)', () => {
  const junk = JSON.stringify({ type: 'user', message: { content: 'x'.repeat(1200000) } });
  const p = writeTranscript([assistant({ read: 170000 }), junk]);
  assert.match(line(p), /170k tokens ≈ 85%.*\/tomo/);
});

test('suggest-compact: through the real runner, UserPromptSubmit prints the line on plain stdout (the shape Claude Code injects)', () => {
  const p = writeTranscript([assistant({ read: 120000, out: 1000 })]);
  const r = runNode(
    RUNNER,
    { session_id: freshSid('ctx'), hook_event_name: 'UserPromptSubmit', prompt: '繼續', transcript_path: p },
    { args: ['UserPromptSubmit'] },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[Hook\]\[CTX\] 121k tokens ≈ 61%（視窗 200k，假定）→ 任務未完：首行建議 \/compact/);
});
