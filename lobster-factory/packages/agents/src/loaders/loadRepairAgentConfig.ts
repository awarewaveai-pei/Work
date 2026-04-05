import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateRepairAgentConfig,
  type RepairAgentConfig,
} from "../validators/repairAgentConfigValidator";

export async function loadRepairAgentConfigFromFile(
  filePath: string
): Promise<RepairAgentConfig> {
  const rawText = await fs.readFile(filePath, "utf8");
  const raw = JSON.parse(rawText) as unknown;
  const res = validateRepairAgentConfig(raw);
  if (!res.ok) {
    throw new Error(`Invalid repair agent config: ${res.errors.join("; ")}`);
  }
  return res.value;
}

/**
 * Convenience loader for the default file inside this repo.
 */
export async function loadDefaultRepairAgentConfig() {
  const __filename = fileURLToPath(import.meta.url);
  const __dir = path.dirname(__filename);
  // packages/agents/src/loaders -> lobster-factory (repo root)
  const __repoRoot = path.resolve(__dir, "../../../../");
  return loadRepairAgentConfigFromFile(
    path.join(
      __repoRoot,
      "packages",
      "agents",
      "src",
      "configs",
      "repair-agent.json"
    )
  );
}

