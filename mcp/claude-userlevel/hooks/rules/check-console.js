// Stop: check for stray console.log in modified files. Verbatim port.
const { spawnSync } = require('child_process');
const fs = require('fs');

const EXCLUDED = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.config\.[jt]s$/, /scripts\//, /__tests__\//];

module.exports = {
  check(ctx) {
    const r = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], { encoding: 'utf8' });
    if (r.status !== 0) return null;

    const files = (r.stdout || '').trim().split('\n')
      .filter((f) => f && /\.[jt]sx?$/.test(f) && !EXCLUDED.some((p) => p.test(f)) && fs.existsSync(f));

    const warn = [];
    for (const f of files) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      const matches = [];
      lines.forEach((line, i) => {
        if (/console\.log\b/.test(line) && !/\/\//.test(line.split('console.log')[0])) {
          matches.push(i + 1);
        }
      });
      if (matches.length) warn.push(`[Hook] console.log in ${f} (lines: ${matches.slice(0, 5).join(', ')})`);
    }
    if (warn.length) warn.push('[Hook] Remove console.log before committing');
    return warn.length ? { warn } : null;
  },
};
