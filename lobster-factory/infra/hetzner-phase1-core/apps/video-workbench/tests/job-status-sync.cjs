// Runtime + history run together: no job panel, provider, browser, or production data.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const root = path.join(__dirname, ".."), tick = () => new Promise(setImmediate);
const clone = (v) => structuredClone(v);
async function settle() { for (let i = 0; i < 8; i++) await tick(); }
// U11.1: a history card reads 中文名稱 / 中文狀態 · local time; the job id stays only in its buttons' data attributes.
function card(html, id) {
  const one = html.split("<article").find((a) => a.includes(`data-job-open="${id}"`));
  assert(one, "no history card for " + id);
  const [, title, line] = /<h2>(.*?)<\/h2><p>(.*?)<\/p>/.exec(one);
  assert.doesNotMatch(title + line, new RegExp(id + "|quick-render|\\d{4}-\\d{2}-\\d{2}T"), "raw id, operation or ISO time shown");
  assert.match(line, /^\S+ · \d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}$/);
  return { title, status: line.split(" · ")[0] };
}
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
        const job = { id: "job-" + ++serial, status: "queued", type: "video", input: clone(body), createdAt: "2026-11-16T15:18:23.818Z", deadlineAt: new Date(Date.now() + 60000).toISOString() };
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
  vm.runInContext(fs.readFileSync(path.join(root, "shared/jobs-view.js"), "utf8"), sandbox); // the history line's labels
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
  assert.deepEqual(card(p.host.innerHTML, job.id), { title: "快速輸出", status: "排隊中" });
  assert.equal(p.timers.size, 1, "new job restarts the idle runner");
  Object.assign(p.server.get(job.id), { status: "failed", error: "bookend join failed" });
  await p.advance();
  assert.equal((await p.api.generations.list())[0].status, "failed");
  assert.equal(card(p.host.innerHTML, job.id).status, "失敗"); assert.match(p.host.innerHTML, /bookend join failed/);
  assert.equal(p.timers.size, 0, "closed-panel failure ends the runner");

  const manual = await p.api.generations.create({ operation: "quick-render" }); await settle();
  p.server.get(manual.id).status = "failed";
  const before = p.requests.length;
  await p.api.generations.refresh((await p.api.generations.list()).find((j) => j.id === manual.id)); await settle();
  assert.equal(p.requests.length, before + 1, "manual check reads only its one job");
  assert.equal(card(p.host.innerHTML, manual.id).status, "失敗");
  await p.advance();

  const refreshing = await p.api.generations.create({ operation: "quick-render" }); await settle();
  p.server.get(refreshing.id).status = "failed";
  await p.refreshButton();
  assert.equal(card(p.host.innerHTML, refreshing.id).status, "失敗", "history refresh obtains fresh state");
  assert.equal(p.timers.size, 0);

  const cancelling = await p.api.generations.create({ operation: "quick-render" }); await settle();
  await p.api.generations.cancel(cancelling.id); await settle();
  assert.equal(card(p.host.innerHTML, cancelling.id).status, "已取消", "cancel updates the same history view");
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
  // A job named after a tool reads exactly as the tools page names it (TOOLS in scripts/tools-0.js).
  const { jobTitle } = require("../shared/jobs-view.js"),
    tools = [...fs.readFileSync(path.join(root, "scripts/tools-0.js"), "utf8").matchAll(/\bid: "([\w-]+)",[^{}]*?\bname: "([^"]+)"/g)];
  assert(tools.length >= 20, "TOOLS not found in scripts/tools-0.js");
  for (const [, id, name] of tools) {
    const title = jobTitle({ input: { operation: id } });
    if (title !== "生成任務") assert.equal(title, name, "history name of " + id + " differs from the tools page");
  }
  console.log("job-status-sync ok: idle wake, closed panel, history events/manual refresh, one runner, old saved job");
})().catch((error) => { console.error(error); process.exitCode = 1; });
