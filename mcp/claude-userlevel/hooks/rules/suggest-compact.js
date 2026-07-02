// Suggest /compact at logical intervals (~50 tool calls). Counter file name
// preserved; SID now comes from the unified derivation (ctx.sid).
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = {
  check(ctx) {
    const cf = path.join(os.tmpdir(), `claude-tool-count-${ctx.sid}`);
    let count = 1;
    try {
      count = parseInt(fs.readFileSync(cf, 'utf8').trim(), 10) + 1;
      if (isNaN(count) || count < 1) count = 1;
    } catch (_) { /* first call */ }
    try { fs.writeFileSync(cf, String(count)); } catch (_) { /* non-fatal */ }

    if (count === 50) {
      return { warn: ['[Hook] 50 tool calls reached — consider /compact if context is getting large'] };
    }
    if (count > 50 && (count - 50) % 25 === 0) {
      return { warn: [`[Hook] ${count} tool calls — good checkpoint for /compact`] };
    }
    return null;
  },
};
