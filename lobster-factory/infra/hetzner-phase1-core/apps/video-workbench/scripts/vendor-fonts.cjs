// Downloads the editor's pinned fonts into vendor/fonts/ and checks each against vendor/fonts/sources.json (bytes +
// sha256; a tar.gz member also checks its archive). Runs as postinstall on every platform: the preview's @font-face and
// the export's ass fontsdir both read these files, so no output depends on the machine's installed fonts.
// A mismatch means the upstream file changed: stop and investigate, never update sources.json to make it pass.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), zlib = require("node:zlib");

const dir = path.join(__dirname, "..", "vendor", "fonts");
const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const ok = (buffer, want) => buffer.length === want.bytes && sha(buffer) === want.sha256;

// Whether a download succeeds depends only on the bytes that arrive, never on how fast: there is no limit on a whole
// file, only on silence (no byte for `idleMs`), and every try continues from what earlier tries left in `part`
// (HTTP Range). A server that ignores Range (200) restarts the file. The result is checked by bytes + sha256; a complete
// file that does not match is deleted and refused (no retry: the upstream file changed).
const IDLE_MS = 60000,
  TRIES = 8;
async function fetchVerified(url, part, want, { idleMs = IDLE_MS, tries = TRIES, pause = (n) => 2000 * n } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      await fetchInto(url, part, want.bytes, idleMs);
    } catch (error) {
      if (error.fatal || attempt >= tries) throw error;
      await new Promise((r) => setTimeout(r, pause(attempt)));
      continue;
    }
    const size = fs.existsSync(part) ? fs.statSync(part).size : 0;
    if (size < want.bytes) {
      // The server ended the body early without an error: the next try asks for the rest.
      if (attempt >= tries) throw Error(`字型下載未完成（${size}／${want.bytes} bytes）：${url}`);
      continue;
    }
    const body = fs.readFileSync(part);
    if (ok(body, want)) return body;
    fs.rmSync(part, { force: true });
    throw Object.assign(Error(`下載的檔案大小或雜湊與 vendor/fonts/sources.json 不符：${url}`), { fatal: true });
  }
}
// One request appending to `part` from its current size; rejects after `idleMs` without a byte (headers included).
async function fetchInto(url, part, total, idleMs) {
  let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
  if (have >= total) return;
  const controller = new AbortController();
  let timer;
  const quiet = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(Error(`字型下載 ${idleMs / 1000} 秒沒有收到資料：${url}`)), idleMs);
  };
  quiet();
  let fd = null;
  try {
    const response = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {}, signal: controller.signal });
    if (response.status === 206) {
      const start = Number(/^bytes (\d+)-/.exec(response.headers.get("content-range") || "")?.[1]);
      if (start !== have) throw Error(`續傳位置不符（要 ${have}，收到 ${start}）：${url}`);
    } else if (response.ok) have = 0;
    else if (response.status === 416) return; // asked past the end: the size check in fetchVerified decides
    else
      throw Object.assign(Error(`字型下載失敗：HTTP ${response.status} ${url}`), {
        fatal: response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status),
      });
    fd = fs.openSync(part, have ? "a" : "w");
    for await (const chunk of response.body) {
      quiet();
      fs.writeSync(fd, chunk);
      have += chunk.length;
      if (have > total) throw Object.assign(Error(`下載超過 sources.json 記錄的大小：${url}`), { fatal: true });
    }
  } catch (error) {
    throw controller.signal.aborted && controller.signal.reason instanceof Error ? controller.signal.reason : error;
  } finally {
    clearTimeout(timer);
    if (fd !== null) fs.closeSync(fd);
  }
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
  const sources = JSON.parse(fs.readFileSync(path.join(dir, "sources.json"), "utf8"));
  const archives = new Map();
  let fetched = 0;
  for (const file of sources.files) {
    const target = path.join(dir, file.name);
    if (fs.existsSync(target) && ok(fs.readFileSync(target), file)) continue;
    let body;
    if (file.archive) {
      if (!archives.has(file.url)) {
        const part = path.join(dir, `archive-${file.archive.sha256.slice(0, 16)}.part`);
        archives.set(file.url, zlib.gunzipSync(await fetchVerified(file.url, part, file.archive)));
        fs.rmSync(part, { force: true });
      }
      body = tarMember(archives.get(file.url), file.archive.member);
      if (!ok(body, file)) throw Error(`字型雜湊與 vendor/fonts/sources.json 不符：${file.name}`);
      fs.writeFileSync(target + ".tmp", body);
      fs.renameSync(target + ".tmp", target);
    } else {
      await fetchVerified(file.url, target + ".part", file);
      fs.renameSync(target + ".part", target);
    }
    fetched++;
  }
  console.log(`vendor/fonts: ${sources.files.length} files verified (${fetched} downloaded)`);
}
module.exports = { fetchVerified };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
