// Card P6.16: an open tab that comes back re-reads the theme saved on app (theme.css?fresh) and swaps it into the
// imported /awarewave/theme.css sheet in place; a hidden tab and the page itself never poll. Pure node: shared/theme.js
// runs in a vm against a fake document.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const src = fs.readFileSync(path.join(__dirname, "../shared/theme.js"), "utf8");
assert.doesNotMatch(src, /setInterval|setTimeout/, "主題不得用計時器輪詢");

// The bundled block as the server really cuts it from next-admin globals.css (its comments contain "<").
const appearance = require("../backend/appearance.cjs"), root = path.join(__dirname, "..");
const bundled = appearance.appearance("/awarewave/theme.css", appearance.resolveSource(root, {}));
const served = bundled + "\n:root{--body-bg:#445566;}";
const rule = (text) => ({ cssText: text, selectorText: ":root", style: [...text.matchAll(/(--[\w-]+):/g)].map((m) => m[1]) });
const saved = {
  href: "https://video.aware-wave.com/awarewave/theme.css",
  cssRules: [rule(":root{--body-bg:#fff;}"), rule(":root{--body-bg:#112233;}")],
  deleteRule(i) { this.cssRules.splice(i, 1); },
  insertRule(text, i) { this.cssRules.splice(i, 0, rule(text)); },
};
const listeners = {}, fetched = [];
let refreshes = 0;
const document = {
  documentElement: { hasAttribute: () => false, style: { setProperty() {}, removeProperty() {} }, dataset: {} },
  body: {}, head: {}, visibilityState: "hidden",
  querySelectorAll: (sel) => (sel === "iframe" ? (refreshes++, []) : []),
  styleSheets: [{ href: "https://video.aware-wave.com/styles/theme.css", cssRules: [{ styleSheet: saved }] }],
  addEventListener: (type, fn) => (listeners[type] = fn),
};
const ctx = {
  document, URL, URLSearchParams, location: { search: "", origin: "https://video.aware-wave.com" },
  MutationObserver: class { observe() {} },
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  addEventListener() {},
  fetch: async (url, opts) => { fetched.push([url, opts]); return { ok: true, text: async () => served }; },
};
ctx.window = ctx; ctx.parent = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);

(async () => {
  assert(listeners.visibilitychange, "theme.js 監聽 visibilitychange");
  listeners.visibilitychange();
  await new Promise((r) => setImmediate(r));
  assert.equal(fetched.length, 0, "分頁隱藏時不讀");
  const before = refreshes;
  document.visibilityState = "visible";
  listeners.visibilitychange();
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  assert.equal(fetched.length, 1, "切回分頁讀一次");
  assert.equal(fetched[0][0], "/awarewave/theme.css?fresh=1");
  assert.equal(fetched[0][1].cache, "no-store");
  assert.deepEqual(saved.cssRules.map((r) => r.cssText), [bundled, ":root{--body-bg:#445566;}"], "預設區塊保留、新主題換進原 sheet");
  assert(refreshes > before, "換完通知內嵌 iframe");
  console.log("p616-theme-refresh ok");
})().catch((e) => { console.error(e); process.exit(1); });
