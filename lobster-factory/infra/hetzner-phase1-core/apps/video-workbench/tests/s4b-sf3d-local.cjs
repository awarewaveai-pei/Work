// Card S4b local Stable Fast 3D, real process (RTX 5060, runtime/sf3d per docs/s4-image-to-3d-providers-20261103.md §7):
// a job starts the process; a second one while it runs is refused (409, one GPU job); cancel kills the process tree and
// frees the slot; the next job runs to a GLB model asset at US$0. Free, offline. Skips when runtime/sf3d is not installed.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const { isolatedServer } = require("./isolated-server.cjs");

const dir = path.join(__dirname, "..", "runtime", "sf3d"), python = path.join(dir, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
if (!fs.existsSync(python) || !fs.existsSync(path.join(dir, ".hf"))) {
  console.log("SKIP s4b-sf3d-local: runtime/sf3d not installed");
  process.exit(0);
}
const alive = (pid) =>
  process.platform === "win32"
    ? spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8" }).stdout.includes(String(pid))
    : (() => { try { process.kill(pid, 0); return true; } catch { return false; } })();

(async () => {
  const { base } = await isolatedServer("vw-s4b-sf3d-", { env: { VW_SF3D_PYTHON: python, VW_SF3D_DIR: dir } });
  const call = async (route, data, method = "POST") => {
    const r = await fetch(base + "/api/vw" + route, { method, headers: { "Content-Type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}) });
    return { status: r.status, body: await r.json() };
  };
  const until = async (id, done, ms = 300000) => {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) {
      const v = (await call("/generations/" + id, undefined, "GET")).body;
      if (done(v)) return v;
    }
    throw Error("job " + id + " did not reach the expected state");
  };
  const image = (await call("/uploads", { name: "cup.png", data: "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "..", "assets", "test-image-1.png")).toString("base64") })).body;
  const start = () => call("/generations", { type: "model", operation: "image-to-3d", prompt: "圖片轉 3D", references: { image: { url: image.url, id: "img" } }, settings: { method: "local-sf3d" } });

  const first = await start();
  assert.equal(first.status, 202, JSON.stringify(first.body));
  const running = await until(first.body.id, (v) => v.localPid && v.status === "running", 30000);
  const busy = await start();
  assert.equal(busy.status, 409, "one local SF3D at a time: " + JSON.stringify(busy.body));
  await new Promise((r) => setTimeout(r, 3000)); // inside model loading / inference
  assert.ok(alive(running.localPid), "process running before cancel");
  assert.equal((await call("/generations/" + first.body.id + "/cancel")).status, 200);
  await until(first.body.id, (v) => v.status === "cancelled", 10000);
  for (let i = 0; i < 40 && alive(running.localPid); i++) await new Promise((r) => setTimeout(r, 250));
  assert.ok(!alive(running.localPid), "cancel killed the process (pid " + running.localPid + ")");
  console.log("PASS 本機 SF3D：任務起程序；同時第二個任務 409；取消 → 任務 cancelled、程序（pid " + running.localPid + "）已結束");

  const again = await start();
  assert.equal(again.status, 202, "slot freed after cancel: " + JSON.stringify(again.body));
  const done = await until(again.body.id, (v) => ["succeeded", "failed"].includes(v.status));
  assert.equal(done.status, "succeeded", done.error);
  assert.deepEqual([done.result.kind, done.result.origin.provider, done.result.origin.model, done.result.origin.costUsd], ["model", "本機", "stable-fast-3d", 0]);
  console.log("PASS 取消後名額釋放，下一個任務跑完 → GLB 模型資產，成本 0");
  console.log("s4b-sf3d-local: 2 passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
