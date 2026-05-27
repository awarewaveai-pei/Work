// PreToolUse on Write|Edit: inject recent git log before first file edit this session.
// Mechanizes M1 rule from AGENTS.md R0: "run git log --oneline -10 before every Edit"
// (root cause: 2026-05-22 14:38 re-work incident — parallel session had already fixed the issue)
//
// Behavior:
//   - Runs ONCE per session+date (flag file keyed by SID+date — no cross-day bleed)
//   - Atomic flag create with 'wx' (EEXIST = already done this session, skip) — no TOCTOU race
//   - Runs `git log --oneline -10` with cwd = file-being-edited's directory (correct repo context)
//   - Writes output to stderr (Claude sees it as pre-edit context)
//   - Never blocks; fail-open on git error or any exception
//
// SSOT: AGENTS.md R0 §禁止 "未跑 git log --oneline -10 即 Edit"
// Companion: _verify-shared.js (SID derivation, logFailOpen)

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const shared = require('./_verify-shared');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    let i;
    try { i = JSON.parse(d); } catch (_) { process.stdout.write(d); return; }

    const sid = shared.getSessionId(i);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const flagPath = path.join(os.tmpdir(), `claude-git-log-injected-${sid}-${today}.flag`);

    // Atomic flag create (wx = exclusive open, throws EEXIST if already present).
    // This prevents TOCTOU race in parallel PreToolUse hooks.
    try {
      fs.writeFileSync(flagPath, new Date().toISOString(), { encoding: 'utf8', flag: 'wx' });
    } catch (e) {
      if (e.code === 'EEXIST') { process.stdout.write(d); return; } // Already injected this session
      // Other FS error — try to proceed anyway (fail-open), log below
      shared.logFailOpen('git-log-injector flag', e);
    }

    // Use the file being edited as the git cwd, so we always get the right repo's log.
    // Falls back to process.cwd() if no file_path available.
    const filePath = i.tool_input?.file_path ||
      (Array.isArray(i.tool_input?.edits) && i.tool_input.edits[0]?.file_path) || null;
    const cwd = filePath ? path.dirname(filePath) : process.cwd();

    try {
      const log = execSync('git log --oneline -10', { encoding: 'utf8', timeout: 5000, cwd }).trim();
      process.stderr.write('[Hook] GIT LOG (recent 10 — check for parallel-session work before writing):\n');
      for (const line of log.split('\n').filter(Boolean)) {
        process.stderr.write(`[Hook]   ${line}\n`);
      }
    } catch (_) {
      // Not in a git repo or git unavailable — skip silently
    }
  } catch (e) {
    shared.logFailOpen('git-log-injector', e);
    process.stderr.write(`[Hook] WARN: git-log-injector exception (${e.code || e.message}) — see ~/.claude/verify-gate-failures.log\n`);
  }
  process.stdout.write(d);
});
