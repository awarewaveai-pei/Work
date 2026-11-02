// EffectCraft Web is served from /engines/effectcraft/ with application/wasm and COOP/COEP/CORP on that
// path only; every other workbench path keeps its old headers. Needs `node scripts/vendor-effectcraft.cjs`.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { isolatedServer } = require("./isolated-server.cjs");

const web = path.join(__dirname, "..", "engines", "effectcraft", "web");
if (!fs.existsSync(path.join(web, "index.html"))) {
  console.log("SKIP engines/effectcraft/web absent (run node scripts/vendor-effectcraft.cjs)");
  process.exit(0);
}
const ISOLATION = ["cross-origin-opener-policy", "cross-origin-embedder-policy", "cross-origin-resource-policy"];

(async () => {
  const { base } = await isolatedServer("vw-effectcraft-serve-");
  const head = async (p) => {
    const r = await fetch(base + p, { method: "HEAD" });
    return { status: r.status, h: Object.fromEntries(r.headers) };
  };
  const wasm = await head("/engines/effectcraft/web/effectcraft_web_bg.wasm");
  assert.equal(wasm.status, 200);
  assert.equal(wasm.h["content-type"], "application/wasm");
  for (const p of ["/engines/effectcraft/web/index.html", "/engines/effectcraft/web/effectcraft_web.js", "/engines/effectcraft/web/effectcraft_web_bg.wasm"]) {
    const { status, h } = await head(p);
    assert.equal(status, 200, p);
    assert.equal(h["cross-origin-opener-policy"], "same-origin", p);
    assert.equal(h["cross-origin-embedder-policy"], "require-corp", p);
    assert.equal(h["cross-origin-resource-policy"], "same-origin", p);
  }
  for (const p of ["/", "/index.html", "/engines/effectcraft/VERSION.json"]) {
    const { status, h } = await head(p);
    assert.equal(status, 200, p);
    if (p.startsWith("/engines/")) continue; // VERSION.json sits on the isolated path too
    for (const k of ISOLATION) assert.equal(h[k], undefined, `${p} must not send ${k}`);
  }
  console.log("PASS effectcraft served as application/wasm, COOP/COEP only under /engines/effectcraft/");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
