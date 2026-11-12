// Page boot loading rule: every boot script list is inserted at once (downloads overlap) with async = false (still runs in list
// order); a failed file rejects. Pure node: the helper is cut out of shared/runtime.js and run against a fake document.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const src = read("shared/runtime.js");
const m = src.match(/  function loadScripts\(files, base\) \{[\s\S]*?\n  \}\n/);
assert(m, "loadScripts is defined in shared/runtime.js");
const appended = [];
let build = null;
const document = { createElement: () => ({}), documentElement: { getAttribute: (n) => (n === "data-vw-build" ? build : null) }, body: { append: (s) => appended.push(s) } };
const loadScripts = new Function("document", m[0] + "\nreturn loadScripts;")(document);

(async () => {
  const done = loadScripts(["a.js", "b.js", "c.js"], "../scripts/");
  assert.equal(appended.length, 3, "all tags are inserted before any one has loaded");
  assert.deepEqual(appended.map((s) => s.src), ["../scripts/a.js", "../scripts/b.js", "../scripts/c.js"], "list order kept");
  assert(appended.every((s) => s.async === false), "async = false on every tag: parallel download, in-order execution");
  appended.forEach((s) => s.onload());
  await done;
  const failing = loadScripts(["x.js", "y.js"], "");
  appended.at(-1).onerror(new Event("error"));
  await assert.rejects(failing, /y\.js/);
  build = "abc123";
  loadScripts(["d.js"], "../scripts/");
  assert.equal(appended.at(-1).src, "../scripts/d.js?v=abc123", "server build (data-vw-build) is appended: edge-cacheable URL");

  for (const f of ["tools", "characters", "projects", "storyboards", "templates", "index"].map((n) => `scripts/${n}-boot.js`)) {
    const t = read(f);
    assert(/VideoWorkbench\.loadScripts\(/.test(t), f + " uses the shared helper");
    assert(!/createElement\(["']script["']\)/.test(t), f + " has no private serial loop");
  }
  const entry = read("scripts/app-entry.js").replace(/\/\/.*$/gm, ""); // comments mention the rule too; only the code line counts
  assert(/script\.async = false;/.test(entry), "app-entry sets async = false on the tag");
  console.log("boot-script-loading ok");
})().catch((e) => { console.error(e); process.exit(1); });
