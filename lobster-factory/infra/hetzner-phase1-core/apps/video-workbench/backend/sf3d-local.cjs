// Card S4b: free image -> 3D on this computer with Stable Fast 3D (github.com/Stability-AI/stable-fast-3d), run as its own
// process inside WSL (Linux binaries are outside Windows Smart App Control, which blocks freshly built unsigned .pyd
// files; WORKLOG 2026-11-10 續19). Install: scripts/sf3d/install-wsl.sh; docs/s4-image-to-3d-providers-20261103.md §7.
//   wsl.exe -d <VW_SF3D_WSL> -- bash <VW_SF3D_ENTRY | scripts/sf3d/run-wsl.sh> <image> <out>   -> <out>/0/mesh.glb
// The image and <out> sit in the job's workdir (the exchange folder, seen by Linux under /mnt/<drive>); wslPath() is the
// one place a Windows path becomes a Linux one. The child gets no API keys; the entry runs offline. One job at a time
// (8 GB VRAM). Cancel and timeout kill the Linux process group (pgid written by the entry) and then wsl.exe.
const fs = require("node:fs"),
  path = require("node:path"),
  { spawn, spawnSync } = require("node:child_process");
const { vwEnv } = require("./env-compat.cjs");
const { killTree } = require("./blender.cjs");

const TIMEOUT_MS = 600000;
const ENTRY = path.join(__dirname, "..", "scripts", "sf3d", "run-wsl.sh");
const WSL = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "wsl.exe");
// Configured = a WSL distro is named (VW_SF3D_WSL) on a Windows host with wsl.exe; the install itself is checked by the job.
function installed(env) {
  const distro = vwEnv(env, "SF3D_WSL");
  return process.platform === "win32" && distro && fs.existsSync(WSL) ? { distro, entry: vwEnv(env, "SF3D_ENTRY") || ENTRY } : null;
}
function wslPath(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(path.resolve(p));
  if (!m) throw Error("無法轉成 WSL 路徑：" + p);
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
}
let held = false;
const claim = () => (held ? null : ((held = true), () => { held = false; }));

// Resolves with the GLB path inside workdir.
function run({ file, workdir, env, signal, onSpawn, timeoutMs = TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const sf3d = installed(env);
    if (!sf3d) return reject(Object.assign(Error("本機 SF3D 未安裝"), { status: 503 }));
    if (signal?.aborted) return reject(Error("已取消"));
    const out = path.join(workdir, "out");
    fs.mkdirSync(out, { recursive: true });
    const child = spawn(WSL, ["-d", sf3d.distro, "--", "bash", wslPath(sf3d.entry), wslPath(file), wslPath(out)], {
      env: { SystemRoot: process.env.SystemRoot || "", PATH: process.env.PATH || "", TEMP: workdir, TMP: workdir },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    onSpawn?.(child.pid);
    let log = "", stopped = null;
    const stop = (reason) => {
      stopped ||= reason;
      const pgid = Number(fs.readFileSync(path.join(out, "pgid"), { encoding: "utf8", flag: "a+" }).trim());
      if (pgid > 1) spawnSync(WSL, ["-d", sf3d.distro, "--", "kill", "-KILL", "--", "-" + pgid], { windowsHide: true, stdio: "ignore", timeout: 15000 });
      killTree(child);
    };
    const onAbort = () => stop("cancelled");
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    for (const s of [child.stdout, child.stderr]) s.on("data", (c) => (log = (log + c).slice(-4000)));
    child.once("error", (e) => (clearTimeout(timer), reject(e)));
    child.once("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (stopped === "cancelled") return reject(Error("已取消"));
      if (stopped === "timeout") return reject(Error("本機 SF3D 逾時，已停止"));
      const glb = path.join(out, "0", "mesh.glb");
      if (code !== 0 || !fs.existsSync(glb)) return reject(Error("本機 SF3D 執行失敗：" + (log.trim().split("\n").slice(-3).join(" ") || "exit " + code).slice(0, 600)));
      resolve(glb);
    });
  });
}
module.exports = { installed, claim, run, wslPath };
