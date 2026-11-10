// Card S4b.2 (paid, approved by the supervisor 2026-11-10, cap US$1.50): 10 test images (FLUX schnell on Replicate,
// US$0.003 each, cheapest registered image model) -> image-to-3d with stability-spar3d and replicate-trellis through the
// workbench's own job route, into the local library (.data). Writes results.json next to this file.
// A budget guard adds each call's upper estimate before the call and stops when the next one would pass the cap; a TRELLIS
// run is then corrected to its billed cost (metrics.predict_time x US$0.0014), so a slow run cannot slip past the cap.
// Run: node docs/s4b2-evidence/run.cjs   (REPLICATE_API_TOKEN, STABILITY_API_KEY from the environment)
const fs = require("node:fs"), path = require("node:path");
const CAP = 1.5, EST = { image: 0.003, "stability-spar3d": 0.04, "replicate-trellis": 0.08 };
const IMAGES = [
  ["人物", "full-body photo of a young woman standing straight facing the camera, arms slightly away from the body, casual clothes, plain white background, studio lighting"],
  ["人物", "full-body photo of an older man standing facing the camera, arms relaxed at his sides, jacket and trousers, plain white background, studio lighting"],
  ["產品", "a white running sneaker, three-quarter view, plain white background, product photo"],
  ["產品", "a ceramic coffee mug with a handle, plain white background, product photo"],
  ["硬表面", "a vintage film camera, three-quarter view, plain white background, product photo"],
  ["硬表面", "a small quadcopter drone, three-quarter view, plain white background, product photo"],
  ["透明反光", "a clear glass wine bottle, plain white background, product photo"],
  ["透明反光", "a polished chrome kettle, plain white background, product photo"],
  ["毛髮", "a fluffy long-haired cat sitting, facing the camera, plain white background"],
  ["毛髮", "head and shoulders portrait of a woman with long curly hair, facing the camera, plain white background"],
];
const METHODS = ["stability-spar3d", "replicate-trellis"];
const out = path.join(__dirname, "results.json");
let spent = 0;
const budget = (what) => {
  if (spent + EST[what] > CAP) throw Error(`budget guard: ${spent.toFixed(3)} + ${EST[what]} > ${CAP}`);
  spent += EST[what];
};
let server;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rep = { Authorization: "Bearer " + process.env.REPLICATE_API_TOKEN, "Content-Type": "application/json" };

(async () => {
  const before = await (await fetch("https://api.stability.ai/v1/user/balance", { headers: { Authorization: "Bearer " + process.env.STABILITY_API_KEY } })).json();
  server = require("../../server.cjs").createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port + "/api/vw";
  const call = async (route, data, method = "POST") => {
    const r = await fetch(base + route, { method, headers: { "Content-Type": "application/json", Origin: base.replace("/api/vw", "") }, ...(data ? { body: JSON.stringify(data) } : {}) });
    const v = await r.json();
    if (!r.ok) throw Error(route + " " + r.status + " " + JSON.stringify(v));
    return v;
  };
  const results = { stabilityCreditsBefore: before.credits, images: [] };
  const save = () => fs.writeFileSync(out, JSON.stringify(results, null, 1));
  const assets = [];
  try {
    for (const [i, [group, prompt]] of IMAGES.entries()) {
      budget("image");
      let p = await (await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
        method: "POST", headers: { ...rep, Prefer: "wait" },
        body: JSON.stringify({ input: { prompt, aspect_ratio: "1:1", output_format: "png", num_outputs: 1, seed: 1000 + i } }),
      })).json();
      while (["starting", "processing"].includes(p.status)) (await sleep(1500), (p = await (await fetch(p.urls.get, { headers: rep })).json()));
      if (p.status !== "succeeded") throw Error("flux " + i + " " + p.status + " " + p.error);
      const png = Buffer.from(await (await fetch(p.output[0])).arrayBuffer());
      const name = `S4b.2 測試圖 ${i + 1}（${group}，FLUX schnell 生成）`;
      const stored = await call("/uploads", { name, data: "data:image/png;base64," + png.toString("base64"), rightsConfirmed: true });
      const asset = { ...stored, name, createdAt: new Date().toISOString(), origin: { kind: "ai_generated", provider: "Replicate", model: "black-forest-labs/flux-schnell", predictionId: p.id, prompt, costUsd: EST.image } };
      assets.push(asset);
      const row = { n: i + 1, group, prompt, image: { url: stored.url, assetId: stored.id, predictionId: p.id }, runs: {} };
      results.images.push(row);
      for (const method of METHODS) {
        budget(method);
        const t0 = Date.now();
        let job = await call("/generations", { type: "model", operation: "image-to-3d", prompt: "圖片轉 3D", references: { image: { url: stored.url, id: stored.id } }, settings: { method } });
        while (!["succeeded", "failed", "cancelled"].includes(job.status)) (await sleep(1500), (job = await call("/generations/" + job.id, undefined, "GET")));
        row.runs[method] = { jobId: job.id, status: job.status, error: job.error, seconds: (Date.now() - t0) / 1000, url: job.result?.url, recordedUsd: job.result?.origin?.costUsd, taskId: job.vendorTaskId };
        if (method === "replicate-trellis" && job.vendorTaskId) {
          const s = (await (await fetch("https://api.replicate.com/v1/predictions/" + job.vendorTaskId, { headers: rep })).json()).metrics?.predict_time;
          spent += (Number.isFinite(s) ? s * 0.0014 : 1) - EST[method]; // unknown run time: count it as US$1 and stop soon
        }
        if (job.status === "succeeded") assets.push({ ...job.result, id: "job-" + job.id, name: `S4b.2 #${i + 1} ${method}`, createdAt: new Date().toISOString() });
        save();
        console.log(i + 1, method, job.status, row.runs[method].seconds + "s", "spent<=" + spent.toFixed(3));
      }
    }
  } finally {
    // Library entries (the page lists state.assets): append with the current revision.
    const state = await call("/state", undefined, "GET");
    await call("/state", { ...state, assets: [...state.assets, ...assets] }, "PUT");
    const after = await (await fetch("https://api.stability.ai/v1/user/balance", { headers: { Authorization: "Bearer " + process.env.STABILITY_API_KEY } })).json();
    results.stabilityCreditsAfter = after.credits;
    for (const row of results.images) {
      const t = row.runs["replicate-trellis"]?.taskId;
      if (t) row.runs["replicate-trellis"].predictTime = (await (await fetch("https://api.replicate.com/v1/predictions/" + t, { headers: rep })).json()).metrics?.predict_time;
      row.image.predictTime = (await (await fetch("https://api.replicate.com/v1/predictions/" + row.image.predictionId, { headers: rep })).json()).metrics?.predict_time;
    }
    results.guardUpperUsd = spent;
    save();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => server?.close());
