// Page boot loading rule: every boot script list is inserted at once (downloads overlap) with async = false (still runs in list
// order); a failed file rejects. Pure node: the helper is cut out of shared/runtime.js and run against a fake document.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const src = read("shared/runtime.js");
const m = src.match(/  const scriptLoads = new Map\(\);\n  function loadScripts\(files, base\) \{[\s\S]*?\n  \}\n/);
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
  const before = appended.length, again = loadScripts(["a.js", "b.js"], "../scripts/");
  assert.equal(appended.length, before, "a file already inserted is not inserted again (its const/let would be declared twice)");
  await again;
  await assert.rejects(loadScripts(["y.js"], ""), /y\.js/);
  assert.equal(appended.length, before, "a failed file stays failed (the files after it already ran without it; reload repairs)");
  build = "abc123";
  loadScripts(["d.js"], "../scripts/");
  assert.equal(appended.at(-1).src, "../scripts/d.js?v=abc123", "server build (data-vw-build) is appended: edge-cacheable URL");
  const refused = loadScripts(["e.js"], "../scripts/");
  appended.at(-1).onerror(new Event("error"));
  await assert.rejects(refused, /請重新整理頁面/, "a versioned page tells the user to reload (older-build files are refused)");

  for (const f of ["tools", "characters", "projects", "storyboards", "templates", "index"].map((n) => `scripts/${n}-boot.js`)) {
    const t = read(f);
    assert(/VideoWorkbench\.loadScripts\(/.test(t), f + " uses the shared helper");
    assert(!/createElement\(["']script["']\)/.test(t), f + " has no private serial loop");
  }
  // tools.html: boot = list + frame only; every tool file belongs to a TOOLS[].scripts group (tools-0.js) and exists.
  const tools0 = read("scripts/tools-0.js");
  const TOOLS = new Function(tools0.slice(0, tools0.indexOf("];", tools0.indexOf("const TOOLS = [")) + 2) + ";return TOOLS;")();
  const boot = JSON.parse(read("scripts/tools-boot.js").match(/loadScripts\((\[[^\]]*\])/)[1]);
  assert.deepEqual(boot, ["../shared/subtitles.js", "tool-processing.js", "tools-workflows.js", "tools-engine-host.js", "tools-0.js"], "tools.html boots the list and frame only");
  const wired = new Set([...boot, ...TOOLS.flatMap((t) => t.scripts || [])]);
  for (const f of wired) assert(fs.existsSync(path.join(root, "scripts", f)), "tool script exists: " + f);
  const toolFiles = [...fs.readdirSync(path.join(root, "scripts")).filter((f) => /^(tools?-|editor-).*\.js$/.test(f) && f !== "tools-boot.js"),
    ...fs.readdirSync(path.join(root, "scripts", "editor-panes")).map((f) => "editor-panes/" + f)];
  for (const f of toolFiles) assert(wired.has(f), f + " is loaded by tools-boot.js or a TOOLS[].scripts group");
  for (const t of TOOLS.filter((t) => ["edit", "compose", "rig", "3d", "short"].includes(t.id)))
    assert.deepEqual(t.scripts, TOOLS.find((x) => x.id === "edit").scripts, t.id + ": the editing tools call each other, one group");
  const entry = read("scripts/app-entry.js").replace(/\/\/.*$/gm, ""); // comments mention the rule too; only the code line counts
  assert(/script\.async = false;/.test(entry), "app-entry sets async = false on the tag");
  console.log("boot-script-loading ok");
})().catch((e) => { console.error(e); process.exit(1); });
