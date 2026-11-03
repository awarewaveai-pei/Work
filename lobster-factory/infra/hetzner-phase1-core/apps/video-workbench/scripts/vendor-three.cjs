// Copies the pinned three.js files the 3D viewer uses (card P5) into vendor/three/<version>/ and writes VERSION.json
// (file list + sha256). The npm tarball is checked against the registry's dist.integrity (sha512) before unpacking.
// The output is committed (MIT, small) and served as static files: no CDN at runtime. Run by hand when the pin
// changes (`node scripts/vendor-three.cjs`); idempotent: an existing VERSION.json whose hashes match is left alone.
// WebGLRenderer only: WebGPU crashes the operator's Edge on this laptop, so no WebGPU build is copied.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const VERSION = "0.186.0";
const INTEGRITY = "sha512-cr/fIM2ddMSVbYVgkfD4jLJv7Fh/8ZTjvo+7gQeSVGUZHxpx9FDwoL5iC7hUz/LiRA8wMbqfnb90xKfm1/HHkQ==";
// Package path -> path under vendor/three/<version>/. Addons keep their examples/jsm layout so relative imports resolve.
const FILES = {
  LICENSE: "LICENSE",
  // 0.186 ships no minified build.
  "build/three.module.js": "build/three.module.js",
  "build/three.core.js": "build/three.core.js",
  "examples/jsm/loaders/GLTFLoader.js": "addons/loaders/GLTFLoader.js",
  "examples/jsm/utils/BufferGeometryUtils.js": "addons/utils/BufferGeometryUtils.js",
  "examples/jsm/utils/SkeletonUtils.js": "addons/utils/SkeletonUtils.js",
  "examples/jsm/controls/OrbitControls.js": "addons/controls/OrbitControls.js",
  "examples/jsm/controls/TransformControls.js": "addons/controls/TransformControls.js",
  "examples/jsm/animation/CCDIKSolver.js": "addons/animation/CCDIKSolver.js",
};
const target = path.join(__dirname, "..", "vendor", "three", VERSION), manifest = path.join(target, "VERSION.json");
const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

function intact() {
  if (!fs.existsSync(manifest)) return false;
  const m = JSON.parse(fs.readFileSync(manifest, "utf8"));
  return m.version === VERSION && Object.values(FILES).every((f) => fs.existsSync(path.join(target, f)) && sha(fs.readFileSync(path.join(target, f))) === m.files[f]);
}
async function main() {
  if (intact()) return console.log(`vendor/three: ${VERSION} verified`);
  const meta = await (await fetch(`https://registry.npmjs.org/three/${VERSION}`)).json();
  if (meta.dist?.integrity !== INTEGRITY) throw Error("registry dist.integrity 與釘選值不符：停下來查，不要改釘選值");
  const response = await fetch(meta.dist.tarball);
  if (!response.ok) throw Error(`three 下載失敗：HTTP ${response.status}`);
  const tgz = Buffer.from(await response.arrayBuffer());
  if ("sha512-" + crypto.createHash("sha512").update(tgz).digest("base64") !== INTEGRITY) throw Error("three 壓縮檔 sha512 不符");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "vw-three-"));
  try {
    fs.writeFileSync(path.join(work, "three.tgz"), tgz);
    execFileSync(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe"), ["-xzf", "three.tgz", ...Object.keys(FILES).map((f) => "package/" + f)], { cwd: work, windowsHide: true });
    fs.rmSync(target, { recursive: true, force: true });
    const files = {};
    for (const [from, to] of Object.entries(FILES)) {
      const buffer = fs.readFileSync(path.join(work, "package", ...from.split("/")));
      fs.mkdirSync(path.dirname(path.join(target, to)), { recursive: true });
      fs.writeFileSync(path.join(target, to), buffer);
      files[to] = sha(buffer);
    }
    fs.writeFileSync(manifest, JSON.stringify({ name: "three", version: VERSION, license: "MIT", source: meta.dist.tarball, integrity: INTEGRITY, files }, null, 2) + "\n");
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log(`vendor/three: ${VERSION} downloaded and verified`);
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
