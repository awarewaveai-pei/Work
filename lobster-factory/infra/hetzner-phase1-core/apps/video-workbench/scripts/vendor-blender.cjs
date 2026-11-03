// Downloads the pinned Blender 4.5.9 LTS portable build into runtime/blender/ and checks the zip against
// vendor/blender/sources.json (sha256 from the official .sha256 file). Manual only (`node scripts/vendor-blender.cjs`),
// NOT postinstall: 380 MB and 3D is optional. Idempotent: a stamp file holds the verified zip hash.
// A mismatch means the release asset changed: stop and investigate, never edit sources.json to make it pass.
// Other platforms (P6 container) use a system Blender through BLENDER_PATH (backend/blender.cjs).
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const root = path.join(__dirname, "..");
const pin = JSON.parse(fs.readFileSync(path.join(root, "vendor", "blender", "sources.json"), "utf8"));
const target = path.join(root, "runtime", "blender"), stamp = path.join(target, ".zip-sha256");

async function main() {
  if (process.platform !== "win32") {
    console.log("runtime/blender: 非 Windows，略過；執行時改用 BLENDER_PATH");
    return;
  }
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8").trim() === pin.zipSha256 && fs.existsSync(path.join(target, pin.exe))) {
    console.log(`runtime/blender: ${pin.version} already present`);
    return;
  }
  const work = path.join(root, "runtime", "blender-download");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  try {
    const zipPath = path.join(work, "blender.zip");
    const response = await fetch(pin.url);
    if (!response.ok) throw Error(`Blender 下載失敗：HTTP ${response.status}`);
    const hash = crypto.createHash("sha256");
    let bytes = 0;
    const body = Readable.fromWeb(response.body);
    body.on("data", (chunk) => { hash.update(chunk); bytes += chunk.length; });
    await pipeline(body, fs.createWriteStream(zipPath));
    if (bytes !== pin.zipBytes || hash.digest("hex") !== pin.zipSha256) throw Error("Blender 壓縮檔大小或雜湊與 vendor/blender/sources.json 不符");
    fs.mkdirSync(path.join(work, "out"));
    // Windows 10+ ships bsdtar, which reads zip archives.
    execFileSync(path.join(process.env.SystemRoot || "C:\Windows", "System32", "tar.exe"), ["-xf", zipPath], { cwd: path.join(work, "out"), windowsHide: true });
    const src = path.join(work, "out", pin.topFolder);
    if (!fs.existsSync(path.join(src, pin.exe))) throw Error(`壓縮檔內找不到 ${pin.topFolder}/${pin.exe}`);
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(src, target);
    fs.writeFileSync(stamp, pin.zipSha256 + "\n");
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log(`runtime/blender: ${pin.version} downloaded and verified`);
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
