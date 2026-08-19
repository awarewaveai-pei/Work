// Find the sibling test file for an edited source file and run it
// (vitest preferred, jest fallback). Non-blocking. Verbatim port.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = {
  check(ctx) {
    const fp = ctx.toolInput.file_path || '';
    if (!fp || !/\.(ts|tsx|js|jsx)$/.test(fp)) return null;
    if (/\.(test|spec)\.[jt]sx?$/.test(fp)) return null;
    if (!fs.existsSync(fp)) return null;

    const dir = path.dirname(fp);
    const base = path.basename(fp).replace(/\.(ts|tsx|js|jsx)$/, '');
    const candidates = [
      path.join(dir, `${base}.test.ts`),
      path.join(dir, `${base}.test.tsx`),
      path.join(dir, `${base}.test.js`),
      path.join(dir, `${base}.spec.ts`),
      path.join(dir, `${base}.spec.tsx`),
      path.join(dir, `${base}.spec.js`),
      path.join(dir, '__tests__', `${base}.test.ts`),
      path.join(dir, '__tests__', `${base}.test.tsx`),
    ];
    const testFile = candidates.find((f) => fs.existsSync(f));
    if (!testFile) return null;

    const cwd = ctx.cwd;
    const isWin = process.platform === 'win32';
    const binDir = path.join(cwd, 'node_modules', '.bin');
    const vitestBin = path.join(binDir, isWin ? 'vitest.cmd' : 'vitest');
    const jestBin = path.join(binDir, isWin ? 'jest.cmd' : 'jest');

    let cmd, args;
    if (fs.existsSync(vitestBin)) {
      cmd = vitestBin;
      args = ['run', testFile, '--reporter=basic'];
    } else if (fs.existsSync(jestBin)) {
      cmd = jestBin;
      args = [testFile, '--no-coverage', '--silent'];
    } else {
      return null;
    }

    const r = spawnSync(cmd, args, { shell: isWin, encoding: 'utf8', timeout: 60000, cwd });
    if (r.status !== 0) {
      const out = ((r.stdout || '') + (r.stderr || '')).split('\n').slice(0, 30).join('\n');
      return { warn: [`[Hook] Tests failing in ${path.basename(testFile)}:`, out] };
    }
    return null;
  },
};
