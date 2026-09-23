#!/usr/bin/env node
/**
 * Does the dependency tree physically present in a node_modules directory match what a given
 * package-lock.json declares?
 *
 * Why this exists (2026-09-23): verify-head-typecheck.ps1 used to junction the LOCAL working
 * copy's node_modules into a worktree of an arbitrary ref and guard it with nothing but
 * Test-Path. Directory existence is not the invariant -- "installed set == the ref's lockfile"
 * is. Same bug class that kept prod auto-deploy red all day (sg-deploy.sh only ran npm install
 * when node_modules was entirely absent, so a commit that ADDED pixelmatch never got it).
 *
 * The first cut of this file compared the ref's lockfile against node_modules/.package-lock.json,
 * npm's hidden lockfile. Codex review (2026-09-23) rejected that as moving the trust boundary
 * rather than removing it: the hidden lockfile records what npm believes it installed, so a
 * package directory deleted or mutated afterwards still reads as in sync while tsc resolves
 * something else. So this walks the real directories and reads each package's own package.json.
 * Costs a few hundred ms against a ~15s run -- the index buys nothing worth that trade.
 *
 * This is .mjs, not inline PowerShell, for two reasons: Windows PowerShell 5.1 ConvertFrom-Json
 * throws on a lockfile outright (packages has a "" key for the root entry and 5.1 cannot build a
 * PSObject property with an empty name), and Codex containers have node but no pwsh.
 *
 * What this does NOT prove, deliberately (Codex review round 4, 2026-09-23): that an installed
 * package's CONTENTS match the registry tarball. It compares the package set and versions, not
 * bytes -- a package mutated in place while keeping its name and version passes. Proving content
 * equivalence means re-deriving integrity for every package, which is npm ci, which is what
 * verify-head-typecheck.ps1 -Install already runs. Reach for that switch when the local tree is
 * suspect rather than trusted-but-stale.
 *
 * Usage: node compare-installed-deps.mjs <declared-lockfile> <node_modules-dir>
 * Exit 0 = in sync, 1 = drift (details on stdout), 2 = cannot compare.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const [declaredPath, modulesDir] = process.argv.slice(2);
if (!declaredPath || !modulesDir) {
  console.error("usage: compare-installed-deps.mjs <declared-lockfile> <node_modules-dir>");
  process.exit(2);
}

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

/* ---------- side 1: what the ref declares ---------- */

let lock;
try {
  lock = JSON.parse(readFileSync(declaredPath, "utf8"));
} catch (err) {
  fail(`cannot read declared lockfile at ${declaredPath}: ${err.message}`);
}
if (!lock.packages || typeof lock.packages !== "object") {
  fail(`declared lockfile at ${declaredPath} has no "packages" map (lockfileVersion < 2?)`);
}

/**
 * Optional entries are excluded from both directions. npm legitimately skips optionalDependencies
 * that do not apply to this platform -- on Windows this repo's lockfile lists 86 such entries
 * (@esbuild/linux-*, @next/swc-darwin-*, ...) that will never be installed here, and every
 * os/cpu-restricted entry in it is also flagged optional. Requiring them would make every run
 * fail with fake drift; treating them as "extra" when they ARE installed would do the same in the
 * other direction, which is why declaredAny keeps them.
 */
const declaredRequired = new Map(); // key -> version, or null when the lockfile states none
const declaredAny = new Set();      // every declared key, optional included
for (const [key, meta] of Object.entries(lock.packages)) {
  if (key === "") continue;                       // the root project itself, not a dependency
  if (!key.startsWith("node_modules/")) continue; // workspace roots, not installs
  declaredAny.add(key);
  // A version is only compared when the lockfile actually states one. npm records a workspace
  // symlink as { link: true, resolved: "packages/foo" } with no version on the node_modules entry
  // -- the version lives on the workspace path entry instead. Comparing a placeholder against the
  // linked package's real package.json would fail every clean npm ci (Codex review round 2,
  // 2026-09-23). This lockfile has no such entries today; the rule keeps it that way if it gains
  // workspaces later. Presence on disk is still required either way.
  if (meta && !meta.optional) declaredRequired.set(key, typeof meta.version === "string" ? meta.version : null);
}

