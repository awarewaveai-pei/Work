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
// :root so it wins. Cached 30 s; a failed fetch keeps the last good block (or none) -- the page never breaks on it.
function savedTheme({ env, fetchImpl, ttlMs = 30000, now = Date.now }) {
  const base = String(env.VW_INTERNAL_BASE || "").trim().replace(/\/+$/, ""), token = String(env.VW_INTERNAL_TOKEN || "").trim();
  if (!base || !token) return async () => "";
  let css = "", until = 0, pending = null;
  // Concurrent requests share one in-flight fetch, so none of them gets the empty pre-fetch value.
  return () => now() < until ? Promise.resolve(css) : (pending ||= refresh().finally(() => { until = now() + ttlMs; pending = null; }));
  async function refresh() {
    try {
      const r = await fetchImpl(base + "/api/internal/theme/css", { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(3000) });
      const body = r.ok ? await r.text() : "";
      if (/^:root\{[^{}<]*\}$/.test(body)) css = body;
      else console.error("[vw] saved theme fetch:", r.status);
    } catch (e) { console.error("[vw] saved theme fetch:", e.message); }
    return css;
  }
}
module.exports = { appearance, savedTheme, resolveSource, runtimeFiles };
