// scripts/vendor-fonts.cjs fetchVerified: success depends only on the bytes that arrive (bytes + sha256), never on speed.
// A local server plays the network: slow but steady, cut off half way, silent, ignoring Range, serving a wrong file.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http"),
  crypto = require("node:crypto"),
  { fetchVerified } = require("../scripts/vendor-fonts.cjs");
const pass = (m) => console.log("PASS " + m);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-vendor-fonts-")),
  file = crypto.randomBytes(256 * 1024),
  want = { bytes: file.length, sha256: crypto.createHash("sha256").update(file).digest("hex") },
  log = [];
// mode per path: how the server behaves. Every request is logged with the Range it asked for and the bytes sent.
const server = http.createServer(async (req, res) => {
  const mode = req.url.slice(1),
    m = /^bytes=(\d+)-$/.exec(req.headers.range || ""),
    from = m && mode !== "norange" ? Number(m[1]) : 0,
    body = (mode === "corrupt" ? Buffer.concat([file.subarray(0, 1000), Buffer.from([file[1000] ^ 1]), file.subarray(1001)]) : file).subarray(from),
    entry = { mode, range: req.headers.range || null, sent: 0 };
  log.push(entry);
  res.writeHead(m && mode !== "norange" ? 206 : 200, {
    "Content-Length": body.length,
    ...(m && mode !== "norange" ? { "Content-Range": `bytes ${from}-${file.length - 1}/${file.length}` } : {}),
  });
  const cutAt = mode === "cut" && !m ? 100 * 1024 : mode === "norange" && log.filter((e) => e.mode === "norange").length === 1 ? 64 * 1024 : Infinity;
  for (let at = 0; at < body.length; at += 16 * 1024) {
    if (at >= cutAt) return res.destroy(); // the connection drops mid-file
    if (mode === "silent" && at >= 32 * 1024) return; // headers and 32 KB, then nothing, connection left open
    const chunk = body.subarray(at, at + 16 * 1024);
    await new Promise((r) => res.write(chunk, r)); // flushed before a drop, so the client holds exactly these bytes
    entry.sent += chunk.length;
    if (mode === "slow") await new Promise((r) => setTimeout(r, 120)); // 16 KB per 120 ms: 2 s for the file
  }
  res.end();
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = (mode) => `http://127.0.0.1:${server.address().port}/${mode}`,
    part = (name) => path.join(dir, name + ".part"),
    opts = { idleMs: 400, tries: 1, pause: () => 0 };
  try {
    {
      // The whole file takes ~2 s, five times the 0.4 s silence limit: still fine, since bytes keep arriving.
      const t0 = Date.now(),
        body = await fetchVerified(url("slow"), part("slow"), want, opts);
      assert.ok(body.equals(file) && Date.now() - t0 > 1500);
      pass(`慢速下載：${((Date.now() - t0) / 1000).toFixed(1)} 秒（沒有收資料上限 0.4 秒的 4 倍以上）仍成功，大小與 sha256 相符`);
    }
    {
      // Cut after 100 KB: this run fails and keeps the part; the next run asks for the rest only.
      await assert.rejects(fetchVerified(url("cut"), part("cut"), want, opts));
      const kept = fs.statSync(part("cut")).size;
      assert.ok(kept > 0 && kept < file.length && kept === log.filter((e) => e.mode === "cut")[0].sent);
      const body = await fetchVerified(url("cut"), part("cut"), want, opts),
        second = log.filter((e) => e.mode === "cut")[1];
      assert.ok(body.equals(file));
      assert.equal(second.range, `bytes=${kept}-`);
      assert.equal(second.sent, file.length - kept);
      pass(`中途斷線：第一次留下 ${kept} bytes；重跑送 Range ${second.range}，只再收 ${second.sent} bytes，結果與原檔相同`);
    }
    {
      // The same within one run (tries > 1): the retry continues where the drop happened.
      log.length = 0;
      fs.rmSync(part("cut"), { force: true });
      const body = await fetchVerified(url("cut"), part("cut"), want, { ...opts, tries: 3 });
      assert.ok(body.equals(file) && log.length === 2 && log[1].range === `bytes=${log[0].sent}-`);
      pass("同一次執行內重試也從斷點續傳（2 次請求）");
    }
    {
      // A server that ignores Range (200) on the retry: the part is restarted, not appended to.
      const body = await fetchVerified(url("norange"), part("norange"), want, { ...opts, tries: 3 });
      assert.ok(body.equals(file));
      pass("伺服器不支援 Range（回 200）：從頭重下，不會接錯位置");
    }
    {
      // Headers and 32 KB, then silence: fails after the silence limit, keeps what arrived.
      const t0 = Date.now();
      await assert.rejects(fetchVerified(url("silent"), part("silent"), want, opts), /沒有收到資料/);
      assert.ok(Date.now() - t0 < 3000 && fs.statSync(part("silent")).size === 32 * 1024);
      pass(`連線卡住不送資料：${((Date.now() - t0) / 1000).toFixed(1)} 秒判定失敗，已收的 32 KB 保留供續傳`);
    }
    {
      // Right size, one byte flipped: refused, the part deleted, never retried.
      log.length = 0;
      await assert.rejects(fetchVerified(url("corrupt"), part("corrupt"), want, { ...opts, tries: 3 }), /雜湊/);
      assert.ok(!fs.existsSync(part("corrupt")) && log.length === 1);
      pass("檔案壞掉（同大小、差 1 byte）：擋下、刪掉暫存、不重試");
    }
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
