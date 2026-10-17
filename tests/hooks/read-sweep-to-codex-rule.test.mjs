// Unit + runner coverage for mcp/claude-userlevel/hooks/rules/read-sweep-to-codex.js:
// the 20th DISTINCT file read in a session triggers one reminder to hand sweeping to Codex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

import { runNode, freshSid, HOOKS_DIR } from './helpers.mjs';

const require = createRequire(import.meta.url);
const rule = require(path.join(HOOKS_DIR, 'rules', 'read-sweep-to-codex.js'));
const RUNNER = path.join(HOOKS_DIR, 'runner.js');

const read = (sid, file, host = 'claude') => rule.check({ host, sid, toolInput: { file_path: file } });

test('fires once on the 20th distinct file; repeats and path-case/slash variants do not count twice', () => {
  const sid = freshSid('reads');
  for (let i = 1; i < rule.READ_LIMIT; i++) {
    assert.equal(read(sid, `D:\\Work\\f${i}.md`), null);
    assert.equal(read(sid, `d:/work/F${i}.md`), null, 'same file, other spelling');
  }
  const res = read(sid, 'D:/Work/f20.md');
  assert.ok(res && res.context.length === 1);
  assert.match(res.context[0], /^\[Hook\]\[READ\] 本 session 已讀 20 個不同檔.*codex-oracle\.ps1 -Mode inspect.*只提這一次/);
  for (let i = 21; i < 60; i++) assert.equal(read(sid, `D:/Work/f${i}.md`), null, 'never again in this session');
});

test('sessions are independent; Codex host and a missing path are ignored', () => {
  const a = freshSid('a');
  const b = freshSid('b');
  for (let i = 1; i < 20; i++) read(a, `x${i}`);
  assert.equal(read(b, 'x20'), null, 'b has read one file, not twenty');
  assert.equal(read(freshSid('c'), 'y', 'codex'), null);
  assert.equal(rule.check({ host: 'claude', sid: freshSid('d'), toolInput: {} }), null);
});

test('through the real runner, PreToolUse Read delivers the reminder as additionalContext', () => {
  const sid = freshSid('runner');
  let r;
  for (let i = 1; i <= 20; i++) {
    r = runNode(RUNNER, { session_id: sid, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: `D:/Work/r${i}.md` } }, { args: ['PreToolUse'] });
    assert.equal(r.status, 0, r.stderr);
  }
  const out = JSON.parse(r.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /\[Hook\]\[READ\]/);
});
