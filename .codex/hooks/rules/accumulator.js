// Accumulate edited JS/TS file paths for batch format+typecheck at Stop.
// SID now comes from the unified derivation (ctx.sid) — paired with
// rules/batch-format.js which reads the same key.
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = {
  check(ctx) {
    const af = path.join(os.tmpdir(), `claude-edited-${ctx.sid}.txt`);
    for (const fp of ctx.files) {
      if (/\.(ts|tsx|js|jsx)$/.test(fp)) {
        fs.appendFileSync(af, fp + '\n');
      }
    }
    return null;
  },
};
