// Card S4b local Stable Fast 3D, real process inside WSL (RTX 5060; installed by scripts/sf3d/install-wsl.sh):
// a job starts the process; a second one while it runs is refused (409, one GPU job); cancel kills the Linux process
// group (and wsl.exe) and frees the slot; the next job, started from the 3D page's 產生 button, ends in a GLB model at
// US$0. Free and offline. Skips when the WSL install is missing.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");

const DISTRO = process.env.VW_SF3D_WSL || "Ubuntu"; // the distro the workbench is configured with
const wsl = (...cmd) => spawnSync("wsl.exe", ["-d", DISTRO, "--", ...cmd], { encoding: "utf8", windowsHide: true });
if (process.platform !== "win32" || wsl("bash", "-c", "test -x ~/awarewave-sf3d/current/.venv/bin/python").status !== 0) {
  console.log(`SKIP s4b-sf3d-local: no install in WSL distro ${DISTRO} (scripts/sf3d/install-wsl.sh)`);
  process.exit(0);
}
const winAlive = (pid) => spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8" }).stdout.includes(String(pid));
const linuxAlive = (pgid) => wsl("kill", "-0", "--", "-" + pgid).status === 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { base, dataDir } = await isolatedServer("vw-s4b-sf3d-", { env: { VW_SF3D_WSL: DISTRO } });
  const call = async (route, data, method = "POST") => {
    const r = await fetch(base + "/api/vw" + route, { method, headers: { "Content-Type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}) });
    return { status: r.status, body: await r.json() };
  };
  const until = async (id, done, ms = 300000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) {
      const v = (await call("/generations/" + id, undefined, "GET")).body;
      if (done(v)) return v;
    }
    throw Error("job " + id + " did not reach the expected state");
  };
  const image = (await call("/uploads", { name: "杯子.png", data: "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "..", "assets", "test-image-1.png")).toString("base64") })).body;
  const start = () => call("/generations", { type: "model", operation: "image-to-3d", prompt: "圖片轉 3D", references: { image: { url: image.url, id: image.id } }, settings: { method: "local-sf3d" } });

  const first = await start();
  assert.equal(first.status, 202, JSON.stringify(first.body));
  const running = await until(first.body.id, (v) => v.localPid && v.status === "running", 30000);
  const busy = await start();
  assert.equal(busy.status, 409, "one local SF3D at a time: " + JSON.stringify(busy.body));
  const pgidFile = path.join(dataDir, "sf3d", first.body.id, "out", "pgid");
  for (let i = 0; i < 80 && !fs.existsSync(pgidFile); i++) await sleep(250);
  const pgid = Number(fs.readFileSync(pgidFile, "utf8"));
  await sleep(3000); // model loading / inference
  assert.ok(linuxAlive(pgid) && winAlive(running.localPid), "running on both sides before cancel");
  assert.equal((await call("/generations/" + first.body.id + "/cancel")).status, 200);
  await until(first.body.id, (v) => v.status === "cancelled", 20000);
  for (let i = 0; i < 40 && (linuxAlive(pgid) || winAlive(running.localPid)); i++) await sleep(250);
  assert.ok(!linuxAlive(pgid), "cancel killed the Linux process group " + pgid);
  assert.ok(!winAlive(running.localPid), "cancel ended wsl.exe " + running.localPid);
  console.log(`PASS 本機 SF3D（WSL）：任務起程序；同時第二個任務 409；取消 → cancelled，Linux 程序群組 ${pgid} 與 wsl.exe ${running.localPid} 都結束`);

  // The slot is free again: run one from the 3D page's button.
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--force_high_performance_gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/pages/tools.html#3d");
    await page.evaluate(async (stored) => VideoWorkbench.assets.save({ ...stored, name: "杯子.png", createdAt: new Date().toISOString() }), image);
    await page.goto(base + "/pages/tools.html?r=1#3d");
    await page.getByRole("button", { name: "圖片：杯子.png", exact: true }).click();
    await page.getByRole("button", { name: "本機 SF3D · 免費", exact: true }).click();
    await page.getByRole("button", { name: "產生 3D 模型（免費）", exact: true }).click();
    await page.waitForFunction(() => /已產生 3D 模型.*本機 SF3D，免費/.test(document.querySelector("[data-t3-status]")?.textContent || ""), null, { timeout: 300000 });
    const made = (await page.evaluate(() => VideoWorkbench.assets.list())).filter((a) => a.origin?.method === "local-sf3d").at(-1);
    assert.deepEqual([made.kind, made.origin.provider, made.origin.model, made.origin.costUsd], ["model", "本機", "stable-fast-3d", 0]);
    console.log("PASS 取消後名額釋放；3D 頁選圖 → 本機 SF3D · 免費 → 產生 3D 模型（免費）→ GLB 進場景，成本 0");
  } finally {
    await browser.close();
  }
  console.log("s4b-sf3d-local: 2 passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
