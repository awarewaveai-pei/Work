const fs = require("node:fs"), path = require("node:path");

function resolveSource(appRoot, env) {
  const config = JSON.parse(fs.readFileSync(path.join(appRoot, "awarewave-source.json"), "utf8"));
  if (env.AWAREWAVE_APP_DIR) return path.resolve(appRoot, env.AWAREWAVE_APP_DIR);
  const canonical = path.resolve(appRoot, config.appDir);
  if (fs.existsSync(canonical) || !config.bundledAppDir) return canonical;
  return path.resolve(appRoot, config.bundledAppDir);
}

// awarewave-files.txt: the next-admin files read at runtime (one per line, # = comment).
const runtimeFiles = (appRoot) => fs.readFileSync(path.join(appRoot, "awarewave-files.txt"), "utf8")
  .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

// Read the canonical sources on every request; never maintain a second palette or form stylesheet.
function appearance(pathname, appDir) {
  if (pathname === "/awarewave/forms.css")
    return fs.readFileSync(path.join(appDir, "public/awarewave/forms.css"), "utf8");
  if (pathname === "/awarewave/theme.css") {
    const css = fs.readFileSync(path.join(appDir, "app/globals.css"), "utf8");
    const root = css.match(/:root\s*\{[^}]*\}/);
    if (!root) throw Error("AwareWave 主題來源缺少 :root");
    return root[0];
  }
  return null;
}

// Connected mode: the theme saved on app (next-admin GET /api/internal/theme/css) is appended after the bundled
// :root so it wins. Card P6.16: the copy is fetched again when next-admin says a save happened (invalidate(), from
// POST /api/internal/theme/invalidate) or when an open tab comes back (theme.css?fresh, shared/theme.js); no polling.
// maxAgeMs is only the ceiling for a lost notice on a page that never revisits a tab (next-admin deployed before this
// server, notice timed out); it is not the freshness path. A failed fetch keeps the last good block (or none).
function savedTheme({ env, fetchImpl, maxAgeMs = 600000, freshFloorMs = 1000, now = Date.now }) {
  const base = String(env.VW_INTERNAL_BASE || "").trim().replace(/\/+$/, ""), token = String(env.VW_INTERNAL_TOKEN || "").trim();
  if (!base || !token) return Object.assign(async () => "", { invalidate() {} });
  let css = "", fetchedAt = -Infinity, stale = true, failed = false, pending = null, seq = 0, applied = 0;
  // fresh = an open tab came back. /awarewave/ is public, so a forced fetch reuses one finished < freshFloorMs ago
  // (at most one next-admin read per second). A failed fetch is retried after freshFloorMs too, not after maxAgeMs.
  // Concurrent callers share one in-flight fetch.
  const get = ({ fresh = false } = {}) => {
    const age = now() - fetchedAt;
    if (!stale && age < (failed ? freshFloorMs : maxAgeMs) && !(fresh && age >= freshFloorMs)) return pending || Promise.resolve(css);
    if (!pending) { const p = refresh().finally(() => { if (pending === p) pending = null; }); pending = p; }
    return pending;
  };
  // A fetch already in flight may have read the DB before the save: drop it, so the next call starts a new one.
  get.invalidate = () => { stale = true; pending = null; };
  return get;
  async function refresh() {
    const id = ++seq;
    stale = false;
    let ok = false;
    try {
      const r = await fetchImpl(base + "/api/internal/theme/css", { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(3000) });
      const body = r.ok ? await r.text() : "";
      // An older fetch finishing after a newer one never overwrites it.
      if (/^:root\{[^{}<]*\}$/.test(body)) { ok = true; if (id > applied) { css = body; applied = id; } }
      else console.error("[vw] saved theme fetch:", r.status);
    } catch (e) { console.error("[vw] saved theme fetch:", e.message); }
    if (id === seq) { fetchedAt = now(); failed = !ok; }
    return css;
  }
}
module.exports = { appearance, savedTheme, resolveSource, runtimeFiles };
