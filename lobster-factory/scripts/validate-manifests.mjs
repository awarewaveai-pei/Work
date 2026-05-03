import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const dir = path.join(repoRoot, "packages", "manifests");
const files = await fs.readdir(dir);

for (const file of files) {
  if (!file.endsWith(".json")) continue;

  const raw = await fs.readFile(path.join(dir, file), "utf8");
  const data = JSON.parse(raw);

  if (data.target === "staging-only") {
    // Phase-1 shell / executor experiments (e.g. wc-core)
  } else if (data.target === "wordpress") {
    // Catalog-backed Client OS manifests (must mirror DB seeds, e.g. 0023 / manifests table)
    if (typeof data.applyMode !== "string" || !data.applyMode.trim()) {
      throw new Error(`${file}: target wordpress requires non-empty applyMode`);
    }
  } else {
    throw new Error(
      `${file}: target must be "staging-only" or "wordpress" (see packages/db/migrations catalog seeds)`
    );
  }

  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    throw new Error(`${file}: steps required`);
  }
}

console.log("All manifests valid");

