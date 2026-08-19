// SessionStart: announce governance status with counts DERIVED from the
// manifest (replaces the inline banner whose hand-written "15 hooks" drifted).
module.exports = {
  check(ctx) {
    const events = (ctx.manifest && ctx.manifest.events) || {};
    const ruleSet = new Set();
    let eventCount = 0;
    for (const groups of Object.values(events)) {
      eventCount++;
      for (const g of groups) for (const r of g.rules || []) ruleSet.add(r);
    }
    return {
      warn: [
        `[Hook] governance online — ${ruleSet.size} rules across ${eventCount} events (hook runner v2).`,
      ],
    };
  },
};
