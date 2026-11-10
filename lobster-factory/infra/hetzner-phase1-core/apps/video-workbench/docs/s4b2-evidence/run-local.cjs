// Card S4b.2, free part: the same 10 images (results.json) through the local Stable Fast 3D way (image-to-3d,
// method local-sf3d) on this laptop's RTX 5060, via the workbench's own job route into the local library (.data).
// Needs VW_SF3D_WSL (docs §7; ran 2026-11-10 on the Windows-native install that WSL replaced). Adds runs["local-sf3d"] to results.json; no paid call.
// Run: node docs/s4b2-evidence/run-local.cjs
const fs = require("node:fs"), path = require("node:path");
const out = path.join(__dirname, "results.json"), results = JSON.parse(fs.readFileSync(out, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server;
(async () => {
  server = require("../../server.cjs").createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port + "/api/vw";
  const call = async (route, data, method = "POST") => {
    const r = await fetch(base + route, { method, headers: { "Content-Type": "application/json", Origin: base.replace("/api/vw", "") }, ...(data ? { body: JSON.stringify(data) } : {}) });
    const v = await r.json();
    if (!r.ok) throw Error(route + " " + r.status + " " + JSON.stringify(v));
    return v;
  };
  const assets = [];
  for (const row of results.images) {
    if (row.runs["local-sf3d"]?.status === "succeeded") continue; // a re-run adds only what is missing
    const t0 = Date.now();
    let job = await call("/generations", { type: "model", operation: "image-to-3d", prompt: "圖片轉 3D", references: { image: { url: row.image.url, id: row.image.assetId } }, settings: { method: "local-sf3d" } });
    while (!["succeeded", "failed", "cancelled"].includes(job.status)) (await sleep(1000), (job = await call("/generations/" + job.id, undefined, "GET")));
    row.runs["local-sf3d"] = { jobId: job.id, status: job.status, error: job.error, seconds: (Date.now() - t0) / 1000, url: job.result?.url, recordedUsd: job.result?.origin?.costUsd };
    if (job.status === "succeeded") assets.push({ ...job.result, id: "job-" + job.id, name: `S4b.2 #${row.n} local-sf3d`, createdAt: new Date().toISOString() });
    fs.writeFileSync(out, JSON.stringify(results, null, 1));
    console.log(row.n, job.status, row.runs["local-sf3d"].seconds + "s", job.error || "");
  }
  const state = await call("/state", undefined, "GET");
  await call("/state", { ...state, assets: [...state.assets, ...assets] }, "PUT");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => server?.close());
