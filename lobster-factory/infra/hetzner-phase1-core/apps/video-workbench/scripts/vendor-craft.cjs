// Copies a Craft engine's web build (scripts/<engine>-pro/build.ps1, repo root) into engines/<engine>/web/ and checks it against
// engines/<engine>/VERSION.json: the SHA256SUMS file must hash to sha256SumsSha256, every file it lists must match, and nothing
// unlisted may be in the folder. Used by scripts/vendor-filmcraft.cjs and scripts/vendor-effectcraft.cjs (manual, not postinstall:
// without the engine files its tool card is simply not shown).
// Source: argv[2], else <ENGINE>_DIST, else %LOCALAPPDATA%\awarewave\<engine>-dist\<LATEST>. A mismatch means the build is not
// the pinned one: rebuild or investigate, never edit VERSION.json to make it pass.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");

const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const STAMP = ".sha256sums-sha256";

function vendor(engine, argv = process.argv.slice(2)) {
  const dir = path.join(__dirname, "..", "engines", engine), target = path.join(dir, "web");
  const pin = JSON.parse(fs.readFileSync(path.join(dir, "VERSION.json"), "utf8"));
  const stamp = path.join(target, STAMP);

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
    const extra = present.filter((f) => !["SHA256SUMS", STAMP].includes(f)).length - lines.length;
    if (extra) throw Error(`資料夾裡有 ${extra} 個檔不在 SHA256SUMS 裡`);
  }

  // The build writes <engine>-dist/LATEST (the folder it just produced); the folder is never guessed by name or date.
  // LATEST naming another build than VERSION.json pins = stop: copy only after VERSION.json is updated on purpose.
  function latestDist() {
    const root = path.join(process.env.LOCALAPPDATA || path.join(require("node:os").homedir(), ".local", "share"), "awarewave", engine + "-dist");
    const file = path.join(root, "LATEST");
    if (!fs.existsSync(file)) throw Error(`找不到 ${file}：先跑 scripts/${engine}-pro/build.ps1`);
    const name = fs.readFileSync(file, "utf8").trim();
    if (name !== pin.dist) throw Error(`最新產物是 ${name}，VERSION.json 釘的是 ${pin.dist}：確認新產物後更新 VERSION.json 再複製`);
    return path.join(root, name);
  }

  const source = path.resolve(argv[0] || process.env[engine.toUpperCase() + "_DIST"] || latestDist());
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8").trim() === pin.sha256SumsSha256) {
    check(target);
    console.log(`engines/${engine}: ${pin.dist} already present and verified`);
    return;
  }
  check(source);
  // Copied beside the target and checked again before the swap, so a half-copied folder is never served.
  const staging = target + ".new";
  fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(source, staging, { recursive: true });
  check(staging);
  fs.writeFileSync(path.join(staging, STAMP), pin.sha256SumsSha256 + "\n");
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(staging, target);
  console.log(`engines/${engine}: ${pin.dist} copied from ${source} and verified`);
}

function run(engine) {
  try {
    vendor(engine);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
module.exports = { vendor, run };
