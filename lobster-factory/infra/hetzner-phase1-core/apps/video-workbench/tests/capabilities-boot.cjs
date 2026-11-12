// /capabilities is asked once per page, together with the state load, and any code that reads VideoWorkbench.capabilities
// at run time starts only after it arrived. Pure node: runtime.js's helper and the boot files run against fakes.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const tick = () => new Promise((r) => setImmediate(r));

(async () => {
  // 1. The helper: one request for many callers, capabilities set before the promise resolves, a failure is asked again.
  const src = read("shared/runtime.js");
  const m = src.match(/  let capabilitiesLoad;\n  function loadCapabilities\(\) \{[\s\S]*?\n  \}\n/);
  assert(m, "loadCapabilities is defined in shared/runtime.js");
  let calls = 0, answer, fail = false;
  const win = { VideoWorkbench: { request: (p, b, method) => { calls++; assert.equal(p, "/capabilities"); assert.equal(method, "GET"); return fail ? Promise.reject(Error("x")) : new Promise((r) => (answer = r)); } } };
  const loadCapabilities = new Function("window", m[0] + "\nreturn loadCapabilities;")(win);
  const a = loadCapabilities(), b = loadCapabilities();
  assert.equal(calls, 1, "many callers share one request");
  answer({ speech: 1 });
  assert.deepEqual(await a, { speech: 1 });
  assert.equal(win.VideoWorkbench.capabilities.speech, 1, "capabilities is set when the promise resolves");
  assert.equal(await b, win.VideoWorkbench.capabilities);
  assert.equal(loadCapabilities(), loadCapabilities(), "later callers get the same settled promise");
  const win2 = { VideoWorkbench: { request: () => { calls++; return Promise.reject(Error("down")); } } };
  const again = new Function("window", m[0] + "\nreturn loadCapabilities;")(win2);
  calls = 0;
  await assert.rejects(again(), /down/);
  await assert.rejects(again(), /down/);
  assert.equal(calls, 2, "a failed request is asked again by the next caller");

  // 2. Sent at page start, next to the state load: right after the VideoWorkbench object exists, not after ready.
  assert(/window\.SeedStar = window\.VideoWorkbench;\n\s*loadCapabilities\(\)/.test(src), "runtime.js starts /capabilities at load");

  // 3. Boot files: the page's scripts are not loaded before capabilities arrived (scripts read it in render/top level).
  for (const f of ["tools", "projects", "templates"]) {
    let release, loaded = false;
    const VideoWorkbench = {
      ready: Promise.resolve(),
      loadCapabilities: () => new Promise((r) => (release = r)),
      loadScripts: async () => { loaded = true; },
      reportError: (e) => { throw e; },
    };
    const sandbox = { VideoWorkbench, fetch: async () => ({ json: async () => ({ templates: [] }) }), document: {}, console };
    vm.runInNewContext(read(`scripts/${f}-boot.js`), sandbox);
    await tick(); await tick();
    assert.equal(loaded, false, f + "-boot: scripts must wait for /capabilities");
    release({});
    await tick(); await tick();
    assert.equal(loaded, true, f + "-boot: scripts load once /capabilities arrived");
  }

  // 3b. index and characters do not wait: they draw without capabilities (`|| {}` / unknown = no label) and draw again when it arrives.
  assert(/VideoWorkbench\.loadCapabilities\(\)\s*\.then\(\(c\) => \{[\s\S]*?render\(\)/.test(read("scripts/index-0.js")), "index-0.js redraws when capabilities arrive");
  assert(/VideoWorkbench\.loadCapabilities\(\)\s*\.then\(\(c\) => \{[\s\S]*?data-ref-tag/.test(read("scripts/characters-0.js")), "characters-0.js relabels when capabilities arrive");
  assert(/const c = VideoWorkbench\.capabilities \|\| \{\}/.test(read("scripts/index-0.js")), "index-0.js draws without capabilities");

  // 4. Nobody else sends its own /capabilities request.
  for (const f of ["scripts/characters-0.js", "scripts/index-0.js", "scripts/storyboards-boot.js", "scripts/tools-boot.js", "scripts/projects-boot.js", "scripts/templates-boot.js", "shared/assets-ui.js", "shared/jobs-view.js", "shared/paid-price.js"])
    assert(!/request\(\s*["']\/capabilities/.test(read(f)), f + " uses VideoWorkbench.loadCapabilities");
  console.log("capabilities-boot ok");
})().catch((e) => { console.error(e); process.exit(1); });
