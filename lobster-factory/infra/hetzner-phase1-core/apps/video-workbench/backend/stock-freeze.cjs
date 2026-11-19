// Card B25: one freezedetect pass over a stock clip (the review's own filter, shared/stock-pick.js FREEZE_FILTER).
// Never throws and never blocks a clip it could not read: an ffmpeg failure or timeout is an unchecked record.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { FREEZE_FILTER, freezeRecord, unchecked } = require("../shared/stock-pick.js");

const TIMEOUT_MS = 30_000;
// "Duration: 00:00:10.04" in the ffmpeg banner; a freeze left open at the end runs to this.
const durationOf = (log) => {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
};
function runFfmpeg(file, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(require("ffmpeg-static"), ["-hide_banner", "-nostats", "-i", file, "-vf", FREEZE_FILTER, "-an", "-f", "null", "-"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let log = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(Error("檢查逾時")); }, timeoutMs);
    child.stderr.on("data", (c) => (log = (log + c).slice(-64000)));
    child.once("error", (e) => { clearTimeout(timer); reject(e); });
    child.once("close", (code) => { clearTimeout(timer); resolve({ code, log }); });
  });
}
// bytes -> origin.freeze record. run / now = test doubles.
async function measure(bytes, { run = runFfmpeg, now = Date.now, timeoutMs = TIMEOUT_MS } = {}) {
  const file = path.join(os.tmpdir(), "vw-stock-" + crypto.randomUUID() + ".mp4"),
    began = now();
  try {
    fs.writeFileSync(file, bytes);
    const { code, log } = await run(file, timeoutMs);
    // A file ffmpeg could not decode says nothing about a freeze.
    if (code !== 0) return unchecked("ffmpeg 結束代碼 " + code, now() - began, now());
    return freezeRecord({ log, duration: durationOf(log), ms: now() - began, now: now() });
  } catch (e) {
    return unchecked(e.message, now() - began, now());
  } finally {
    try { fs.rmSync(file, { force: true }); } catch { /* temp file; the OS clears it */ }
  }
}

module.exports = { measure, durationOf, TIMEOUT_MS };
