// Runtime + history run together: no job panel, provider, browser, or production data.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const root = path.join(__dirname, ".."), tick = () => new Promise(setImmediate);
const clone = (v) => structuredClone(v);
async function settle() { for (let i = 0; i < 8; i++) await tick(); }
function page(oldJobs = []) {
  const timers = new Map(), handlers = new Map(), server = new Map(oldJobs.map((j) => [j.id, clone(j)])), requests = [], errors = [];
  let timerId = 0, serial = 0, active = 0, peak = 0, hold = null;
  const host = { innerHTML: "" }, document = {
    documentElement: { hasAttribute: () => true, getAttribute: () => null },
    getElementById: (id) => id === "workspaceArea" ? host : null,
    querySelectorAll: () => [],
    addEventListener: (type, handler) => { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(handler); },
    dispatchEvent: (event) => { for (const handler of handlers.get(event.type) || []) handler(event); },
  };
  const state = { version: 1, revision: 0, characters: [], projects: [], assets: [], jobs: clone(oldJobs), preferences: {}, selection: {} };
  class Adapter {
    async load() { return clone(state); }
    async save(value) { state.revision++; return { revision: state.revision }; }
    async request(route, method = "GET", body) {
      if (route === "/capabilities") return {};
      if (route === "/generations" && method === "POST") {
        const job = { id: "job-" + ++serial, status: "queued", type: "video", input: clone(body), deadlineAt: new Date(Date.now() + 60000).toISOString() };
        server.set(job.id, job); return clone(job);
      }
      const match = /^\/generations\/([^/]+)(\/cancel)?$/.exec(route);
      assert(match, "unexpected request " + route);
      const job = server.get(match[1]); assert(job);
      if (match[2]) { job.status = "cancelled"; return clone(job); }
      requests.push(job.id); active++; peak = Math.max(peak, active);
      try { if (hold) await hold; return clone(job); }
      finally { active--; }
    }
  }
  const window = { VW_CONFIG: { mode: "http", timeoutMs: 1000 }, addEventListener() {}, isSecureContext: false };
  const sandbox = { window, parent: window, document, navigator: {}, crypto, structuredClone, console,
    VideoWorkbenchModels: { asset: (v) => ({ ...v, origin: v.origin || { kind: "import", legacy: true } }), project: clone },
    VideoWorkbenchAdapters: { HttpAdapter: Adapter, LocalAdapter: Adapter, ServiceError: class extends Error {} },
    sessionStorage: { getItem: () => null }, location: { origin: "http://test" },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  Object.defineProperty(sandbox, "VideoWorkbench", { get: () => window.VideoWorkbench });
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "shared/runtime.js"), "utf8"), sandbox);
  const api = window.VideoWorkbench;
  api.reportError = (e) => errors.push(e); api.sanitize = (s) => s; api.showJob = () => { throw Error("test must not open a panel"); };
  vm.runInContext(fs.readFileSync(path.join(root, "scripts/workspaces.js"), "utf8"), sandbox);
  return { api, server, requests, errors, timers, host, get peak() { return peak; },
    pause() { let release; hold = new Promise((resolve) => { release = resolve; }); return () => { hold = null; release(); }; },
    async advance() { const due = [...timers.entries()]; for (const [id, { fn, ms }] of due) { assert.equal(ms, 5000); timers.delete(id); fn(); } await settle(); },
    async refreshButton() {
      const button = { dataset: {}, hasAttribute: (name) => name === "data-refresh" };
      for (const handler of handlers.get("click") || []) await handler({ target: { closest: () => button } });
      await settle();
    },
  };
}
(async () => {
  const p = page(); await p.api.ready; await settle();
  assert.equal(p.timers.size, 0, "empty boot stops watching");
  await p.api.workspaces.open("history");
  const job = await p.api.generations.create({ operation: "quick-render" }); await settle();
  assert.match(p.host.innerHTML, /queued/);
  assert.equal(p.timers.size, 1, "new job restarts the idle runner");
  Object.assign(p.server.get(job.id), { status: "failed", error: "bookend join failed" });
  await p.advance();
  assert.equal((await p.api.generations.list())[0].status, "failed");
  assert.match(p.host.innerHTML, /failed/); assert.match(p.host.innerHTML, /bookend join failed/);
  assert.equal(p.timers.size, 0, "closed-panel failure ends the runner");

  const manual = await p.api.generations.create({ operation: "quick-render" }); await settle();
  p.server.get(manual.id).status = "failed";
  const before = p.requests.length;
  await p.api.generations.refresh((await p.api.generations.list()).find((j) => j.id === manual.id)); await settle();
  assert.equal(p.requests.length, before + 1, "manual check reads only its one job");
  assert.match(p.host.innerHTML, new RegExp(manual.id + " · failed"));
  await p.advance();

  const refreshing = await p.api.generations.create({ operation: "quick-render" }); await settle();
  p.server.get(refreshing.id).status = "failed";
  await p.refreshButton();
  assert.match(p.host.innerHTML, new RegExp(refreshing.id + " · failed"), "history refresh obtains fresh state");
  assert.equal(p.timers.size, 0);

  const cancelling = await p.api.generations.create({ operation: "quick-render" }); await settle();
  await p.api.generations.cancel(cancelling.id); await settle();
  assert.match(p.host.innerHTML, new RegExp(cancelling.id + " · cancelled"), "cancel updates the same history view");
  await p.advance(); assert.equal(p.timers.size, 0);

  const parallel = page(); await parallel.api.ready; await settle();
  const release = parallel.pause();
  const first = await parallel.api.generations.create({ operation: "quick-render" }); await settle();
  const second = await parallel.api.generations.create({ operation: "quick-render" });
  const syncs = [parallel.api.generations.sync(), parallel.api.generations.sync()];
  parallel.server.get(first.id).status = "failed"; parallel.server.get(second.id).status = "failed";
  release(); await Promise.all(syncs); await settle();
  assert.equal(parallel.peak, 1, "submissions and repeated sync calls share one runner");
  assert.deepEqual(parallel.requests, [first.id, second.id], "submission during a round cannot lose its wakeup");
  assert.equal(parallel.timers.size, 0);

  const legacy = page([{ id: "legacy", status: "queued", type: "video", deadlineAt: new Date(Date.now() + 60000).toISOString(), input: {} }]);
  Object.assign(legacy.server.get("legacy"), { status: "succeeded", result: { url: "/generated/legacy.mp4", ledger: "local_mode" } });
  await legacy.api.ready; await settle();
  assert.equal((await legacy.api.generations.list())[0].status, "succeeded", "old saved jobs still reconcile at boot");
  assert.equal((await legacy.api.assets.list())[0].id, "job-legacy", "finished result survives with panel closed");
  assert.equal(legacy.timers.size, 0);
  assert.deepEqual([...p.errors, ...parallel.errors, ...legacy.errors], []);
  console.log("job-status-sync ok: idle wake, closed panel, history events/manual refresh, one runner, old saved job");
})().catch((error) => { console.error(error); process.exitCode = 1; });
