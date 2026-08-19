// Stop: batch format (Prettier) + typecheck (tsc) all JS/TS files edited this
// response (accumulated by rules/accumulator.js under the same ctx.sid key).
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = {
  check(ctx) {
    const af = path.join(os.tmpdir(), `claude-edited-${ctx.sid}.txt`);
    let raw;
    try { raw = fs.readFileSync(af, 'utf8'); } catch (_) { return null; }
    try { fs.unlinkSync(af); } catch (_) { /* consumed anyway */ }

    const files = [...new Set(raw.split('\n').map((l) => l.trim()).filter(Boolean))]
      .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f) && fs.existsSync(f));
    if (!files.length) return null;

    const isWin = process.platform === 'win32';
    const prettierBin = path.join(ctx.cwd, 'node_modules', '.bin', isWin ? 'prettier.cmd' : 'prettier');
    if (fs.existsSync(prettierBin)) {
      try {
        spawnSync(prettierBin, ['--write', ...files], { shell: isWin, stdio: 'pipe', timeout: 60000 });
      } catch (_) { /* formatting is best-effort */ }
    }

    const tsFiles = files.filter((f) => /\.(ts|tsx)$/.test(f));
    if (!tsFiles.length) return null;
    const warn = [];
    try {
      const npx = isWin ? 'npx.cmd' : 'npx';
      const r = spawnSync(npx, ['tsc', '--noEmit', '--pretty', 'false'], {
        shell: isWin, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000,
      });
      if (r.status !== 0) {
        const lines = ((r.stdout || '') + (r.stderr || '')).split('\n');
        for (const f of tsFiles) {
          const rel = path.relative(ctx.cwd, f);
          const relevant = lines.filter((l) => l.includes(f) || l.includes(rel)).slice(0, 3);
          if (relevant.length) {
            warn.push(`[Hook] TS errors in ${path.basename(f)}:`, ...relevant);
          }
        }
      }
    } catch (_) { /* tsc unavailable — skip */ }
    return warn.length ? { warn } : null;
  },
};