/* ---------- side 2: what is physically on disk ---------- */

try {
  if (!statSync(modulesDir).isDirectory()) fail(`${modulesDir} is not a directory`);
} catch (err) {
  fail(`cannot read node_modules at ${modulesDir}: ${err.message}`);
}

const installed = new Map();

/**
 * Membership is decided by the DIRECTORY, not by package.json. Node and TypeScript resolve
 * node_modules/foo/index.js with no package.json at all, so skipping unreadable directories let an
 * undeclared module sit in the tree and be imported while this reported no extra dependency
 * (Codex review round 3, 2026-09-23). package.json is only how a version is learned; failing to
 * read one is itself drift, never a reason to drop the entry. Dot entries (.bin, .cache,
 * .package-lock.json) are filtered in scan() before they ever reach here.
 */
const NO_MANIFEST = "(no readable package.json)";

function readPackage(dir, key, depth) {
  let version;
  try {
    version = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version ?? "(no version)";
  } catch {
    version = NO_MANIFEST;
  }
  installed.set(key, version);
  scan(join(dir, "node_modules"), `${key}/node_modules`, depth + 1);
}

function scan(dir, prefix, depth) {
  if (depth > 16) return; // nesting is bounded in practice; this is a runaway-symlink stop
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // no nested node_modules here
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue; // .bin, .package-lock.json, .cache
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith("@")) {
      // A scope directory holds packages, it is not a package itself.
      const scopeDir = join(dir, entry.name);
      let scoped;
      try {
        scoped = readdirSync(scopeDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const inner of scoped) {
        if (inner.name.startsWith(".")) continue;
        readPackage(join(scopeDir, inner.name), `${prefix}/${entry.name}/${inner.name}`, depth);
      }
    } else {
      readPackage(join(dir, entry.name), `${prefix}/${entry.name}`, depth);
    }
  }
}

scan(modulesDir, "node_modules", 0);

/* ---------- compare ---------- */

const missing = [];
const mismatched = [];
for (const [key, version] of declaredRequired) {
  const name = key.slice("node_modules/".length);
  if (!installed.has(key)) missing.push(`${name}@${version ?? "(linked/unversioned)"}`);
  else if (installed.get(key) === NO_MANIFEST) {
    // Present but unverifiable. Not "missing" -- saying so would send the reader looking for a
    // directory that is right there.
    mismatched.push(`${name}: declared ${version ?? "(linked/unversioned)"}, on disk ${NO_MANIFEST}`);
  } else if (version !== null && installed.get(key) !== version) {
    mismatched.push(`${name}: declared ${version}, on disk ${installed.get(key)}`);
  }
}
const extra = [];
for (const key of installed.keys()) {
  if (!declaredAny.has(key)) extra.push(`${key.slice("node_modules/".length)}@${installed.get(key)}`);
}

const cap = (list) => (list.length > 12 ? [...list.slice(0, 12), `... and ${list.length - 12} more`] : list);

if (missing.length === 0 && mismatched.length === 0 && extra.length === 0) {
  console.log(`DEPS_IN_SYNC required=${declaredRequired.size} on_disk=${installed.size}`);
  process.exit(0);
}

console.log(`DEPS_DRIFT missing=${missing.length} mismatched=${mismatched.length} extra=${extra.length}`);
if (missing.length) console.log(`  declared by the ref but NOT on disk:\n    ${cap(missing).join("\n    ")}`);
if (mismatched.length) console.log(`  on disk at a different version:\n    ${cap(mismatched).join("\n    ")}`);
if (extra.length) console.log(`  on disk but NOT declared by the ref:\n    ${cap(extra).join("\n    ")}`);
process.exit(1);
