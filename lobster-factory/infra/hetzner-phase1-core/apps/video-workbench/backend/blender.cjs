// Card P5: runs one Blender background job. Binary = BLENDER_PATH, else runtime/blender/blender.exe from
// scripts/vendor-blender.cjs (pinned 4.5.9). Command: blender -b -t <cores> --factory-startup --offline-mode --python-exit-code 1
// --python backend/blender/<script>.py -- <workdir>/args.json. The scripts read and write only inside workdir
// (backend/blender/common.py checks every *Path/*Dir argument). The child gets a minimal environment (no API keys;
// Blender's user config/scripts dirs point into workdir), and cancel/timeout kills the whole process tree.
// One Blender at a time per server process (a render takes every core it is given; two would also double the memory).
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawn, spawnSync } = require("node:child_process");

const SCRIPTS = path.join(__dirname, "blender");
const pin = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vendor", "blender", "sources.json"), "utf8"));
const ENGINE = "blender-" + pin.version;

function blenderPath(env = process.env) {
  if (env.BLENDER_PATH) return fs.existsSync(env.BLENDER_PATH) ? env.BLENDER_PATH : null;
  const local = path.join(__dirname, "..", "runtime", "blender", pin.exe);
  return fs.existsSync(local) ? local : null;
}
const capability = (env) => {
  const exe = blenderPath(env);
  return exe ? { available: true, engine: ENGINE } : { available: false, engine: ENGINE, install: "node scripts/vendor-blender.cjs" };
};

function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

let lane = Promise.resolve();
// One Blender JOB at a time per host process: a second request is refused (409) instead of queued, so a job's time limit
// (api.cjs, from acceptance) never includes waiting behind another render. claim() -> release fn, or null when busy.
let held = false;
const claim = () => (held ? null : ((held = true), () => { held = false; }));
// Resolves with the script's VWRESULT object. onProgress(done, total) per VWPROGRESS line; onSpawn(pid) once started.
function runBlender({ script, args, workdir, env = process.env, signal, timeoutMs = 1800000, onProgress, onSpawn }) {
  const turn = lane.then(() => once({ script, args, workdir, env, signal, timeoutMs, onProgress, onSpawn }));
  lane = turn.catch(() => {});
  return turn;
}
function once({ script, args, workdir, env, signal, timeoutMs, onProgress, onSpawn }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(Error("已取消"), { cancelled: true }));
    const exe = blenderPath(env);
    if (!exe) return reject(Object.assign(Error("尚未安裝 3D 引擎：請執行 node scripts/vendor-blender.cjs"), { status: 503 }));
    if (!/^[a-z_]+\.py$/.test(script) || !fs.existsSync(path.join(SCRIPTS, script))) return reject(Error("未知的 Blender 腳本"));
    const user = path.join(workdir, ".blender-user");
    fs.mkdirSync(user, { recursive: true });
    const argsFile = path.join(workdir, "args.json");
    fs.writeFileSync(argsFile, JSON.stringify({ ...args, workdir }));
    const childEnv = {
      PATH: env.PATH || process.env.PATH || "",
      SystemRoot: process.env.SystemRoot || "",
      TEMP: workdir,
      TMP: workdir,
      TMPDIR: workdir,
      PYTHONDONTWRITEBYTECODE: "1", // no __pycache__ next to backend/blender/*.py
      HOME: user,
      BLENDER_USER_CONFIG: path.join(user, "config"),
      BLENDER_USER_SCRIPTS: path.join(user, "scripts"),
      BLENDER_USER_DATAFILES: path.join(user, "datafiles"),
      BLENDER_USER_EXTENSIONS: path.join(user, "extensions"),
    };
    // -t: threads = the cores this process may use (cgroup quota, os.availableParallelism), not the host's core count --
    // 32 threads under a 3-core quota made each frame ~2x slower (P6 H5).
    const child = spawn(exe, ["-b", "-t", String(os.availableParallelism()), "--factory-startup", "--offline-mode", "--python-exit-code", "1", "--python", path.join(SCRIPTS, script), "--", argsFile], {
      cwd: workdir,
      env: childEnv,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    onSpawn?.(child.pid);
    let out = "",
      log = "",
      result = null,
      failure = null,
      stopped = null;
    const stop = (reason) => {
      stopped ||= reason;
      killTree(child);
    };
    const onAbort = () => stop("cancelled");
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      let i;
      while ((i = out.indexOf("\n")) >= 0) {
        const line = out.slice(0, i).trim();
        out = out.slice(i + 1);
        const p = /^VWPROGRESS (\d+)\/(\d+)$/.exec(line);
        if (p) onProgress?.(Number(p[1]), Number(p[2]));
        else if (line.startsWith("VWRESULT ")) result = JSON.parse(line.slice(9));
        else if (line.startsWith("VWERROR ")) failure = JSON.parse(line.slice(8));
        else log = (log + line + "\n").slice(-6000);
      }
    });
    child.stderr.on("data", (c) => (log = (log + c).slice(-6000)));
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (stopped === "cancelled") return reject(Object.assign(Error("已取消"), { cancelled: true }));
      if (stopped === "timeout") return reject(Error("Blender 任務逾時，已停止"));
      if (code !== 0 || !result) {
        const reason = failure || log.split("\n").filter((l) => /Error|error:/.test(l)).slice(-3).join(" ") || "exit " + code;
        return reject(Error("Blender 執行失敗：" + reason.slice(0, 600)));
      }
      resolve(result);
    });
  });
}
module.exports = { claim, runBlender, blenderPath, capability, ENGINE, killTree };
