// Card U4 (docs/video-unify-plan-20261116.md §4 U4): the stock import takes a file only from the stock hosts (Pexels' three).
// A host outside the list is refused before any DNS lookup or request; a listed host brings in an image or an mp4 by its bytes. Zero real network. Mutation: drop the host check in url-import.cjs -> red.
const assert = require("node:assert/strict"), { EventEmitter } = require("node:events");
const { fetchMedia, stockHosts } = require("../backend/url-import.cjs");

(async () => {
  let lookups = 0, requests = 0;
  const lookup = async () => (lookups++, [{ address: "93.184.216.34", family: 4 }]);
  const serve = (type, bytes) => (url, options, onResponse) => {
    requests++;
    const req = new EventEmitter();
    req.destroy = (error) => { if (error) req.emit("error", error); req.emit("close"); };
    req.end = () => queueMicrotask(() => {
      const res = new EventEmitter();
      res.statusCode = 200; res.headers = { "content-type": type }; res.destroy = () => req.emit("close");
      onResponse(res); res.emit("data", bytes); res.emit("end"); req.emit("close");
    });
    return req;
  };
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 16]), mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom")]);
  const hosts = stockHosts();

  await assert.rejects(() => fetchMedia("https://example.com/a.jpg", { kinds: ["image", "video"], hosts, lookup, request: serve("image/jpeg", jpeg) }), /不是可匯入的素材來源/);
  await assert.rejects(() => fetchMedia("https://pub-ours.r2.dev/designs/a.jpg", { kinds: ["image"], hosts, lookup, request: serve("image/jpeg", jpeg) }), /不是可匯入的素材來源/);
  assert.equal(lookups + requests, 0, "不在名單的網址不該查 DNS 或送出請求");

  const image = await fetchMedia("https://images.pexels.com/photos/1/a.jpeg", { kinds: ["image", "video"], hosts, lookup, request: serve("image/jpeg", jpeg) });
  assert.deepEqual([image.kind, image.ext], ["image", "jpg"]);
  const clip = await fetchMedia("https://videos.pexels.com/video-files/1/a.mp4", { kinds: ["image", "video"], hosts, lookup, request: serve("video/mp4", mp4) });
  assert.deepEqual([clip.kind, clip.ext], ["video", "mp4"]);
  console.log("PASS 圖庫匯入只收白名單主機（名單外不查 DNS、不送請求）；Pexels 圖片與 mp4 依內容匯入");
})().catch((e) => { console.error(e); process.exitCode = 1; });
