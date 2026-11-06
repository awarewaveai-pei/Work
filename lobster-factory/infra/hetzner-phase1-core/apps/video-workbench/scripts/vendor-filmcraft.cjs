// Copies the FilmCraft web build made by scripts/filmcraft-pro/build.ps1 (repo root) into engines/filmcraft/web/ and checks it
// against engines/filmcraft/VERSION.json: the SHA256SUMS file must hash to sha256SumsSha256, and every file it lists must match.
// Manual only (`node scripts/vendor-filmcraft.cjs [distDir]`): without the engine files the "專業剪輯" card is simply not shown.
// Source: argv[2], else FILMCRAFT_DIST, else %LOCALAPPDATA%\awarewave\filmcraft-dist\<dist>. A mismatch means the build is not
// the pinned one: rebuild or investigate, never edit VERSION.json to make it pass.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");

const dir = path.join(__dirname, "..", "engines", "filmcraft"), target = path.join(dir, "web");
const pin = JSON.parse(fs.readFileSync(path.join(dir, "VERSION.json"), "utf8"));
const stamp = path.join(target, ".sha256sums-sha256");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// "<sha256>  ./<relative path>" per line (sha256sum output); paths stay inside the folder.
function check(root) {
  const sums = path.join(root, "SHA256SUMS");
  if (!fs.existsSync(sums)) throw Error("找不到 SHA256SUMS：" + root);
  if (sha(sums) !== pin.sha256SumsSha256) throw Error("SHA256SUMS 與 VERSION.json 不符（不是釘住的那一版）");
  const lines = fs.readFileSync(sums, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length !== pin.files) throw Error(`SHA256SUMS 應列 ${pin.files} 個檔，實際 ${lines.length}`);
  for (const line of lines) {
    const m = /^([a-f0-9]{64}) [ *](?:\.\/)?(.+)$/.exec(line);
    if (!m) throw Error("SHA256SUMS 格式不對：" + line);
    const file = path.resolve(root, m[2]);
    if (!file.startsWith(path.resolve(root) + path.sep)) throw Error("SHA256SUMS 指到資料夾外：" + m[2]);
    if (!fs.existsSync(file) || sha(file) !== m[1]) throw Error("檔案雜湊不符：" + m[2]);
  }
  // Nothing unlisted is served: every file in the folder (besides SHA256SUMS and our stamp) is one of the checked ones.
  const present = fs.readdirSync(root, { recursive: true }).filter((f) => fs.statSync(path.join(root, f)).isFile());
  const extra = present.filter((f) => !["SHA256SUMS", path.basename(stamp)].includes(f)).length - lines.length;
  if (extra) throw Error(`資料夾裡有 ${extra} 個檔不在 SHA256SUMS 裡`);
}

// The build writes filmcraft-dist/LATEST (the folder it just produced); the folder is never guessed by name or date.
// LATEST naming another build than VERSION.json pins = stop: copy only after VERSION.json is updated on purpose.
function latestDist() {
  const root = path.join(process.env.LOCALAPPDATA || path.join(require("node:os").homedir(), ".local", "share"), "awarewave", "filmcraft-dist");
  const file = path.join(root, "LATEST");
  if (!fs.existsSync(file)) throw Error("找不到 " + file + "：先跑 scripts/filmcraft-pro/build.ps1");
  const name = fs.readFileSync(file, "utf8").trim();
  if (name !== pin.dist) throw Error(`最新產物是 ${name}，VERSION.json 釘的是 ${pin.dist}：確認新產物後更新 VERSION.json 再複製`);
  return path.join(root, name);
}

function main() {
  const source = path.resolve(process.argv[2] || process.env.FILMCRAFT_DIST || latestDist());
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8").trim() === pin.sha256SumsSha256) {
    check(target);
    console.log(`engines/filmcraft: ${pin.dist} already present and verified`);
    return;
  }
  check(source);
  // Copied beside the target and checked again before the swap, so a half-copied folder is never served.
  const staging = target + ".new";
  fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(source, staging, { recursive: true });
  check(staging);
  fs.writeFileSync(path.join(staging, path.basename(stamp)), pin.sha256SumsSha256 + "\n");
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(staging, target);
  console.log(`engines/filmcraft: ${pin.dist} copied from ${source} and verified`);
}
try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
