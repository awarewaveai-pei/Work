// Card R3: the 編輯片頭 dialog (shared/bookends.js) picks a 橫幅字卡 from 我的設計 the way the editor's 片頭 pane does --
// through shared/design-picker.js (one list GET /designs, one pick POST /designs/use, one card grid, one banner link
// with the organization) -- and no browser file other than the picker asks for /designs.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const S = require("../shared/episode-spine.js"), remotion = require("../backend/remotion.cjs"), Picker = require("../shared/design-picker.js");

// The dialog's DOM, as far as it uses it: its own markup parsed into elements found by [attr], [attr=value] or tag.
function dialog() {
  let els = [];
  const d = {
    set innerHTML(html) {
      this.html = html;
      els = [...html.matchAll(/<([a-z]+)\b([^>]*)>/g)].map(([, tag, raw]) => {
        const attrs = Object.fromEntries([...raw.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => [k, v ?? ""]));
        const dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith("data-")).map(([k, v]) => [k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()), v]));
        return { tag, attrs, dataset, textContent: "" };
      });
    },
    get innerHTML() { return this.html; },
    querySelectorAll(sel) {
      const m = /^\[([\w-]+)(?:=([\w-]+))?\]$/.exec(sel);
      return els.filter((e) => (m ? m[1] in e.attrs && (m[2] === undefined || e.attrs[m[1]] === m[2]) : e.tag === sel));
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    addEventListener() {}, showModal() {}, close() {}, remove() {},
  };
  return d;
}
const d = dialog(), calls = [], opened = [], picker = {};
for (const [k, f] of Object.entries(Picker)) picker[k] = (...a) => (calls.push(k), f(...a));
const p = { id: "p", title: "片名", ratio: "16:9", episodes: [{ id: "e", name: "第一集", shots: [], steps: [], outputs: [] }] };
const requests = [], V = {
  projects: { list: async () => [p] }, preferences: { get: async (k, fallback) => fallback, set: async () => {} },
  capabilities: { remotionTemplates: remotion.catalog, mainSystem: { organizationId: "11111111-1111-4111-8111-111111111111" } },
  assets: { list: async () => [{ id: "lib", url: "/generated/lib.png", kind: "image", name: "素材庫圖" }] }, mediaKind: (a) => a.kind,
  sanitize: (h) => h, notify() {}, spine: { setBookends: async () => {} },
  request: async (route, body, method = "POST") => {
    requests.push([method, route, body]);
    if (route === "/designs") return { designs: [{ id: "d1", url: "https://r2/a.png", name: "片頭 A", width: 1920, height: 1080 }, { id: "d2", url: "https://r2/b.png", name: "直式", width: 1080, height: 1920 }] };
    return { id: body.id, url: "/generated/" + body.id + ".jpg", name: "片頭 A" };
  },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../shared/bookends.js"), "utf8"), {
  Transitions: require("../backend/transitions.cjs").Transitions, VideoWorkbench: V, EpisodeSpine: S, DesignPicker: picker, structuredClone,
  document: { createElement: () => d, body: { append() {} } }, window: { open: (url) => opened.push(url) }, URLSearchParams, crypto, setTimeout, clearTimeout,
});
const tick = () => new Promise((r) => setTimeout(r, 0));
const click = async (sel) => { const e = d.querySelector(sel); assert.ok(e, "missing " + sel); await e.onclick(); await tick(); };

(async () => {
  V.bookends.edit({ id: "v", input: { link: { projectId: "p", episodeId: "e" }, settings: { ratio: "16:9" } }, result: { url: "/v.mp4" } });
  await tick(); await tick();
  await click('[data-kind=still-opener]');
  assert.match(d.innerHTML, /從我的設計挑/);
  assert.match(d.innerHTML, /開橫幅工具做一張/);
  assert.doesNotMatch(d.innerHTML, /data-pick="backgroundUrl"/, "橫幅字卡 is not picked from the library");
  await click("[data-design-load]");
  assert.deepEqual(requests.at(-1), ["GET", "/designs", undefined]);
  assert.match(d.innerHTML, /role="group" aria-label="我的設計"/);
  assert.match(d.innerHTML, /data-id="d2" aria-pressed="false"><img src="https:\/\/r2\/b.png" alt="" loading="lazy"><span>直式<\/span><small>比例不同，會加模糊底<\/small>/);
  await click('[data-design-pick=backgroundUrl]');
  assert.deepEqual(requests.at(-1), ["POST", "/designs/use", { id: "d1", ratio: "16:9" }]);
  assert.match(d.innerHTML, /data-id="d1" aria-pressed="true"/);
  await click("[data-design-banner]");
  assert.equal(opened[0], "/tools/banner?ratio=16%3A9&title=%E7%AC%AC%E4%B8%80%E9%9B%86&template=opener-center&org=11111111-1111-4111-8111-111111111111");
  assert.deepEqual([...new Set(calls)].sort(), ["bannerUrl", "html", "load", "use"], "every step goes through shared/design-picker.js");

  // the editor's 片頭 pane takes the same module, and no other browser file asks for /designs
  const browser = ["scripts", "shared"].flatMap((dir) => fs.readdirSync(path.join(__dirname, "..", dir), { recursive: true }).filter((f) => /\.js$/.test(f)).map((f) => path.join(dir, f)));
  assert.deepEqual(browser.filter((f) => /["']\/designs(\/use)?["']/.test(fs.readFileSync(path.join(__dirname, "..", f), "utf8"))).map((f) => f.replace(/\\/g, "/")), ["shared/design-picker.js"]);
  const pane = fs.readFileSync(path.join(__dirname, "../scripts/editor-panes/text.js"), "utf8");
  for (const fn of ["DesignPicker.html(", "DesignPicker.load(", "DesignPicker.use(", "DesignPicker.bannerUrl("]) assert.ok(pane.includes(fn), "editor pane uses " + fn);
  console.log("PASS R3 design picker: the 編輯片頭 dialog and the editor's 片頭 pane pick 我的設計 through one module");
})().catch((e) => { console.error(e); process.exit(1); });
