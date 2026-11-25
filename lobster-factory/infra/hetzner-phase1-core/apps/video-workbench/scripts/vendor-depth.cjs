// Checks the 影片轉深度影片 model (vendor/depth, not in git: 67 MB) against vendor/depth/sources.json by bytes + sha256
// and fetches a missing file from its pinned URL (scripts/vendor-fonts.cjs fetchVerified: resumable, refuses a mismatch).
// Runs as postinstall and as its own Dockerfile layer. A mismatch means the file changed: stop and investigate, never
// update sources.json to make it pass.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { fetchVerified } = require("./vendor-fonts.cjs");

const dir = path.join(__dirname, "..", "vendor", "depth");
const ok = (file, want) => fs.statSync(file).size === want.bytes && crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") === want.sha256;

async function main() {
  const sources = JSON.parse(fs.readFileSync(path.join(dir, "sources.json"), "utf8"));
  let fetched = 0;
  for (const file of sources.files) {
    const target = path.join(dir, file.name);
    if (fs.existsSync(target)) {
      if (!ok(target, file)) throw Error(`vendor/depth/${file.name} 的大小或雜湊與 sources.json 不符`);
      continue;
    }
    await fetchVerified(file.url, target + ".part", file);
    fs.renameSync(target + ".part", target);
    fetched++;
  }
  console.log(`vendor/depth: ${sources.files.length} files verified (${fetched} downloaded)`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
