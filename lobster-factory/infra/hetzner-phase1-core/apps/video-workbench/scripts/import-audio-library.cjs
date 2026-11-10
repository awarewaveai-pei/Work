#!/usr/bin/env node
// Card ED.6: fills the built-in audio library folder (backend/library.cjs) from originals kept outside git, then writes
// each file's measured length and loudness (sec, lufs) into assets/audio-library.json. Re-runnable: a file already in the
// folder is kept, not converted again. Exits 1 when a listed item has no file (the list and the folder must agree).
//   node scripts/import-audio-library.cjs --from D:\tmp\ed6-audio-src [--to <folder>]
// --to defaults to backend/library.cjs dir() (VW_LIBRARY_DIR, else <data dir>/library). Originals are named by item id: <id>.mp3|wav|ogg|flac.
// An mp3 original is copied as is (re-encoding a lossy file gains nothing); any other format becomes mp3 192k, full length.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  library = require("../backend/library.cjs"),
  { inspectMedia, loudnessStats } = require("../backend/media-inspect.cjs");

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const catalogFile = path.join(__dirname, "../assets/audio-library.json"),
  from = arg("--from"),
  to = arg("--to") || library.dir(process.env),
  round = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

(async () => {
  const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8")),
    missing = [];
  fs.mkdirSync(to, { recursive: true });
  for (const it of catalog.items) {
    if (!library.NAME.test(it.file)) throw Error(`${it.id}: 檔名 ${it.file} 不符合曲庫白名單（backend/library.cjs NAME）`);
    const target = path.join(to, it.file);
    if (!fs.existsSync(target)) {
      const source = from && fs.readdirSync(from).find((n) => /\.(mp3|wav|ogg|flac)$/i.test(n) && path.parse(n).name === it.id);
      if (!source) {
        missing.push(it.id);
        continue;
      }
      const tmp = target + ".tmp-" + crypto.randomUUID() + ".mp3";
      if (/\.mp3$/i.test(source)) fs.copyFileSync(path.join(from, source), tmp);
      else {
        const r = spawnSync(ffmpeg, ["-v", "error", "-y", "-i", path.join(from, source), "-vn", "-c:a", "libmp3lame", "-b:a", "192k", tmp], { encoding: "utf8", windowsHide: true });
        if (r.status !== 0) {
          fs.rmSync(tmp, { force: true });
          throw Error(`${it.id}: 轉檔失敗 ${r.stderr}`);
        }
      }
      fs.renameSync(tmp, target);
      console.log("ADDED " + it.file);
    }
    const [info, loud] = await Promise.all([inspectMedia(target), loudnessStats(target)]);
    it.sec = round(info.duration);
    it.lufs = round(loud.integratedLufs);
  }
  // Written beside and renamed over: an interrupted run never leaves a half-written list.
  const tmp = catalogFile + ".tmp-" + crypto.randomUUID();
  fs.writeFileSync(tmp, JSON.stringify(catalog, null, 2) + "\n");
  fs.renameSync(tmp, catalogFile);
  console.log(`ITEMS ${catalog.items.length} MISSING ${missing.length}${missing.length ? " " + missing.join(",") : ""} FOLDER ${to}`);
  if (missing.length) process.exitCode = 1;
})().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
