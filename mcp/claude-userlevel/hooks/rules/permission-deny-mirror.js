// Codex has no Claude permission layer, so Claude's permissions.deny list is
// enforced here for the Codex host only. The list is read at runtime from its
// single source (mcp/claude-userlevel/settings.template.json), never copied.
// Claude keeps enforcing it natively; running this for Claude would only
// duplicate that layer's messages.
//
// `Bash(<glob>)` entries match each command position (ctx.commandSegments);
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

module.exports = {
  check(ctx) {
    if (ctx.host !== 'codex') return null;
    const segs = ctx.toolName === 'Bash' ? (ctx.commandSegments || []) : [];
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
