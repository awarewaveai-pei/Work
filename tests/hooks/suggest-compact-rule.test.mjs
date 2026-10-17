// Direct unit coverage for mcp/claude-userlevel/hooks/rules/suggest-compact.js.
// 2026-10-15: context measured from the transcript on UserPromptSubmit (replaced a
// tool-call counter). 2026-10-17: silent below 80% and each reminder once per session,
// because the every-turn line made agents repeat /clear and /compact on every reply.
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

// A Claude 4 era id: not in the window table, so the 200k assumption applies.
const OLD_MODEL = 'claude-opus-4-1-20250805';
const BOUNDARY = JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'manual' } });

function assistant({ model = OLD_MODEL, inp = 0, create = 0, read = 0, out = 0, sidechain = false } = {}) {
  return JSON.stringify({
    type: 'assistant',
    isSidechain: sidechain,
    message: { model, usage: { input_tokens: inp, cache_creation_input_tokens: create, cache_read_input_tokens: read, output_tokens: out } },
  });
}

function writeTranscript(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-compact-'));
  const p = path.join(dir, 'session.jsonl');
  fs.writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

function check(transcriptPath, { sid = freshSid('ctx'), ...extra } = {}) {
  const failOpen = [];
  const res = rule.check({
    host: 'claude',
    sid,
    payload: { transcript_path: transcriptPath },
    shared: { logFailOpen: (...a) => failOpen.push(a) },
    ...extra,
  });
  return { res, failOpen };
}

const line = (p, extra) => check(p, extra).res.context[0];

test('silent below 80%: no line at all, so agents have nothing to repeat', () => {
  assert.equal(check(writeTranscript([assistant({ read: 158000 })])).res, null); // 79% of 200k
  assert.equal(check(writeTranscript([assistant({ model: 'claude-opus-5-5', read: 790000 })])).res, null);
});

test('>= 80% and never compacted: suggest /compact once; sums the LAST non-sidechain usage', () => {
  const p = writeTranscript([
    assistant({ inp: 40000, create: 40000, read: 80000, out: 2000 }), // 162k = 81%
    assistant({ inp: 10000, sidechain: true }), // a later subagent record must not win
  ]);
  const l = line(p);
  assert.match(l, /^\[Hook\]\[CTX\] 162k tokens ≈ 81%（視窗 200k，假定）→ 任務未完就在回覆首行建議 \/compact 一次/);
  assert.match(l, /只提這一次/);
});

test('>= 80% after a compaction: /tomo then /clear with the opening-line format spelled out', () => {
  const l = line(writeTranscript([assistant({ read: 50000 }), BOUNDARY, assistant({ read: 170000 })]));
  assert.match(l, /≈ 85%.*已壓過一次又滿了：先 \/tomo.*\/clear.*續做 <任務>：讀 <SSOT 路徑>/);
});

test('once per session: the same reminder is not repeated; after a compaction the /clear reminder still fires once', () => {
  const sid = freshSid('once');
  const p = writeTranscript([assistant({ read: 170000 })]);
  assert.match(line(p, { sid }), /\/compact/);
  assert.equal(check(p, { sid }).res, null, 'second turn at the same level: silent');
  const q = writeTranscript([assistant({ read: 170000 }), BOUNDARY, assistant({ read: 165000 })]);
  assert.match(line(q, { sid }), /\/tomo/);
  assert.equal(check(q, { sid }).res, null);
});

test('window: Claude 5 family and [1m] ids = 1M; unknown ids 200k, bumped to 1M when exceeded; env overrides', () => {
  assert.deepEqual(rule.windowFor('claude-fable-5-1'), { size: 1000000, source: 'model' });
  assert.deepEqual(rule.windowFor('claude-sonnet-5'), { size: 1000000, source: 'model' });
  assert.deepEqual(rule.windowFor('claude-opus-4-1-20250805[1m]'), { size: 1000000, source: 'model' });
  assert.deepEqual(rule.windowFor(OLD_MODEL, 150000), { size: 200000, source: '假定' });
  assert.equal(rule.windowFor(OLD_MODEL, 300000).size, 1000000);
  process.env.CLAUDE_CONTEXT_WINDOW = '500000';
  try {
    assert.deepEqual(rule.windowFor('claude-fable-5-1'), { size: 500000, source: 'env' });
  } finally {
    delete process.env.CLAUDE_CONTEXT_WINDOW;
  }
});

test('silent null: no transcript_path, transcript not on disk yet, no assistant record yet, Codex host', () => {
  assert.equal(check(undefined).res, null);
  const missing = check(path.join(os.tmpdir(), `suggest-compact-missing-${freshSid('x')}.jsonl`));
  assert.equal(missing.res, null);
  assert.equal(missing.failOpen.length, 0, 'ENOENT is the normal first-prompt state, not a fail-open');
  assert.equal(check(writeTranscript([JSON.stringify({ type: 'user', message: {} })])).res, null);
  assert.equal(check(writeTranscript([assistant({ read: 180000 })]), { host: 'codex' }).res, null);
});

test('tail read: a cut first record and a > 1 MiB record after the last assistant record both still resolve', () => {
  const junk = JSON.stringify({ type: 'user', message: { content: 'x'.repeat(1200000) } });
  assert.match(line(writeTranscript([junk, assistant({ read: 170000 })])), /170k tokens ≈ 85%/);
  assert.match(line(writeTranscript([assistant({ read: 170000 }), junk])), /170k tokens ≈ 85%/);
});

test('through the real runner, UserPromptSubmit prints the line on plain stdout (the shape Claude Code injects)', () => {
  const p = writeTranscript([assistant({ read: 165000, out: 1000 })]);
  const r = runNode(
    RUNNER,
    { session_id: freshSid('ctx'), hook_event_name: 'UserPromptSubmit', prompt: '繼續', transcript_path: p },
    { args: ['UserPromptSubmit'] },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[Hook\]\[CTX\] 166k tokens ≈ 83%（視窗 200k，假定）→ 任務未完就在回覆首行建議 \/compact 一次/);
});
