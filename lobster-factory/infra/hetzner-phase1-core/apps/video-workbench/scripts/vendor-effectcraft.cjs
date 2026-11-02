// Downloads the pinned EffectCraft Web build into engines/effectcraft/web/ and checks it against
// engines/effectcraft/VERSION.json (zipSha256 must also equal the release's SHA256SUMS.txt line).
// Manual only (`node scripts/vendor-effectcraft.cjs`), not postinstall: the engine stays optional until P0 picks a route.
// A mismatch means the release asset changed: stop and investigate, never edit VERSION.json to make it pass.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const dir = path.join(__dirname, "..", "engines", "effectcraft"), target = path.join(dir, "web");
const pin = JSON.parse(fs.readFileSync(path.join(dir, "VERSION.json"), "utf8"));
const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const stamp = path.join(target, ".zip-sha256");

async function main() {
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8").trim() === pin.zipSha256) {
    console.log(`engines/effectcraft: ${pin.version} already present`);
    return;
  }
  const sums = await fetch(pin.sha256SumsUrl);
  if (!sums.ok) throw Error(`SHA256SUMS.txt 下載失敗：HTTP ${sums.status}`);
  const line = (await sums.text()).split(/\r?\n/).find((l) => l.trim().endsWith(" " + pin.asset));
  if (!line || line.split(/\s+/)[0] !== pin.zipSha256) throw Error("VERSION.json zipSha256 與上游 SHA256SUMS.txt 不符");
  const response = await fetch(pin.url);
  if (!response.ok) throw Error(`EffectCraft 下載失敗：HTTP ${response.status}`);
  const zip = Buffer.from(await response.arrayBuffer());
  if (zip.length !== pin.size || sha(zip) !== pin.zipSha256) throw Error("EffectCraft 壓縮檔雜湊與 VERSION.json 不符");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "vw-effectcraft-"));
  try {
    fs.writeFileSync(path.join(work, "web.zip"), zip);
    fs.mkdirSync(path.join(work, "out"));
    const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\Windows", "System32", "tar.exe") : "unzip";
    execFileSync(tar, process.platform === "win32" ? ["-xf", "../web.zip"] : ["-q", "../web.zip"], { cwd: path.join(work, "out"), windowsHide: true });
    // Flatten a single top-level folder so index.html sits at engines/effectcraft/web/index.html.
    let src = path.join(work, "out");
    const top = fs.readdirSync(src);
    if (top.length === 1 && fs.statSync(path.join(src, top[0])).isDirectory()) src = path.join(src, top[0]);
    if (!fs.existsSync(path.join(src, "index.html"))) throw Error("壓縮檔內找不到 index.html");
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(src, target, { recursive: true });
    fs.writeFileSync(stamp, pin.zipSha256 + "\n");
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log(`engines/effectcraft: ${pin.version} downloaded and verified`);
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
