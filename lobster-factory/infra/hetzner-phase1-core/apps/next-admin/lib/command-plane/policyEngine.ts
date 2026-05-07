// Policy engine: classify command risk, enforce hard blocks per source.
// Lookup table is the single source of truth for all known commands.
// Unknown commands default to risk='high' and outcome='block' (deny by default).

import type { CommandSource, PolicyDecision, RiskLevel } from "./types";

// Command names use underscore (not hyphen) because Telegram setMyCommands
// only accepts [a-z0-9_] for the slash-menu. Keep parser lenient elsewhere.
const RISK_TABLE: Record<string, RiskLevel> = {
  // low: read-only or text-producing, safe from any source
  "/status": "low",
  "/health": "low",
  "/daily_review": "low",
  "/weekly_review": "low",
  "/list_failed_runs": "low",
  "/runbook": "low",
  "/draft_cursor_task": "low",

  // medium: deferred to Phase 2 (Trigger.dev dispatch)
  "/replay_dead_letter": "medium",
  "/trigger_staging_workflow": "medium",
  "/create_issue": "medium",

  // high: requires approval (ops console SSO)
  "/deploy_production": "high",
  "/refund": "high",
  "/dns_change": "high",
  "/rotate_secrets": "high",

  // critical: never permitted from command plane (must come from ops console + 2FA)
  "/drop_table": "critical",
  "/read_secrets": "critical",
  "/destructive_migration": "critical",
  "/cross_tenant_export": "critical",
  "/disable_killswitch": "critical",
};

// Sources that can NEVER execute high or critical risk commands.
const HARD_BLOCK_FROM: Record<CommandSource, Set<RiskLevel>> = {
  telegram: new Set(["high", "critical"]),
  slack: new Set(["high", "critical"]),
  email: new Set(["high", "critical"]),
  webhook: new Set(["critical"]),
  schedule: new Set(["critical"]),
  internal: new Set(["critical"]),
  github: new Set(["critical"]),
};

// Args that always reject (basic shell-injection defence — even if handler is internal).
const FORBIDDEN_ARG_PATTERNS = [/--no-verify\b/i, /--force\b/i, /[;&|`]/, /\$\(/];

export function classifyRisk(command: string): RiskLevel {
  const known = RISK_TABLE[command];
  if (known) return known;
  // Unknown commands deny-by-default.
  return "high";
}

export function evaluatePolicy(
  command: string,
  source: CommandSource,
  args: Record<string, unknown>,
): PolicyDecision {
  const risk = classifyRisk(command);

  if (!RISK_TABLE[command]) {
    return { outcome: "block", riskLevel: risk, reason: "unknown_command" };
  }

  if (containsForbiddenArgs(args)) {
    return { outcome: "block", riskLevel: "critical", reason: "forbidden_arg_pattern" };
  }

  const hardBlocked = HARD_BLOCK_FROM[source];
  if (hardBlocked && hardBlocked.has(risk)) {
    return {
      outcome: "block",
      riskLevel: risk,
      reason: `risk='${risk}' is hard-blocked from source='${source}'`,
    };
  }

  if (risk === "high") {
    return { outcome: "require_approval", riskLevel: risk };
  }

  return { outcome: "allow", riskLevel: risk };
}

function containsForbiddenArgs(args: Record<string, unknown>): boolean {
  const flat = JSON.stringify(args);
  return FORBIDDEN_ARG_PATTERNS.some((p) => p.test(flat));
}

export const KNOWN_COMMANDS = Object.keys(RISK_TABLE);
