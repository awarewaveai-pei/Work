// Built-in audio library (card ED.6): the CC0 sound effects, ambience and music that assets/audio-library.json lists.
// One read-only folder shared by every organisation -- not the per-org /media store (server.cjs forOrg) -- so a file put
// there once is heard and exported by all of them. VW_LIBRARY_DIR; default = <data dir>/library, the data dir being the
// one server.cjs uses (VW_DATA_DIR, else .data beside the app): on the volume in production, git-ignored on a laptop.
// scripts/import-audio-library.cjs fills it. Any signed-in identity may read it.
const fs = require("node:fs"),
  path = require("node:path"),
  { vwEnv } = require("./env-compat.cjs");
const NAME = /^(sfx|amb|mus)-[a-z0-9]+(-[a-z0-9]+)*\.mp3$/;
const dir = (env) => env.VW_LIBRARY_DIR || path.join(vwEnv(env, "DATA_DIR") || path.join(__dirname, "..", ".data"), "library");
const file = (env, name) => {
  if (!NAME.test(name)) return null;
  const full = path.join(dir(env), name);
  try { return fs.statSync(full).isFile() ? full : null; } catch { return null; }
};
// "/library/<name>" -> its file, else null: the one rule for server.cjs (serving) and api.cjs localFile (exports, jobs).
const fromUrl = (env, url) => {
  const m = /^\/library\/([^/]+)$/.exec(url || "");
  return m ? file(env, m[1]) : null;
};
module.exports = { NAME, dir, file, fromUrl };
