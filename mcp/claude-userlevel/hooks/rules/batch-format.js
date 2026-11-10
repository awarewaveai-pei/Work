// Stop: batch format (Prettier) + typecheck (tsc) all JS/TS files edited this
// response (accumulated by rules/accumulator.js under the same ctx.sid key).
//
// Formatting invariant: a file is rewritten ONLY when its own project declares
// a Prettier config (`prettier --find-config-path <file>` succeeds), using the
// prettier installed in the nearest node_modules above THAT FILE (not the
// session cwd). No config = skip; never format with guessed defaults.
// Incident 2026-11-10: video-workbench has prettier as a devDependency but no
// config, and a one-line edit reflowed tools-editor.js 120→80 cols (+1300 lines).
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Nearest ancestor of `dir` with node_modules/prettier → { root, cli } or null.
// The CLI is run as `node <bin>` so no .cmd / shell quoting is involved.
function findPrettier(dir, cache) {
  const seen = [];
  let cur = dir;
  for (;;) {
    if (cache.has(cur)) { const hit = cache.get(cur); for (const s of seen) cache.set(s, hit); return hit; }
    seen.push(cur);
    let hit = null;
    try {
      const pkgDir = path.join(cur, 'node_modules', 'prettier');
      const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin.prettier;
      const cli = bin && path.join(pkgDir, bin);
      if (cli && fs.existsSync(cli)) hit = { root: cur, cli };
    } catch (_) { /* no prettier here */ }
    const parent = path.dirname(cur);
    if (hit || parent === cur) { for (const s of seen) cache.set(s, hit); return hit; }
    cur = parent;
  }
}

// Nearest ancestor holding .git (dir or worktree file) = the file's own repo.
function findRepoRoot(dir) {
  for (let cur = dir; ; cur = path.dirname(cur)) {
    if (fs.existsSync(path.join(cur, '.git'))) return cur;
    if (path.dirname(cur) === cur) return null;
  }
}

// Prettier searches up to the drive root, so a stray D:\.prettierrc or
// ~/.prettierrc would "configure" every project; the found config must sit
// inside the file's own repo (or, outside git, the prettier project root).
function hasPrettierConfig(p, file) {
  const r = spawnSync(process.execPath, [p.cli, '--find-config-path', file], {
    cwd: p.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000,
  });
  const found = r.status === 0 && (r.stdout || '').trim().split(/\r?\n/).pop();
  if (!found) return false;
  const boundary = findRepoRoot(path.dirname(file)) || p.root;
  const rel = path.relative(boundary, path.resolve(p.root, found));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

module.exports = {
  check(ctx) {
    const af = path.join(os.tmpdir(), `claude-edited-${ctx.sid}.txt`);
    let raw;
    try { raw = fs.readFileSync(af, 'utf8'); } catch (_) { return null; }
    try { fs.unlinkSync(af); } catch (_) { /* consumed anyway */ }

    const files = [...new Set(raw.split('\n').map((l) => l.trim()).filter(Boolean))]
      .map((f) => path.resolve(ctx.cwd || process.cwd(), f))
      .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f) && fs.existsSync(f));
    if (!files.length) return null;

    const isWin = process.platform === 'win32';
    const prettierCache = new Map();
    const configCache = new Map(); // dir -> bool (config discovery depends on the directory only)
    const groups = new Map(); // cli -> { p, files }
    for (const f of files) {
      try {
        const dir = path.dirname(f);
        const p = findPrettier(dir, prettierCache);
        if (!p) continue;
        if (!configCache.has(dir)) configCache.set(dir, hasPrettierConfig(p, f));
        if (!configCache.get(dir)) continue;
        if (!groups.has(p.cli)) groups.set(p.cli, { p, files: [] });
        groups.get(p.cli).files.push(f);
      } catch (_) { /* formatting is best-effort */ }
    }
    for (const { p, files: group } of groups.values()) {
      try {
        spawnSync(process.execPath, [p.cli, '--write', ...group], { cwd: p.root, stdio: 'pipe', timeout: 60000 });
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
