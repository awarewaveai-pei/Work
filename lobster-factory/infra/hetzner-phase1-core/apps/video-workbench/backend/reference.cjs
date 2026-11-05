// Third-party reference material (seedstar.ai captures: storyboard data, sample thumbnails). Staff-only, never in git or
// the image: lives in VW_REFERENCE_DIR (default = this app's assets/, where the laptop copy sits). Own examples for
// customers will come from a different source; nothing here is served to them.
const fs = require("node:fs"),
  path = require("node:path");
const NAME = /^(image-\d+\.(png|jpe?g|webp)|storyboards-data\.json)$/;
const dir = (env) => env.VW_REFERENCE_DIR || path.join(__dirname, "..", "assets");
// Behind the proxy only next-admin-signed staff identity reads it; local mode (laptop, nothing signed) keeps working.
const allowed = (env, req) => env.VW_TRUST_PROXY_IDENTITY !== "1" || req.vwIdentity?.userKind === "staff";
const file = (env, name) => {
  if (!NAME.test(name)) return null;
  const full = path.join(dir(env), name);
  try { return fs.statSync(full).isFile() ? full : null; } catch { return null; }
};
const present = (env) => {
  try { return fs.readdirSync(dir(env)).some((n) => NAME.test(n)); } catch { return false; }
};
module.exports = { allowed, file, present };
