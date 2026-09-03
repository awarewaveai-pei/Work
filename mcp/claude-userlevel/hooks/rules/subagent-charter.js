const fs = require('fs');
const path = require('path');

// SubagentStart: every spawned agent receives the same durable engineering
// charter. Keep the text in one Markdown source shared by this hook and the
// generated native Codex agent bridges.
const CHARTER_PATH = path.resolve(__dirname, '..', '..', 'SUBAGENT_CHARTER.md');

module.exports = {
  check(ctx) {
    let charter;
    try {
      charter = fs.readFileSync(CHARTER_PATH, 'utf8').trim();
    } catch (e) {
      if (ctx && ctx.shared) ctx.shared.logFailOpen('subagent-charter', e);
      return null; // fail open: missing/unreadable charter never blocks a spawn
    }
    return { context: [`[Subagent Charter]\n${charter}`] };
  },
};
