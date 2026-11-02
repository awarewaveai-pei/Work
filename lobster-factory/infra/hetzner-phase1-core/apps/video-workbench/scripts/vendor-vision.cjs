// Copies the MediaPipe browser files the follow worker loads (/assets/vision/...) out of the pinned
// npm package and checks every file in assets/vision/sources.json by SHA-256. Runs as postinstall.
// A mismatch means the npm version and sources.json disagree: fix sources.json deliberately, never skip.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");

const root = path.join(__dirname, ".."), dir = path.join(root, "assets", "vision");
const pkg = path.join(root, "node_modules", "@mediapipe", "tasks-vision");
const sources = JSON.parse(fs.readFileSync(path.join(dir, "sources.json"), "utf8"));
const sha = (p) => (fs.existsSync(p) ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") : null);

const installed = JSON.parse(fs.readFileSync(path.join(pkg, "package.json"), "utf8")).version;
if (installed !== sources.version) throw Error(`@mediapipe/tasks-vision ${installed} 與 sources.json ${sources.version} 不符`);

const bad = [];
for (const { file, sha256 } of sources.files) {
  const target = path.join(dir, file), from = path.join(pkg, file);
  if (sha(target) !== sha256 && fs.existsSync(from)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(from, target);
  }
  if (sha(target) !== sha256) bad.push(file);
}
if (bad.length) {
  console.error("assets/vision 檔案缺少或雜湊不符：" + bad.join(", "));
  process.exit(1);
}
console.log(`assets/vision: ${sources.files.length} files verified`);
