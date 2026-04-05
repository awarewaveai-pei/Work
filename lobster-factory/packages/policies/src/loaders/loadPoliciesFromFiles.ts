import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateProductionDeployPolicy,
  validateRepairAgentPolicy,
  type ProductionDeployPolicy,
  type RepairAgentPolicy,
} from "../validators/policiesValidator";

async function loadJsonFile(filePath: string): Promise<unknown> {
  const rawText = await fs.readFile(filePath, "utf8");
  return JSON.parse(rawText) as unknown;
}

function repoRootFromThisFile() {
  const __filename = fileURLToPath(import.meta.url);
  const __dir = path.dirname(__filename);
  // packages/policies/src/loaders -> packages/policies/src -> packages/policies -> packages -> lobster-factory
  return path.resolve(__dir, "../../../../");
}

export async function loadProductionDeployPolicyFromFile(
  filePath: string
): Promise<ProductionDeployPolicy> {
  const raw = await loadJsonFile(filePath);
  const res = validateProductionDeployPolicy(raw);
  if (!res.ok) throw new Error(`Invalid production deploy policy: ${res.errors.join("; ")}`);
  return res.value;
}

export async function loadRepairAgentPolicyFromFile(
  filePath: string
): Promise<RepairAgentPolicy> {
  const raw = await loadJsonFile(filePath);
  const res = validateRepairAgentPolicy(raw);
  if (!res.ok) throw new Error(`Invalid repair agent policy: ${res.errors.join("; ")}`);
  return res.value;
}

export async function loadDefaultPolicies() {
  const root = repoRootFromThisFile();

  const productionDeployPolicy = await loadProductionDeployPolicyFromFile(
    path.join(root, "packages", "policies", "approval", "production-deploy-policy.json")
  );

  const repairAgentPolicy = await loadRepairAgentPolicyFromFile(
    path.join(root, "packages", "policies", "tool", "repair-agent-policy.json")
  );

  return { productionDeployPolicy, repairAgentPolicy };
}

