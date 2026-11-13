#!/usr/bin/env node
// Re-makes see-through previews (proxy.webm / preview720.webm) that were made silent while their original has sound
// (backend/media-store.cjs backfillAlphaAudio holds the rule). Every data folder: the local one and each org's
// (<data dir>/orgs/<org>). Re-runnable: previews that already have sound are left alone. Old previews keep playing until
// each is replaced; exports read the original and are not affected.
//   node scripts/backfill-alpha-proxy-audio.cjs [--data <dir>]     (default: VW_DATA_DIR, else .data beside the app)
const fs = require("node:fs"),
  path = require("node:path"),
  { vwEnv } = require("../backend/env-compat.cjs"),
  { createMediaStore } = require("../backend/media-store.cjs");

const i = process.argv.indexOf("--data"),
  dataDir = (i > 0 && process.argv[i + 1]) || vwEnv(process.env, "DATA_DIR") || path.join(__dirname, "..", ".data"),
  orgs = path.join(dataDir, "orgs"),
  folders = [dataDir, ...(fs.existsSync(orgs) ? fs.readdirSync(orgs).map((n) => path.join(orgs, n)) : [])].filter((d) => fs.existsSync(path.join(d, "media")));

(async () => {
  let total = 0;
  for (const folder of folders) {
    const done = await createMediaStore({ dataDir: folder }).backfillAlphaAudio();
    for (const name of done) console.log("REMADE " + (path.relative(dataDir, folder) || ".") + " " + name);
    total += done.length;
  }
  console.log(`FOLDERS ${folders.length} REMADE ${total}`);
})().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
