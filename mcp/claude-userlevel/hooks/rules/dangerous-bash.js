// Block rm -rf and git --no-verify. Replaces two hooks.json inline blockers
// whose jq read the wrong stdin field (`.input`) and therefore never fired —
// this rule reads the real payload (intended diff, locked in tests).
// The force-push inline is not ported: rules/branch-protection.js covers it
// with a stricter branch list.
//
// Matching runs against ctx.commandSegments (command positions: line starts
// and post-&&/||/;/| tokens), NOT the full text — prose or heredoc content
// that merely MENTIONS `rm -rf` must not trip the gate. Two live
// false-positives on 2026-07-02 (writing docs about this very rule) drove
// this design; regression-locked in runner-parity tests ID-1c/1d.
// Recursive+force in ANY spelling (critic finding 4): combined short flags in
// either order and case (-rf/-fR/-Rf), split flags (-r -f / -R --force), and
// long forms, anywhere in the rm segment.
function isRmRf(segment) {
  if (!/^(?:sudo\s+)?rm\s/.test(segment)) return false;
  const tokens = segment.split(/\s+/).slice(1);
  let recursive = false;
  let force = false;
  for (const t of tokens) {
    if (t === '--recursive') recursive = true;
    else if (t === '--force') force = true;
    else if (/^-[a-zA-Z]+$/.test(t)) {
      if (/[rR]/.test(t)) recursive = true;
      if (/f/i.test(t)) force = true;
    }
  }
  return recursive && force;
}
// PowerShell spelling of the same thing (Codex on Windows runs PowerShell):
// Remove-Item or its aliases with -Recurse and -Force in any accepted abbreviation.
const PS_REMOVE = /^(?:Remove-Item|ri|del|erase|rd|rmdir)(?:\s|$)/i;
function isRemoveItemRecurseForce(segment) {
  if (!PS_REMOVE.test(segment)) return false;
  const tokens = segment.split(/\s+/).slice(1);
  const recursive = tokens.some((t) => /^-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?(?::\$?true)?$/i.test(t));
  const force = tokens.some((t) => /^-fo(?:r(?:c(?:e)?)?)?(?::\$?true)?$/i.test(t));
  return recursive && force;
}
const GIT_NO_VERIFY = /^(?:sudo\s+)?git\b[^\n]*--no-verify\b/;

module.exports = {
  check(ctx) {
    const segs = ctx.commandSegments || [];
    if (segs.some(isRmRf) || segs.some(isRemoveItemRecurseForce)) {
      return { block: ['[Hook] BLOCKED: rm -rf is dangerous (so is Remove-Item -Recurse -Force). Delete explicitly-listed paths instead.'] };
    }
    if (segs.some((s) => GIT_NO_VERIFY.test(s))) {
      return { block: ['[Hook] BLOCKED: --no-verify is not allowed. Let git hooks run.'] };
    }
    return null;
  },
};
