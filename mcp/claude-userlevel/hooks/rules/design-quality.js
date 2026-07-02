// Warn when frontend edits drift toward generic template-looking UI. Verbatim.
const fs = require('fs');
const path = require('path');

const EXT = /\.(tsx|jsx|vue|css|scss|html|svelte|astro)$/i;
const SIGNALS = [
  { p: /\bget started\b/i, l: '"Get Started" CTA' },
  { p: /\blearn more\b/i, l: '"Learn More" CTA' },
  { p: /\bgrid-cols-(3|4)\b/, l: 'uniform card grid' },
  { p: /\bbg-gradient-to-[trbl]/, l: 'stock gradient' },
  { p: /\bInter\b/, l: 'Inter font (generic)' },
  { p: /\bRoboto\b/, l: 'Roboto font (generic)' },
];

module.exports = {
  check(ctx) {
    const frontend = ctx.files.filter((f) => EXT.test(f));
    if (!frontend.length) return null;
    const found = [];
    for (const f of frontend) {
      try {
        const c = fs.readFileSync(path.resolve(f), 'utf8');
        for (const s of SIGNALS) if (s.p.test(c)) found.push(s.l);
      } catch (_) { /* unreadable file — skip */ }
    }
    if (!found.length) return null;
    return { warn: [`[Hook] DESIGN: generic UI patterns detected: ${[...new Set(found)].join(', ')}. Ensure intentional design.`] };
  },
};
