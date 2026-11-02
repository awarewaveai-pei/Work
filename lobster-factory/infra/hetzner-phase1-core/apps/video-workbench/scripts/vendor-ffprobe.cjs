// Downloads the pinned ffprobe.exe (same gyan.dev 6.1.1 essentials build as ffmpeg-static's ffmpeg.exe)
// into vendor/ffprobe/ and checks the zip and the exe against vendor/ffprobe/sources.json. Runs as postinstall.
// A mismatch means the release asset changed: stop and investigate, never update sources.json to make it pass.
// Other platforms use the system ffprobe through FFPROBE_PATH (backend/media-inspect.cjs).
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const dir = path.join(__dirname, "..", "vendor", "ffprobe"), target = path.join(dir, "ffprobe.exe");
const sources = JSON.parse(fs.readFileSync(path.join(dir, "sources.json"), "utf8"));
const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

async function main() {
  if (process.platform !== "win32") {
    console.log("vendor/ffprobe: 非 Windows，略過；執行時改用 FFPROBE_PATH");
    return;
  }
  if (fs.existsSync(target) && sha(fs.readFileSync(target)) === sources.sha256) {
    console.log("vendor/ffprobe: ffprobe.exe verified");
    return;
  }
  const response = await fetch(sources.url);
  if (!response.ok) throw Error(`ffprobe 下載失敗：HTTP ${response.status}`);
  const zip = Buffer.from(await response.arrayBuffer());
  if (zip.length !== sources.zipBytes || sha(zip) !== sources.zipSha256)
    throw Error("ffprobe 壓縮檔雜湊與 vendor/ffprobe/sources.json 不符");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ffprobe-"));
  try {
    fs.writeFileSync(path.join(work, "build.zip"), zip);
    // Windows 10+ ships bsdtar, which reads zip archives.
    execFileSync(path.join(process.env.SystemRoot || "C:\Windows", "System32", "tar.exe"), ["-xf", "build.zip", sources.member], { cwd: work, windowsHide: true });
    const exe = fs.readFileSync(path.join(work, ...sources.member.split("/")));
    if (exe.length !== sources.bytes || sha(exe) !== sources.sha256)
      throw Error("ffprobe.exe 雜湊與 vendor/ffprobe/sources.json 不符");
    fs.writeFileSync(target + ".tmp", exe);
    fs.renameSync(target + ".tmp", target);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log("vendor/ffprobe: ffprobe.exe downloaded and verified");
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
