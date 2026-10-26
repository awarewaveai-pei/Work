// Codex has no Claude permission layer, so Claude's permissions.deny list is
// enforced here for the Codex host only. The list is read at runtime from its
// single source (mcp/claude-userlevel/settings.template.json), never copied.
// Claude keeps enforcing it natively; running this for Claude would only
// duplicate that layer's messages.
//
// `Bash(<glob>)` entries match each command position (segments() below);
// a trailing " *" also matches the bare command, so `Bash(git branch *)` blocks
// `git branch` as well. Other entries are exact tool names.

const fs = require('fs');
const path = require('path');

const TEMPLATE = path.join(__dirname, '..', '..', 'settings.template.json');
let cache = null;

function globToRegex(glob) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let body = glob;
  let tail = '';
  if (body.endsWith(' *')) { body = body.slice(0, -2); tail = '(?:\\s.*)?'; }
  return new RegExp('^' + body.split('*').map(esc).join('.*') + tail + '$', 's');
}

function denyList() {
  if (cache) return cache;
  const raw = fs.readFileSync(TEMPLATE, 'utf8').replace(/^﻿/, '');
  const deny = ((JSON.parse(raw).permissions || {}).deny) || [];
  cache = deny.map((entry) => {
    const m = /^Bash\((.*)\)$/.exec(entry);
    return m ? { entry, bash: globToRegex(m[1].trim()) } : { entry, tool: entry };
  });
  return cache;
}

// Claude's matcher reads a quoted argument as one word: `ssh h 'a; sudo b'` runs
// ssh, not sudo. So && || ; | split only outside quotes -- but a quote the
// mirror sees and the shell does not would hide a real command, so:
// - each line is lexed alone and must end outside quotes, else that line is
//   split quote-blind (a `# it's` comment or heredoc body cannot carry a
//   quote across lines and swallow the next command);
// - the shell is unknown (Codex wraps PowerShell, payloads may be bash), so
//   every line is lexed by BOTH grammars and the segments are unioned.
// commandExpanded already carries bash -c / -Command payloads as own lines.
const GRAMMARS = [
  { single: "'", double: '"', esc: '\\', ansi: true }, // bash: $'..' takes \ escapes
  { single: "'‘’‚‛", double: '"“”„', esc: '`' }, // PowerShell
];
const OPS = /&&|\|\||;|\|/;

function splitLine(line, g) {
  const segs = [];
  let cur = '';
  let quote = ''; // '', 'single', 'double', 'ansi'
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const escapes = quote === 'double' || quote === 'ansi' || !quote;
    if (escapes && c === g.esc) { cur += line.slice(i, i + 2); i++; continue; }
    if (quote) {
      if ((quote === 'double' ? g.double : g.single).includes(c)) quote = '';
      cur += c;
      continue;
    }
    if (g.ansi && c === '$' && line[i + 1] === "'") { quote = 'ansi'; cur += "$'"; i++; continue; }
    if (g.single.includes(c)) { quote = 'single'; cur += c; continue; }
    if (g.double.includes(c)) { quote = 'double'; cur += c; continue; }
    const op = OPS.exec(line.slice(i, i + 2));
    if (!op || op.index !== 0) { cur += c; continue; }
    segs.push(cur);
    cur = '';
    i += op[0].length - 1;
  }
  if (quote) return line.split(OPS);
  segs.push(cur);
  return segs;
}

function segments(ctx) {
  const lines = String(ctx.commandExpanded || '').split('\n');
  return GRAMMARS.flatMap((g) => lines.flatMap((l) => splitLine(l, g)))
    .map((s) => s.trim()).filter(Boolean);
}

module.exports = {
  check(ctx) {
    if (ctx.host !== 'codex') return null;
    const segs = ctx.toolName === 'Bash' ? segments(ctx) : [];
    for (const d of denyList()) {
      const hit = d.tool ? ctx.toolName === d.tool : segs.some((s) => d.bash.test(s));
      if (hit) {
        return { block: [
          `[Hook] BLOCKED: matches Claude permissions.deny "${d.entry}" (single source: mcp/claude-userlevel/settings.template.json), enforced for Codex by permission-deny-mirror.`,
          '[Hook] This operation is forbidden for every agent in this workspace; ask the operator instead.',
        ] };
      }
    }
    return null;
  },
};
