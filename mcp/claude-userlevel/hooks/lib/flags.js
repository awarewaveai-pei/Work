// Once-per-session flag files (tmpdir, atomic wx create).
// Single implementation for every rule that needs "fire once, then pass"
// semantics (git-log-injector, auto-repair-guard, file-path-router, …).
//
// Flag naming preserves the legacy hooks' exact file names so an in-flight
// session survives the legacy→runner upgrade without double-blocking:
//   once('git-log-injected-<sid>-<date>')  → $TMPDIR/claude-git-log-injected-<sid>-<date>.flag
//
// Returns:
//   'created' — flag did not exist and was created (rule should fire)
//   'exists'  — flag already present (rule already fired this session)
//   'error'   — filesystem error (caller must fail-open; already logged)

const fs = require('fs');
const os = require('os');
const path = require('path');
const shared = require('./shared');

function flagPath(name) {
  const safe = String(name).replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(os.tmpdir(), `claude-${safe}.flag`);
}

function once(name) {
  const p = flagPath(name);
  try {
    fs.writeFileSync(p, new Date().toISOString(), { encoding: 'utf8', flag: 'wx' });
    return 'created';
  } catch (e) {
    if (e.code === 'EEXIST') return 'exists';
    shared.logFailOpen(`flags.once(${name})`, e);
    return 'error';
  }
}

// Remove a flag previously created this call (used when a rule decides its
// firing condition was not actually met, e.g. git-log-injector outside a repo).
function release(name) {
  try {
    fs.unlinkSync(flagPath(name));
    return true;
  } catch (e) {
    shared.logFailOpen(`flags.release(${name})`, e);
    return false;
  }
}

module.exports = { once, release, flagPath };
