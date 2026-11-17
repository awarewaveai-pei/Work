// Card U4 (docs/video-unify-plan-20261116.md §4 U4): the one way a public URL becomes a library file. Every hop goes through
// product-inspect.cjs publicGet (public HTTPS only, each redirect re-checked, the connection pinned to the checked address);
// this file decides which kinds a caller takes, how big each may be, and that the bytes are what the header says.
// A caller that names `hosts` takes only URLs on those hosts (the stock import: Pexels); one that names `bases` only URLs
// under them (the Story Bible import: our own R2). The product page names neither: a shop's picture can be on any host.
const { publicGet } = require("./product-inspect.cjs");

const KINDS = Object.freeze({
  image: { types: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }, maxBytes: 8_000_000 },
  // A stock clip is one shot (Pexels HD files are 5-40 MB); 100 MB stays under the request cap in front of the video domain.
  video: { types: { "video/mp4": "mp4" }, maxBytes: 100 * 1024 * 1024 },
});
// The stock hosts: the same three next-admin treats as Pexels (lib/content/video/asset-origin.ts PEXELS_HOSTS,
// app/api/video/render-draft/route.ts ALLOWED_HOSTS).
const PEXELS_HOSTS = Object.freeze(["images.pexels.com", "videos.pexels.com", "player.vimeo.com"]);
const hostOf = (raw) => {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
};
const stockHosts = () => [...PEXELS_HOSTS];
// Plan X3 (U9 定裝照): our own storage = the public bases next-admin answers (lib/storage/r2.ts publicBucketBases, through
// main-system.cjs storageBases); none is written here. A URL is ours only under a base with a `/` boundary on the exact
// https host -- the same test as r2.ts isUnderBase, so `https://<base-host>.attacker.tld/x` is not.
const underBase = (raw, base) => {
  if (typeof raw !== "string" || typeof base !== "string" || !base || !raw.startsWith(base + "/")) return false;
  try {
    const u = new URL(raw), b = new URL(base);
    return u.protocol === "https:" && u.host === b.host;
  } catch {
    return false;
  }
};

const valid = (ext, b) =>
  ext === "png" ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  : ext === "jpg" ? b[0] === 255 && b[1] === 216 && b[2] === 255
  : ext === "webp" ? b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP"
  : ext === "mp4" ? b.toString("ascii", 4, 8) === "ftyp"
  : false;

// { bytes, type, ext, kind, url } of one public file of one of `kinds`. `lookup` / `request` = test doubles (publicGet's).
// hosts / bases: when either is named, the URL must be on one of the hosts or under one of the bases.
async function fetchMedia(raw, { kinds, hosts = null, bases = null, lookup, request } = {}) {
  const wanted = (Array.isArray(kinds) ? kinds : []).filter((k) => Object.hasOwn(KINDS, k));
  if (!wanted.length) throw Error("未指定可匯入的素材種類");
  if ((hosts || bases) && !(hosts || []).includes(hostOf(raw)) && !(bases || []).some((b) => underBase(raw, b)))
    throw Object.assign(Error("這個網址不是可匯入的素材來源"), { status: 400 });
  const types = Object.fromEntries(wanted.flatMap((k) => Object.entries(KINDS[k].types).map(([type, ext]) => [type, { ext, kind: k }])));
  const got = await publicGet(raw, {
    maxBytes: Math.max(...wanted.map((k) => KINDS[k].maxBytes)),
    accept: Object.keys(types),
    timeoutMs: wanted.includes("video") ? 120_000 : 20_000,
    lookup,
    request,
  });
  const { ext, kind } = types[got.contentType];
  if (got.bytes.length > KINDS[kind].maxBytes) throw Object.assign(Error("素材檔案過大"), { status: 413 });
  if (!valid(ext, got.bytes)) throw Error("素材格式不正確，請改用本機上傳");
  return { bytes: got.bytes, type: got.contentType, ext, kind, url: got.url };
}

module.exports = { KINDS, PEXELS_HOSTS, stockHosts, underBase, fetchMedia };
