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

  if (data.target !== "staging-only") {
    throw new Error(`${file}: target must be staging-only`);
  }

  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    throw new Error(`${file}: steps required`);
  }
}

console.log("All manifests valid");

