const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../shared/adapters.js"), "utf8");
const ORG = "11111111-1111-4111-8111-111111111111";
function page(parent) {
  let identify;
  const sent = [], fetched = [], listeners = {}, controller = {};
  class XHR {
    constructor() { this.upload = {}; this.headers = {}; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send() { sent.push(this); this.status = 200; this.responseText = "{}"; this.onload(); }
  }
  const window = { VW_CONFIG: { mode: "http", apiBaseUrl: "/api/vw" }, addEventListener: (type, fn) => { listeners[type] = fn; } };
  window.parent = parent || window; window.top = window;
  const sandbox = {
    window, navigator: { serviceWorker: { controller } }, XMLHttpRequest: XHR, Headers, URL,
    location: { href: "https://video.test/", origin: "https://video.test", pathname: "/", search: "", hash: "" },
    setTimeout, clearTimeout,
    fetch: (input, init) => {
      fetched.push({ input, init });
      if (input === "/api/vw/identity") return new Promise((resolve) => { identify = resolve; });
      return Promise.resolve(new Response("{}"));
    },
  };
  vm.runInNewContext(source, sandbox);
  return { window, sent, fetched, listeners, controller, identify: (value) => identify(new Response(JSON.stringify(value))) };
}
(async () => {
  const root = page(), api = root.window.VideoWorkbenchAdapters;
  const load = new api.HttpAdapter({ apiBaseUrl: "/api/vw", timeoutMs: 1000 }).load();
  assert.equal(root.sent.length, 0, "state cannot race identity");
  root.identify({ organizationId: ORG }); await load;
  assert.equal(root.sent[0].headers["X-VW-Org"], ORG);
  await api.fetchApi("/api/vw/uploads/sessions/test/chunks/0", { method: "POST", headers: { "X-VW-Chunk-Sha256": "sha" }, body: "bytes" });
  assert.equal(root.fetched.at(-1).init.headers.get("x-vw-org"), ORG);
  assert.equal(root.fetched.at(-1).init.headers.get("x-vw-chunk-sha256"), "sha");
  const frame = page(root.window);
  assert.equal(frame.window.VideoWorkbenchAdapters.context, api.context, "iframe inherits immutable parent identity");
  assert.equal(frame.fetched.length, 0, "iframe never rereads the changed cookie");
  let finish;
  const active = api.context.run(() => new Promise((resolve) => { finish = resolve; }));
  await new Promise(setImmediate);
  assert.throws(() => api.context.lock(), /仍在傳送/);
  finish(); await active;
  let reply;
  await root.listeners.message({ data: { type: "vw:document-organization" }, source: root.controller, ports: [{ postMessage: (v) => { reply = v; } }] });
  assert.equal(reply.organizationId, ORG);
  api.context.lock();
  await assert.rejects(api.fetchApi("/api/vw/state"), /重新整理/);
  await root.listeners.message({ data: { type: "vw:document-organization" }, source: root.controller, ports: [{ postMessage: (v) => { reply = v; } }] });
  assert.equal(reply.organizationId, null, "locked page cannot receive another customer's media");
  const broken = page(); broken.identify({ scope: "opaque-only" });
  await assert.rejects(new broken.window.VideoWorkbenchAdapters.HttpAdapter({ apiBaseUrl: "/api/vw", timeoutMs: 1000 }).load(), /客戶識別/);
  assert.equal(broken.sent.length, 0, "invalid identity fails before state");
  console.log("organization-context ok: initial state, iframe, raw upload pin, active switch guard, locked media, invalid identity");
})().catch((e) => { console.error(e); process.exitCode = 1; });
