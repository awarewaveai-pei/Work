const fs = require("node:fs"), path = require("node:path");

function resolveSource(appRoot, env) {
  const config = JSON.parse(fs.readFileSync(path.join(appRoot, "awarewave-source.json"), "utf8"));
  if (env.AWAREWAVE_APP_DIR) return path.resolve(appRoot, env.AWAREWAVE_APP_DIR);
  const canonical = path.resolve(appRoot, config.appDir);
  if (fs.existsSync(canonical) || !config.bundledAppDir) return canonical;
  return path.resolve(appRoot, config.bundledAppDir);
}

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
module.exports = { appearance, resolveSource };
