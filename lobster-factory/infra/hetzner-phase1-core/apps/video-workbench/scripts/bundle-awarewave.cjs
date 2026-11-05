// Copies every next-admin file listed in awarewave-files.txt into .awarewave/ (the image's bundledAppDir), fresh each run.
// Usage: node scripts/bundle-awarewave.cjs [next-admin dir]   (default: appDir of awarewave-source.json)
// Used by sg-deploy.sh (before the image build) and video-workbench-ci.yml. Exits 1 when a listed file is missing.
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "awarewave-source.json"), "utf8"));
const source = path.resolve(process.argv[2] || path.join(root, config.appDir));
const target = path.join(root, config.bundledAppDir);
const files = require("../backend/appearance.cjs").runtimeFiles(root);

const missing = files.filter((f) => path.isAbsolute(f) || f.split("/").includes("..") || !fs.existsSync(path.join(source, f)));
if (missing.length) {
  console.error(`bundle-awarewave: not found under ${source}: ${missing.join(", ")}`);
  process.exit(1);
}
fs.rmSync(target, { recursive: true, force: true });
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(target, f)), { recursive: true });
  fs.copyFileSync(path.join(source, f), path.join(target, f));
}
console.log(`bundle-awarewave: ${files.length} files -> ${target}`);
