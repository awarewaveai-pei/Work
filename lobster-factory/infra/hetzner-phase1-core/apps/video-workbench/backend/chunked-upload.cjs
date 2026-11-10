// Card P6.20 (docs/p6-golive-plan-20261103.md "P6.20 大檔分段上傳"): a large file arrives as raw 16 MiB chunks, each
// checked against its own sha256 on receipt and again when the chunks are joined, so no single request nears the
// 100 MB cap in front of video.aware-wave.com. One instance per organization (api.cjs is created per org), so the
// open-bytes quota and the session ids are per org; a session answers only the user who opened it.
// Sessions live in memory and in <dataDir>/uploads/<id>/; a restart drops them (the page uploads again).
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { pipeline } = require("node:stream/promises");

const LIMITS = { chunkBytes: 16 * 1024 * 1024, fileBytes: 500 * 1024 * 1024, openBytes: 2 * 1024 * 1024 * 1024, idleMs: 30 * 60 * 1000 };
const fail = (status, message) => Object.assign(Error(message), { status });
const SHA = /^[a-f0-9]{64}$/;

function createChunkedUploads({ dataDir, limits = {}, now = Date.now }) {
  const L = { ...LIMITS, ...Object.fromEntries(Object.entries(limits).filter(([, v]) => Number.isFinite(v) && v > 0)) };
  const root = path.join(dataDir, "uploads");
  fs.rmSync(root, { recursive: true, force: true }); // sessions never survive a restart
  fs.mkdirSync(root, { recursive: true });
  const sessions = new Map();
  const drop = (s) => {
    sessions.delete(s.id);
    fs.rmSync(s.dir, { recursive: true, force: true });
  };
  function sweep() {
    for (const s of [...sessions.values()]) if (now() - s.touched > L.idleMs) drop(s);
  }
  setInterval(sweep, Math.min(L.idleMs, 60000)).unref();
  // Unknown, expired and someone else's session are the same 404: existence is not revealed.
  function get(id, owner) {
    sweep();
    const s = sessions.get(id);
    if (!s || s.owner !== (owner ?? null)) throw fail(404, "找不到上傳工作，可能已閒置逾時或服務已重啟，請重新上傳");
    s.touched = now();
    return s;
  }
  // received + their sha256 (same order): a resuming page skips a chunk only when its own bytes hash the same.
  const view = (s) => {
    const received = [...s.hashes.keys()].sort((a, b) => a - b);
    return { id: s.id, size: s.size, chunkBytes: L.chunkBytes, chunks: s.chunks, received, hashes: received.map((i) => s.hashes.get(i)) };
  };
  // info = what the caller needs back at complete (the declared type); kept as given.
  function create({ size, info }, owner) {
    if (!Number.isInteger(size) || size < 1) throw fail(400, "檔案大小不正確");
    if (size > L.fileBytes) throw fail(413, `檔案太大，最多 ${Math.round(L.fileBytes / 1048576)} MB`);
    sweep();
    const open = [...sessions.values()].reduce((n, s) => n + s.size, 0);
    if (open + size > L.openBytes) throw fail(429, "同時上傳的檔案太多，請等目前的上傳完成再試");
    const id = crypto.randomUUID(), dir = path.join(root, id);
    fs.mkdirSync(dir);
    const s = { id, dir, owner: owner ?? null, size, chunks: Math.ceil(size / L.chunkBytes), info, hashes: new Map(), touched: now() };
    sessions.set(id, s);
    return view(s);
  }
  // One chunk = the exact bytes of its slot (the last one is the remainder), at most 16 MiB, so it is held in memory, checked,
  // then written to a temp name and renamed: a resent chunk replaces the old one whole and a refused one leaves nothing.
  async function chunk(id, index, stream, sha256, owner) {
    try {
      const s = get(id, owner);
      if (!Number.isInteger(index) || index < 0 || index >= s.chunks) throw fail(400, "分段編號超出範圍");
      sha256 = String(sha256 || "").toLowerCase();
      if (!SHA.test(sha256)) throw fail(400, "缺少分段的 sha256");
      const expected = index === s.chunks - 1 ? s.size - index * L.chunkBytes : L.chunkBytes,
        pieces = [];
      let bytes = 0;
      // destroyOnReturn:false: a refusal mid-stream must still answer (a destroyed request takes the socket with it).
      for await (const piece of stream.iterator({ destroyOnReturn: false })) {
        bytes += piece.length;
        if (bytes > expected) throw fail(400, `第 ${index} 段超過應有的 ${expected} 位元組`);
        pieces.push(piece);
      }
      if (bytes !== expected) throw fail(400, `第 ${index} 段只有 ${bytes}／${expected} 位元組`);
      const data = Buffer.concat(pieces, bytes);
      if (crypto.createHash("sha256").update(data).digest("hex") !== sha256) throw fail(400, `第 ${index} 段的 sha256 不符，請重送這一段`);
      if (!sessions.has(id)) throw fail(404, "上傳工作已結束");
      const tmp = path.join(s.dir, index + ".tmp-" + crypto.randomUUID());
      try {
        fs.writeFileSync(tmp, data);
        fs.renameSync(tmp, path.join(s.dir, index + ".part"));
      } finally {
        fs.rmSync(tmp, { force: true });
      }
      s.hashes.set(index, sha256);
      s.touched = now();
      return view(s);
    } catch (error) {
      stream.resume(); // drain the rest so the refusal reaches the client
      throw error;
    }
  }
  // Joins the chunks in order, re-checking each chunk's sha256 as it is read, and hands the joined file to use(file, info);
  // the session ends either way (a refused file is not uploaded again by resending chunks).
  async function complete(id, owner, use) {
    const s = get(id, owner);
    const missing = [];
    for (let i = 0; i < s.chunks; i++) if (!s.hashes.has(i)) missing.push(i);
    if (missing.length) throw fail(409, `尚缺 ${missing.length} 段（第 ${missing.slice(0, 10).join("、")}${missing.length > 10 ? "…" : ""} 段）`);
    sessions.delete(id); // no chunk, status or second complete from here on
    try {
      const joined = path.join(s.dir, "joined");
      const out = fs.createWriteStream(joined);
      await pipeline(async function* () {
        for (let i = 0; i < s.chunks; i++) {
          const hash = crypto.createHash("sha256");
          for await (const piece of fs.createReadStream(path.join(s.dir, i + ".part"))) {
            hash.update(piece);
            yield piece;
          }
          if (hash.digest("hex") !== s.hashes.get(i)) throw fail(500, `第 ${i} 段在伺服器上已改變，請重新上傳`);
        }
      }, out);
      if (fs.statSync(joined).size !== s.size) throw fail(500, "組裝後大小不符，請重新上傳");
      return await use(joined, s.info);
    } finally {
      fs.rmSync(s.dir, { recursive: true, force: true });
    }
  }
  return { create, status: (id, owner) => view(get(id, owner)), chunk, complete, sweep, sessions: () => sessions.size, limits: L };
}
module.exports = { createChunkedUploads, LIMITS };
