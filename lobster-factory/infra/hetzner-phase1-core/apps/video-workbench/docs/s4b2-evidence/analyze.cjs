// Card S4b.2 evidence: per GLB triangles, vertices, textures (count, size, format), file size; renders (thumbs.py) and one
// contact sheet: each row = input image | SPAR3D front | SPAR3D 45° | TRELLIS front | TRELLIS 45°. Reads/updates results.json.
// Run after run.cjs: node docs/s4b2-evidence/analyze.cjs
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), { spawnSync } = require("node:child_process");
const app = path.join(__dirname, "..", ".."), data = path.join(app, ".data");
const results = JSON.parse(fs.readFileSync(path.join(__dirname, "results.json"), "utf8"));
const fileOf = (url) => path.join(data, url.slice(1));

function imageSize(buf, mime) {
  if (mime === "image/png") return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (mime === "image/jpeg") {
    for (let i = 2; i < buf.length; ) {
      const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  if (mime === "image/webp") {
    const kind = buf.toString("latin1", 12, 16);
    if (kind === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (kind === "VP8L") { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
    if (kind === "VP8X") return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  }
  return null;
}
function glbStats(file) {
  const buf = fs.readFileSync(file), jsonLen = buf.readUInt32LE(12), gltf = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  const binStart = 20 + jsonLen + 8;
  let tris = 0, verts = 0;
  for (const m of gltf.meshes || []) for (const p of m.primitives) {
    const n = gltf.accessors[p.attributes.POSITION].count;
    verts += n;
    tris += (p.indices != null ? gltf.accessors[p.indices].count : n) / 3;
  }
  const textures = (gltf.images || []).map((im) => {
    const bv = gltf.bufferViews[im.bufferView], bytes = buf.subarray(binStart + (bv.byteOffset || 0), binStart + (bv.byteOffset || 0) + bv.byteLength);
    const size = imageSize(bytes, im.mimeType);
    return `${im.mimeType.split("/")[1]} ${size ? size.join("×") : "?"}`;
  });
  const mat = (gltf.materials || [])[0]?.pbrMetallicRoughness || {};
  return { triangles: Math.round(tris), vertices: verts, textures, metallicRoughnessMap: !!mat.metallicRoughnessTexture, megabytes: +(buf.length / 1048576).toFixed(2) };
}

const thumbs = fs.mkdtempSync(path.join(os.tmpdir(), "s4b2-thumbs-"));
const items = [];
for (const row of results.images)
  for (const [method, run] of Object.entries(row.runs))
    if (run.url) {
      run.stats = glbStats(fileOf(run.url));
      items.push(`${row.n}-${method}=${fileOf(run.url)}@${method === "stability-spar3d" ? 180 : 0}`);
    }
const blender = path.join(app, "runtime", "blender", "blender.exe");
const r = spawnSync(blender, ["-b", "--factory-startup", "--python", path.join(__dirname, "thumbs.py"), "--", thumbs, ...items], { encoding: "utf8", maxBuffer: 64e6 });
if (r.status !== 0) throw Error("thumbs failed: " + r.stderr.slice(-2000));
// Contact sheet with ffmpeg: 5 columns x rows, 192 px tiles, a gray tile where a run failed.
const ffmpeg = require("ffmpeg-static"), tiles = [];
for (const row of results.images) {
  tiles.push(fileOf(row.image.url));
  for (const method of ["stability-spar3d", "replicate-trellis"])
    for (const view of ["front", "side"]) {
      const f = path.join(thumbs, `${row.n}-${method}-${view}.png`);
      tiles.push(fs.existsSync(f) ? f : null);
    }
}
const inputs = [], filters = [], cols = 5, size = 192;
tiles.forEach((f, i) => {
  if (f) inputs.push("-i", f);
  else inputs.push("-f", "lavfi", "-i", `color=c=gray:s=${size}x${size}:d=1`);
  filters.push(`[${i}:v]scale=${size}:${size},setsar=1[t${i}]`);
});
const layout = tiles.map((_, i) => `${(i % cols) * size}_${Math.floor(i / cols) * size}`).join("|");
filters.push(tiles.map((_, i) => `[t${i}]`).join("") + `xstack=inputs=${tiles.length}:layout=${layout}`);
const sheet = path.join(__dirname, "contact-sheet.jpg");
const f = spawnSync(ffmpeg, ["-y", "-loglevel", "error", ...inputs, "-filter_complex", filters.join(";"), "-frames:v", "1", "-q:v", "4", sheet], { encoding: "utf8" });
if (f.status !== 0) throw Error("ffmpeg failed: " + f.stderr);
fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify(results, null, 1));
console.log("sheet", sheet, "thumbs", thumbs);
