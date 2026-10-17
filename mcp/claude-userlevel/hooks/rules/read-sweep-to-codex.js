// PreToolUse Read: when a session has read READ_LIMIT distinct files, remind the agent ONCE
// that further sweeping goes to Codex (AGENTS.md §5 讀法分級: 20+ 檔掃模式交 Codex).
// Measured 2026-10-17: 6 of 19 sessions in a week read >= 20 distinct files themselves and
// only 23 Codex inspect runs existed in total -- the rule was written, never triggered.
// Files the agent will edit or verify are still read whole by the agent; the line says so.
// State per session in os.tmpdir(); any I/O failure only loses the reminder.
const fs = require('fs');
const os = require('os');
const path = require('path');

const READ_LIMIT = 20;

function statePath(sid) {
  return path.join(os.tmpdir(), `claude-read-sweep-${String(sid).replace(/[^\w.-]/g, '_')}.json`);
}

module.exports = {
  READ_LIMIT,
  check(ctx) {
    if (ctx.host === 'codex') return null;
    const file = ctx.toolInput && ctx.toolInput.file_path;
    if (typeof file !== 'string' || !file) return null;
    const sp = statePath(ctx.sid);
    let st = { files: [], said: false };
    try { st = JSON.parse(fs.readFileSync(sp, 'utf8')); } catch (_) { /* first read */ }
    if (st.said) return null;
    const key = file.replace(/\\/g, '/').toLowerCase();
    if (!st.files.includes(key)) st.files.push(key);
    const due = st.files.length >= READ_LIMIT;
    if (due) st = { files: [], said: true };
    try { fs.writeFileSync(sp, JSON.stringify(st)); } catch (_) { /* non-fatal */ }
    if (!due) return null;
    return {
      context: [
        `[Hook][READ] 本 session 已讀 ${READ_LIMIT} 個不同檔。接下來若還要掃很多檔找模式，改交 Codex（用 ChatGPT 額度，不吃 Claude 額度）：powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex-oracle.ps1 -Mode inspect -Prompt "<問題，只要 file:line>"，回來的 file:line 用 Grep 驗真。要改／要驗證的檔仍自己整檔讀（AGENTS.md §5 讀法分級）。只提這一次。`,
      ],
    };
  },
};
