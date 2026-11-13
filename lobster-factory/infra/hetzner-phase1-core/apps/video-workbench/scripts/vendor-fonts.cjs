// Downloads the editor's pinned fonts into vendor/fonts/ and checks each against vendor/fonts/sources.json (bytes +
// sha256; a tar.gz member also checks its archive). Runs as postinstall on every platform: the preview's @font-face and
// the export's ass fontsdir both read these files, so no output depends on the machine's installed fonts.
// A mismatch means the upstream file changed: stop and investigate, never update sources.json to make it pass.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), zlib = require("node:zlib");

const dir = path.join(__dirname, "..", "vendor", "fonts");
const sources = JSON.parse(fs.readFileSync(path.join(dir, "sources.json"), "utf8"));
const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const ok = (buffer, want) => buffer.length === want.bytes && sha(buffer) === want.sha256;

// Retried with a timeout: the image build runs this on every deploy, and a stalled or refused fetch must fail, not hang.
async function download(url) {
  for (let attempt = 1; ; attempt++)
    try {
      return await fetchOnce(url);
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
}
async function fetchOnce(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!response.ok) throw Error(`字型下載失敗：HTTP ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
// One member of a ustar archive (512-byte headers, data padded to 512).
function tarMember(tar, name) {
  for (let at = 0; at + 512 <= tar.length; ) {
    const header = tar.subarray(at, at + 512);
    if (header.every((b) => b === 0)) break;
    const field = (from, length) => header.subarray(from, from + length).toString("utf8").replace(/\0.*$/s, "");
    const prefix = field(345, 155),
      member = (prefix ? prefix + "/" : "") + field(0, 100),
      size = parseInt(field(124, 12).trim() || "0", 8);
    if (member === name) return tar.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  throw Error("壓縮檔內找不到 " + name);
}

async function main() {
  const archives = new Map();
  let fetched = 0;
  for (const file of sources.files) {
    const target = path.join(dir, file.name);
    if (fs.existsSync(target) && ok(fs.readFileSync(target), file)) continue;
    let body;
    if (file.archive) {
      if (!archives.has(file.url)) {
        const gz = await download(file.url);
        if (!ok(gz, file.archive)) throw Error(`字型壓縮檔雜湊與 vendor/fonts/sources.json 不符：${file.url}`);
        archives.set(file.url, zlib.gunzipSync(gz));
      }
      body = tarMember(archives.get(file.url), file.archive.member);
    } else body = await download(file.url);
    if (!ok(body, file)) throw Error(`字型雜湊與 vendor/fonts/sources.json 不符：${file.name}`);
    fs.writeFileSync(target + ".tmp", body);
    fs.renameSync(target + ".tmp", target);
    fetched++;
  }
  console.log(`vendor/fonts: ${sources.files.length} files verified (${fetched} downloaded)`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
