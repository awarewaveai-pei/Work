import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const policyPath = path.join(repoRoot, "packages", "policies", "approval", "v3-governance-gate-policy.json");
const raw = await fs.readFile(policyPath, "utf8");
const policy = JSON.parse(raw);

if (!Array.isArray(policy?.requiredChecks) || policy.requiredChecks.length === 0) {
  throw new Error("v3-governance-gate-policy.json requiredChecks must be non-empty");
}

console.log(`Running V3 governance gates (${policy.requiredChecks.length} checks) ...`);

for (const check of policy.requiredChecks) {
  const label = `${check.id}: ${check.description}`;
  console.log(`\n== ${label} ==`);
  try {
    execSync(check.command, {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    });
  } catch (error) {
    if (check.blocking === false) {
      console.warn(`Non-blocking check failed: ${check.id}`);
      continue;
    }
    throw new Error(`Blocking governance check failed: ${check.id}`);
  }
}

console.log("V3 governance gates PASSED");
