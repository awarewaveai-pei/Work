// The six protected 分鏡靈感 files (handoff §2) may change only in a commit that also updates
// storyboards-design-baseline.json on purpose. Pure node, so the deploy gate (tests/gate.cjs) runs it; until
// 2026-11-06 only two browser tests checked it and three changes shipped unnoticed (31e89c479, 1aaa139d5, de0e1836a).
// assets/storyboards-data.json is captured data kept out of git and the image (.gitignore, .dockerignore):
// checked wherever it exists, i.e. on the operator's machine.
const assert = require("node:assert/strict"), crypto = require("node:crypto"), fs = require("node:fs"), path = require("node:path");

const LOCAL_ONLY = new Set(["assets/storyboards-data.json"]);

function checkStoryboardsBaseline(root = path.join(__dirname, "..")) {
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "storyboards-design-baseline.json"), "utf8"));
  let checked = 0;
  for (const [file, hash] of Object.entries(baseline)) {
    const full = path.join(root, file);
    if (LOCAL_ONLY.has(file) && !fs.existsSync(full)) continue;
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex"), hash, file + " changed");
    checked++;
  }
  return checked;
}

module.exports = { checkStoryboardsBaseline };

if (require.main === module) console.log(`PASS 分鏡靈感受保護檔雜湊不變（${checkStoryboardsBaseline()} 檔）`);
