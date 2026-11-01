const { spawn } = require("node:child_process");
const binary = require("ffmpeg-static");
function inspectMedia(file, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["-hide_banner", "-i", file], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
      signal,
    });
    let log = "";
    const timer = setTimeout(() => child.kill(), 20000);
    child.stderr.on("data", (data) => {
      log = (log + data).slice(-32000);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", () => {
      clearTimeout(timer);
      if (signal?.aborted) {
        reject(Error("任務已取消"));
        return;
      }
      const time = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log),
        video = /Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(log);
      const duration = time
        ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3])
        : null;
      if (!video && !/Audio:/.test(log)) {
        reject(Error("無法讀取影片或音訊資料"));
        return;
      }
      const rotation = Number(
          /displaymatrix:\s*rotation of\s*(-?[\d.]+)/i.exec(log)?.[1] ||
            /\brotate\s*:\s*(-?[\d.]+)/i.exec(log)?.[1] ||
            0,
        ),
        sideways = Math.abs((Math.abs(rotation) % 180) - 90) < 1;
      resolve({
        duration,
        width: video ? Number(video[1]) : null,
        height: video ? Number(video[2]) : null,
        displayWidth: video ? Number(video[sideways ? 2 : 1]) : null,
        displayHeight: video ? Number(video[sideways ? 1 : 2]) : null,
        audio: /Audio:/.test(log),
        video: !!video,
      });
    });
  });
}
module.exports = { inspectMedia };
