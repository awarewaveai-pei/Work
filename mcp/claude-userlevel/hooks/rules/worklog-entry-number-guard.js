// worklog-entry-number-guard.js -- BLOCK an Edit/Write on agency-os/WORKLOG.md that introduces a
// `## <date>（續N）` header whose (date, N) already exists in the file (Edit) or twice in the content (Write).
//
// WHY (2026-09-23): eight 續 numbers were claimed twice in one day by concurrent sessions that each picked
// "max + 1" before writing; the duplicates then had to be renumbered by hand and entries got mis-referenced.
// scripts/worklog-insert-entry.py assigns the number at write time; this rule makes the hand-picked path fail
// closed instead of relying on everyone remembering the script.
const fs = require('fs');

const HDR = /^## (\d{4}-\d{2}-\d{2})（續(\d+)）/gm;

function headers(text) {
  const out = [];
  if (!text) return out;
  let m;
  HDR.lastIndex = 0;
  while ((m = HDR.exec(String(text))) !== null) out.push(`${m[1]}/${m[2]}`);
  return out;
}

function isWorklog(filePath) {
  return /(^|[\\/])agency-os[\\/]WORKLOG\.md$/i.test(String(filePath || ''));
}

module.exports = {
  headers,
  check(ctx) {
    if (ctx.event !== 'PreToolUse') return null;
    const ti = ctx.toolInput || {};
    const filePath = ti.file_path || ti.filePath || (ctx.files && ctx.files[0]) || '';
    if (!isWorklog(filePath)) return null;
    try {
      let dup = [];
      if (ctx.toolName === 'Write') {
        const seen = new Set();
        for (const k of headers(ti.content)) { if (seen.has(k)) dup.push(k); seen.add(k); }
      } else {
        const edits = Array.isArray(ti.edits) ? ti.edits : [{ old_string: ti.old_string, new_string: ti.new_string }];
        const introduced = [];
        for (const e of edits) {
          const before = new Set(headers(e.old_string));
          for (const k of headers(e.new_string)) if (!before.has(k)) introduced.push(k);
        }
        if (!introduced.length) return null;
        let current = '';
        try { current = fs.readFileSync(filePath, 'utf8'); } catch (_) { return null; } // new file / unreadable -> nothing to compare
        const existing = new Set(headers(current));
        const seen = new Set();
        for (const k of introduced) { if (existing.has(k) || seen.has(k)) dup.push(k); seen.add(k); }
      }
      if (!dup.length) return null;
      return {
        block: [
          '[Hook] BLOCKED: WORKLOG entry number already taken (concurrent sessions pick the same "max+1"):',
          ...dup.slice(0, 8).map((k) => `[Hook]     ## ${k.replace('/', '（續')}）`),
          '[Hook]   Write the entry to a file with the placeholder 續NNN and insert it with:',
          '[Hook]     python scripts/worklog-insert-entry.py <entry.md>   (assigns the next free number at write time)',
        ],
      };
    } catch (e) {
      ctx.shared.logFailOpen('worklog-entry-number-guard', e);
      return null;
    }
  },
};
