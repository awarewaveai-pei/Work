// Every main-system file the backend imports at runtime must ship in the release package (scripts/package.cjs
// sourceFiles), and must be resolved through awarewave-source.json, not a fixed ../../next-admin path
// (Codex 2026-11-02, card P1: a package without renderer-auth.ts silently reported Remotion as not configured).
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const root = path.join(__dirname, ".."),
  pkg = fs.readFileSync(path.join(root, "scripts/package.cjs"), "utf8"),
  backend = path.join(root, "backend");
let found = 0;
for (const name of fs.readdirSync(backend).filter((f) => f.endsWith(".cjs"))) {
  const text = fs.readFileSync(path.join(backend, name), "utf8");
  assert.doesNotMatch(text, /next-admin\/lib\//, name + " must resolve main-system files via appearance.cjs resolveSource");
  for (const [, file] of text.matchAll(/"(lib\/[\w/.-]+\.ts)"/g)) {
    found++;
    assert.ok(pkg.includes(JSON.stringify(file)), name + " imports " + file + " but scripts/package.cjs does not ship it");
  }
}
assert.ok(found >= 2, "expected the timeline-v1 and renderer-auth imports, found " + found);
console.log("package-sources ok:", found, "runtime main-system imports shipped");
