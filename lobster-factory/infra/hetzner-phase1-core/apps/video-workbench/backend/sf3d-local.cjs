// Card S4b: free image -> 3D on this computer with Stable Fast 3D (github.com/Stability-AI/stable-fast-3d), run as its own
// process: VW_SF3D_PYTHON <VW_SF3D_DIR>/run.py <image> --output-dir <workdir>/out --texture-resolution 1024 -> out/0/mesh.glb.
// Install steps: docs/s4-image-to-3d-providers-20261103.md §7. The child gets a minimal environment (no API keys) and
// HF_HUB_OFFLINE=1: weights are downloaded once at install time, a job never goes online. One job at a time (8 GB VRAM);
// cancel and timeout kill the whole process tree.
const fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const { vwEnv } = require("./env-compat.cjs");
const { killTree } = require("./blender.cjs");

const TIMEOUT_MS = 600000;
function installed(env) {
  const python = vwEnv(env, "SF3D_PYTHON"), dir = vwEnv(env, "SF3D_DIR");
  return python && dir && fs.existsSync(python) && fs.existsSync(path.join(dir, "run.py")) ? { python, dir } : null;
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
    const pass = (k) => (env[k] ? { [k]: env[k] } : {});
    const child = spawn(sf3d.python, [path.join(sf3d.dir, "run.py"), file, "--output-dir", out, "--texture-resolution", "1024"], {
      cwd: sf3d.dir,
      env: {
        PATH: env.PATH || process.env.PATH || "", SystemRoot: process.env.SystemRoot || "", TEMP: workdir, TMP: workdir, TMPDIR: workdir,
        HF_HOME: env.HF_HOME || path.join(sf3d.dir, ".hf"), // weights downloaded there at install (docs §7)
        ...pass("USERPROFILE"), ...pass("HOME"), ...pass("CUDA_VISIBLE_DEVICES"), // rembg's model cache is ~/.u2net
        HF_HUB_OFFLINE: "1", PYTHONDONTWRITEBYTECODE: "1", PYTHONIOENCODING: "utf-8",
      },
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    onSpawn?.(child.pid);
    let log = "", stopped = null;
    const stop = (reason) => ((stopped ||= reason), killTree(child));
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
module.exports = { installed, claim, run };
