// Repeat-failure guard (2026-09-04, operator: 「做什麼事失敗但重複嘗試一樣的方式非常多次…白浪費 token 和時間」).
//
// The SAME Bash command text failing twice in one session, then being sent a THIRD time unchanged, is
// blocked. "Same" is byte-for-byte after whitespace normalization -- a changed approach is by definition a
// different command and is never blocked. A deliberate identical re-run (external state changed, a file was
// created meanwhile) is allowed by putting `# RETRY-JUSTIFIED: <what changed>` on the first line; that marker
// line is stripped before hashing, so the justified re-run is recognised as the same command (first version
// of this rule hashed the marker in, which made the justification path unreachable -- caught by its own
// parity test, 2026-09-04).
//
// Three events, one state file per session (%TEMP%/claude-bash-failures-<sid>.json):
//   PostToolUseFailure (Bash)  -> count += 1 for the normalized command
//   PostToolUse        (Bash)  -> a success clears the command's entry (a command that eventually works is not a repeat)
//   PreToolUse         (Bash)  -> count >= 2 and no RETRY-JUSTIFIED marker -> BLOCK
//
// Deliberately narrow (exact text) so it has no false positives on legitimately different attempts; it does
// not try to detect "same idea, different wording" -- that stays a discipline rule in AGENTS.md §失敗重試紀律.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const BLOCK_AFTER_FAILURES = 2;
const JUSTIFY_LINE = /^\s*#\s*RETRY-JUSTIFIED:\s*\S.*$/m;

function stateFile(sid) {
  return path.join(os.tmpdir(), `claude-bash-failures-${String(sid || 'unknown').replace(/[^\w.-]/g, '_')}.json`);
}
function load(file) {
  try {
    if (!fs.existsSync(file)) return {};
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}
function save(file, state) {
  try { fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8'); } catch (e) { /* fail-open: a lost count never blocks work */ }
}
function stripJustification(command) {
  return String(command || '').replace(/\r\n/g, '\n').replace(JUSTIFY_LINE, '');
}
function keyOf(command) {
  const normalized = stripJustification(command).replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n').trim();
  return normalized ? crypto.createHash('sha1').update(normalized).digest('hex') : null;
}

module.exports = {
  check(ctx) {
    if (ctx.toolName !== 'Bash') return null;
    const command = ctx.command || '';
    const key = keyOf(command);
    if (!key) return null;
    const file = stateFile(ctx.sid);

    if (ctx.event === 'PostToolUseFailure') {
      const state = load(file);
      const prev = state[key] || { count: 0 };
      state[key] = { count: prev.count + 1, last: new Date().toISOString(), sample: stripJustification(command).trim().slice(0, 200) };
      save(file, state);
      const n = state[key].count;
      if (n >= BLOCK_AFTER_FAILURES) {
        return { warn: [`[Hook] this exact Bash command has now failed ${n}x this session -- read the error and change approach; an unchanged third attempt will be BLOCKED (repeat-failure-guard).`] };
      }
      return null;
    }

    if (ctx.event === 'PostToolUse') {
      const state = load(file);
      if (state[key]) { delete state[key]; save(file, state); }
      return null;
    }

    if (ctx.event === 'PreToolUse') {
      const state = load(file);
      const entry = state[key];
      if (!entry || entry.count < BLOCK_AFTER_FAILURES) return null;
      if (JUSTIFY_LINE.test(command)) {
        return { warn: [`[Hook] identical command re-run allowed by RETRY-JUSTIFIED marker (it failed ${entry.count}x before).`] };
      }
      return {
        block: [
          '',
          `[Hook] BLOCKED: this exact Bash command already failed ${entry.count}x this session (last ${entry.last}).`,
          `[Hook]   ${entry.sample.split('\n')[0].slice(0, 120)}`,
          '[Hook] Sending it unchanged a third time is the pattern the operator banned (AGENTS.md §失敗重試紀律).',
          '[Hook] Read the last error, change the approach (different command = never blocked), or -- only if the',
          '[Hook] world genuinely changed -- put `# RETRY-JUSTIFIED: <what changed>` on the first line.',
          '[Hook] SSOT: mcp/claude-userlevel/hooks/rules/repeat-failure-guard.js',
        ],
      };
    }
    return null;
  },
};
