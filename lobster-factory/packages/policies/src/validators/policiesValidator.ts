export type ProductionDeployPolicy = {
  name: string;
  resourceType: string;
  rules: Array<{
    match: { environment: string };
    requiredApprovals: Array<{ role: string; count: number }>;
    mode: "hard_block" | string;
  }>;
};

export type RepairAgentPolicy = {
  name: string;
  allowedTools: string[];
  deniedTools: string[];
  environmentConstraints: {
    allowedEnvironments: string[];
    blockedEnvironments: string[];
  };
  requiresApprovalFor: string[];
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

export function validateProductionDeployPolicy(
  raw: unknown
): { ok: true; value: ProductionDeployPolicy } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["production deploy policy must be an object"] };
  }

  const obj = raw as any;
  if (!isNonEmptyString(obj.name)) errors.push("production policy: name must be a non-empty string");
  if (!isNonEmptyString(obj.resourceType)) errors.push("production policy: resourceType must be a non-empty string");

  if (!Array.isArray(obj.rules) || obj.rules.length === 0) {
    errors.push("production policy: rules must be a non-empty array");
  } else {
    for (let i = 0; i < obj.rules.length; i++) {
      const rule = obj.rules[i] as any;
      if (!rule || typeof rule !== "object") {
        errors.push(`production policy: rule[${i}] must be an object`);
        continue;
      }
      if (!rule.match || typeof rule.match !== "object" || !isNonEmptyString(rule.match.environment)) {
        errors.push(`production policy: rule[${i}].match.environment must be a non-empty string`);
      }
      if (!Array.isArray(rule.requiredApprovals) || rule.requiredApprovals.length === 0) {
        errors.push(`production policy: rule[${i}].requiredApprovals must be a non-empty array`);
      } else {
        for (let j = 0; j < rule.requiredApprovals.length; j++) {
          const ra = rule.requiredApprovals[j] as any;
          if (!isNonEmptyString(ra.role)) errors.push(`production policy: rule[${i}].requiredApprovals[${j}].role must be a non-empty string`);
          if (typeof ra.count !== "number" || !Number.isFinite(ra.count)) {
            errors.push(`production policy: rule[${i}].requiredApprovals[${j}].count must be a finite number`);
          }
        }
      }
      if (!isNonEmptyString(rule.mode)) errors.push(`production policy: rule[${i}].mode must be a string`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: obj as ProductionDeployPolicy };
}

export function validateRepairAgentPolicy(
  raw: unknown
): { ok: true; value: RepairAgentPolicy } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["repair agent policy must be an object"] };
  }

  const obj = raw as any;
  if (!isNonEmptyString(obj.name)) errors.push("repair policy: name must be a non-empty string");
  if (!isStringArray(obj.allowedTools)) errors.push("repair policy: allowedTools must be string[]");
  if (!isStringArray(obj.deniedTools)) errors.push("repair policy: deniedTools must be string[]");
  if (!Array.isArray(obj.requiresApprovalFor) || !obj.requiresApprovalFor.every((v: any) => typeof v === "string")) {
    errors.push("repair policy: requiresApprovalFor must be string[]");
  }

  const ec = obj.environmentConstraints;
  if (!ec || typeof ec !== "object") {
    errors.push("repair policy: environmentConstraints must be an object");
  } else {
    if (!isStringArray(ec.allowedEnvironments)) errors.push("repair policy: environmentConstraints.allowedEnvironments must be string[]");
    if (!isStringArray(ec.blockedEnvironments)) errors.push("repair policy: environmentConstraints.blockedEnvironments must be string[]");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: obj as RepairAgentPolicy };
}

