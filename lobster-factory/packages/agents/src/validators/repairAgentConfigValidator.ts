export type RepairAgentConfig = {
  name: string;
  version: string;
  domain: string;
  allowedTools: string[];
  deniedTools: string[];
  requiresApprovalFor: string[];
  limits: {
    maxSteps?: number;
    maxCostUsd?: number;
  };
};

export function validateRepairAgentConfig(
  raw: unknown
): { ok: true; value: RepairAgentConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["repair agent config must be an object"] };
  }

  const obj = raw as any;
  const requireString = (key: string) => {
    if (typeof obj[key] !== "string" || obj[key].trim().length === 0) {
      errors.push(`repair agent config: ${key} must be a non-empty string`);
    }
  };

  requireString("name");
  requireString("version");
  requireString("domain");

  const requireStringArray = (key: string) => {
    if (!Array.isArray(obj[key]) || !obj[key].every((x: any) => typeof x === "string")) {
      errors.push(`repair agent config: ${key} must be string[]`);
    }
  };

  requireStringArray("allowedTools");
  requireStringArray("deniedTools");
  requireStringArray("requiresApprovalFor");

  const limits = obj.limits;
  if (!limits || typeof limits !== "object") {
    errors.push("repair agent config: limits must be an object");
  } else {
    const maxSteps = (limits as any).maxSteps;
    if (maxSteps !== undefined && (typeof maxSteps !== "number" || !Number.isFinite(maxSteps))) {
      errors.push("repair agent config: limits.maxSteps must be a number if provided");
    }
    const maxCostUsd = (limits as any).maxCostUsd;
    if (
      maxCostUsd !== undefined &&
      (typeof maxCostUsd !== "number" || !Number.isFinite(maxCostUsd))
    ) {
      errors.push("repair agent config: limits.maxCostUsd must be a number if provided");
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, value: obj as RepairAgentConfig };
}

