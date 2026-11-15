// A 401 from the workbench API sends a top-level page to /login with its own address as next (hash kept); a framed page tells
// the embedding page instead; 403 does neither.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const code = fs.readFileSync(path.join(__dirname, "../shared/adapters.js"), "utf8");
function run(status, framed) {
  const log = { assigned: [], posted: [] };
  class XHR {
    constructor() { this.upload = {}; }
    open() {}
    setRequestHeader() {}
    send() { this.status = status; this.responseText = "{}"; setTimeout(() => this.onload(), 0); }
    abort() {}
  }
  const win = { top: framed ? { postMessage: (m, o) => log.posted.push([m, o]) } : null };
  if (!framed) win.top = win;
  const sandbox = { window: win, XMLHttpRequest: XHR, location: { pathname: "/pages/tools.html", search: "", hash: "#edit", assign: (u) => log.assigned.push(u) }, setTimeout, clearTimeout, localStorage: {}, Object };
  vm.runInNewContext(code, sandbox);
  const adapter = new win.VideoWorkbenchAdapters.HttpAdapter({ apiBaseUrl: "/api/vw", timeoutMs: 1000 });
  return adapter.load().then(() => assert.fail("must reject"), (e) => ({ log, status: e.status }));
}
(async () => {
  let r = await run(401, false);
  assert.equal(JSON.stringify(r.log.assigned), JSON.stringify(["/login?next=%2Fpages%2Ftools.html%23edit"]));
  r = await run(401, true);
  assert.equal(JSON.stringify(r.log.assigned), JSON.stringify([]));
  assert.equal(JSON.stringify(r.log.posted), JSON.stringify([[{ channel: "vw:v1", action: "unauthorized", payload: { next: "/pages/tools.html#edit" } }, "*"]]));
  r = await run(403, false);
  assert.equal(JSON.stringify([r.log.assigned, r.log.posted, r.status]), "[[],[],403]");
  console.log("auth-redirect ok");
})().catch((e) => { console.error(e); process.exit(1); });
