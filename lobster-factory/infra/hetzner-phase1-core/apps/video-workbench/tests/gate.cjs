// Deploy gate (P6 L6): the deployment-relevant pure-node tests, each in its own process, plus node --check over the
// server code. Run by sg-deploy.sh inside the built image (Dockerfile.gate) and by video-workbench-ci.yml.
// No network, no port 4178, no Blender: tests that need a browser or a host binary are not listed.
const fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const root = path.join(__dirname, "..");
const tests = ["awarewave-files", "tenancy", "p6-main-system", "migrate-media", "package-sources", "backend", "blender-budget"];
const checks = [
  "server.cjs",
  ...fs.readdirSync(path.join(root, "backend")).filter((f) => f.endsWith(".cjs")).map((f) => "backend/" + f),
  ...fs.readdirSync(path.join(root, "scripts")).filter((f) => f.endsWith(".cjs")).map((f) => "scripts/" + f),
];

let failed = 0;
const run = (label, args) => {
  const t0 = Date.now(), r = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 300000 });
  const ok = r.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${label} (${Date.now() - t0} ms)`);
  if (!ok) { failed++; console.log(String(r.stdout || "").slice(-1500) + String(r.stderr || "").slice(-1500) + (r.error ? String(r.error) : "")); }
};
{
  const t0 = Date.now(), bad = checks.filter((f) => spawnSync(process.execPath, ["--check", f], { cwd: root }).status !== 0);
  console.log(`${bad.length ? "FAIL" : "PASS"} node --check x${checks.length} (server.cjs, backend/*.cjs, scripts/*.cjs) (${Date.now() - t0} ms)`);
  if (bad.length) { failed++; console.log("syntax error in: " + bad.join(", ")); }
}
for (const name of tests) run(`tests/${name}.cjs`, [`tests/${name}.cjs`]);
console.log(failed ? `gate FAILED: ${failed} step(s)` : "gate ok");
process.exit(failed ? 1 : 0);
