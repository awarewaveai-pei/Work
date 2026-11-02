// Keeps every test runnable from a fresh clone and away from real data:
// 1. no test reaches the operator's running workbench port (use tests/isolated-server.cjs);
// 2. no test uses assets/image-* (third-party captures, not in git; use assets/test-image-1.png / -2.png).
// Until 2026-11-02 five tests did (1) and fourteen did (2), so they tested an old copy or broke on a clone.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");

const dir = __dirname;
const sources = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".cjs") && f !== path.basename(__filename))
  .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]);
const livePort = sources.filter(([, s]) => /(127\.0\.0\.1|localhost):4178\b/.test(s)).map(([f]) => f);
assert.deepEqual(livePort, [], "these tests connect to the live workbench on 4178: " + livePort.join(", "));
const captured = sources.filter(([, s]) => /assets\/image-\d/.test(s)).map(([f]) => f);
assert.deepEqual(captured, [], "these tests use captured images that are not in git: " + captured.join(", "));
console.log("PASS no test connects to port 4178 or uses captured images");
