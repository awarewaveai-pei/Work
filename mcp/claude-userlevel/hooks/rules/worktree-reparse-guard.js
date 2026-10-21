// Block `git worktree remove <path>` when the worktree contains a junction or
// symlink directory. lstat is deliberate: never follow the link we are about
// to tell the operator to remove. The runner owns fail-open logging if this
// filesystem walk throws.
const fs = require('fs');
const path = require('path');

const MAX_DEPTH = 6;

function isGit(token) {
  return /^(?:git|git\.exe)$/i.test(path.basename(token));
}

function targetFromSegment(segment, shared) {
  const tokens = shared.tokenizeQuoted(segment);
  if (!tokens.length) return null;

  let i = 0;
  while (i < tokens.length && /^(?:sudo|command|exec|env)$/i.test(tokens[i])) i += 1;
  if (!isGit(tokens[i] || '')) return null;
  const args = tokens.slice(i + 1);
  const worktree = args.findIndex((token) => token.toLowerCase() === 'worktree');
  if (worktree < 0 || (args[worktree + 1] || '').toLowerCase() !== 'remove') return null;

  for (let j = worktree + 2; j < args.length; j += 1) {
    if (args[j] === '--') return args[j + 1] || null;
    if (args[j].startsWith('-')) continue;
    return args[j];
  }
  return null;
}

function resolveTarget(raw, baseDir) {
  let target = String(raw == null ? '' : raw).trim().replace(/^['"]|['"]$/g, '');
  const mingw = /^\/([a-zA-Z])(\/.*)?$/.exec(target);
  const wsl = !mingw && /^\/mnt\/([a-zA-Z])(\/.*)?$/.exec(target);
  if (mingw) target = `${mingw[1]}:${mingw[2] || '/'}`;
  else if (wsl) target = `${wsl[1]}:${wsl[2] || '/'}`;
  else if (/^\//.test(target) && process.platform === 'win32') return null;
  const hasDrive = /^[a-zA-Z]:/.test(target);
  return path.resolve((path.isAbsolute(target) || hasDrive) ? target : path.join(baseDir, target));
}

function findReparsePoint(root) {
  const rootStat = fs.lstatSync(root);
  if (rootStat.isSymbolicLink()) return root;
  if (!rootStat.isDirectory()) return null;

  const queue = [{ dir: root, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    if (depth >= MAX_DEPTH) continue;
    for (const name of fs.readdirSync(dir)) {
      const child = path.join(dir, name);
      const stat = fs.lstatSync(child);
      if (stat.isSymbolicLink()) return child;
      if (stat.isDirectory()) queue.push({ dir: child, depth: depth + 1 });
    }
  }
  return null;
}

function removeCommand(link) {
  const quoted = String(link).replace(/'/g, "''");
  return `powershell -NoProfile -Command "[IO.Directory]::Delete('${quoted}')"`;
}

module.exports = {
  check(ctx) {
    if (!ctx.command) return null;
    const segments = ctx.commandSegments || [];
    for (const segment of segments) {
      const rawTarget = targetFromSegment(segment, ctx.shared);
      if (!rawTarget) continue;
      const target = resolveTarget(rawTarget, ctx.cwd);
      if (!target) continue;
      const link = findReparsePoint(target);
      if (!link) continue;
      return {
        block: [
          `[Hook] BLOCKED: git worktree remove target contains a junction/symlink directory: ${link}`,
          `[Hook] Remove the junction/symlink first, then re-issue: ${removeCommand(link)}`,
        ],
      };
    }
    return null;
  },
  findReparsePoint,
  targetFromSegment,
};
