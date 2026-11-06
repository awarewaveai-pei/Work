// Every var(--x) without a fallback in styles/*.css must be defined by the theme (next-admin app/globals.css) or by
// these stylesheets. An undefined token renders as nothing: the editor dialog was see-through on --bg (2026-11-06).
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const appDir = process.env.AWAREWAVE_APP_DIR || require("../awarewave-source.json").appDir,
  styles = path.join(__dirname, "../styles"),
  sheets = fs.readdirSync(styles).filter((f) => f.endsWith(".css")).map((f) => [f, fs.readFileSync(path.join(styles, f), "utf8")]),
  defined = new Set();
for (const css of [fs.readFileSync(path.join(appDir, "app/globals.css"), "utf8"), ...sheets.map(([, css]) => css)])
  for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
const missing = sheets.flatMap(([file, css]) =>
  [...css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].filter((m) => !defined.has(m[1])).map((m) => `${file}: ${m[1]}`),
);
assert.deepEqual([...new Set(missing)], [], "undefined theme tokens");
console.log(`PASS theme tokens: ${sheets.length} stylesheets, ${defined.size} defined tokens, none undefined`);
