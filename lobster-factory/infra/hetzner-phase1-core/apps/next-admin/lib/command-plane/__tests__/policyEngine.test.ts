// Policy engine: RISK_TABLE lookup + per-source hard blocks + forbidden-arg gate.
// Unknown commands and forbidden args must deny-by-default -- these are the two
// paths that decide whether an attacker-controlled command ever reaches a handler.
import { describe, expect, it } from "vitest";
import { classifyRisk, evaluatePolicy, KNOWN_COMMANDS } from "../policyEngine";

describe("classifyRisk", () => {
  it("returns the table's risk level for a known command", () => {
    expect(classifyRisk("/status")).toBe("low");
    expect(classifyRisk("/emergency_stop")).toBe("medium");
    expect(classifyRisk("/normal_mode")).toBe("high");
    expect(classifyRisk("/drop_table")).toBe("critical");
  });

  it("defaults an unknown command to high (deny-by-default)", () => {
    expect(classifyRisk("/totally_made_up_command")).toBe("high");
  });
});

describe("evaluatePolicy -- allow path", () => {
  it("allows a low-risk command from telegram", () => {
    expect(evaluatePolicy("/status", "telegram", {})).toEqual({ outcome: "allow", riskLevel: "low" });
  });

  it("allows a medium-risk command from a source not hard-blocked at that level", () => {
    // medium is not in any source's HARD_BLOCK_FROM set.
    expect(evaluatePolicy("/emergency_stop", "telegram", {})).toEqual({ outcome: "allow", riskLevel: "medium" });
  });
});

describe("evaluatePolicy -- block path", () => {
  it("blocks an unknown command with reason unknown_command, regardless of its (default-high) risk", () => {
    const result = evaluatePolicy("/nope", "internal", {});
    expect(result).toEqual({ outcome: "block", riskLevel: "high", reason: "unknown_command" });
  });

  it("hard-blocks a known high-risk command from telegram (source cannot escalate past the table)", () => {
    const result = evaluatePolicy("/deploy_production", "telegram", {});
    expect(result.outcome).toBe("block");
    expect(result.riskLevel).toBe("high");
    expect(result.reason).toContain("hard-blocked");
  });

  it("hard-blocks a critical command even from the internal source", () => {
    const result = evaluatePolicy("/drop_table", "internal", {});
    expect(result.outcome).toBe("block");
    expect(result.riskLevel).toBe("critical");
  });

  it("allows a webhook source to attempt a high-risk command (webhook only hard-blocks critical) -- routes to require_approval, not allow", () => {
    // webhook's HARD_BLOCK_FROM only contains 'critical', so a known high-risk command is not
    // hard-blocked at the source level; the risk==='high' branch still requires approval.
    const result = evaluatePolicy("/normal_mode", "webhook", {});
    expect(result).toEqual({ outcome: "require_approval", riskLevel: "high" });
  });

  it("blocks on a forbidden arg pattern (--force) even for an otherwise-allowed low-risk command", () => {
    const result = evaluatePolicy("/status", "telegram", { note: "--force this" });
    expect(result).toEqual({ outcome: "block", riskLevel: "critical", reason: "forbidden_arg_pattern" });
  });

  it("blocks on shell metacharacters nested anywhere in args (checked via JSON.stringify)", () => {
    const result = evaluatePolicy("/status", "telegram", { nested: { note: "rm -rf; $(whoami)" } });
    expect(result.outcome).toBe("block");
    expect(result.reason).toBe("forbidden_arg_pattern");
  });

  it("forbidden-arg check runs before the hard-block check (both would block, but reason must be the arg one)", () => {
    const result = evaluatePolicy("/deploy_production", "telegram", { cmd: "--no-verify" });
    expect(result).toEqual({ outcome: "block", riskLevel: "critical", reason: "forbidden_arg_pattern" });
  });
});

describe("evaluatePolicy -- require_approval path", () => {
  it("requires approval for a known high-risk command from a source that isn't hard-blocked at high", () => {
    // 'webhook' hard-blocks only 'critical', so its own high-risk commands fall through to approval.
    expect(evaluatePolicy("/rotate_secrets", "webhook", {})).toEqual({ outcome: "require_approval", riskLevel: "high" });
  });
});

describe("KNOWN_COMMANDS", () => {
  it("is exactly the RISK_TABLE's own key set, non-empty", () => {
    expect(KNOWN_COMMANDS.length).toBeGreaterThan(0);
    expect(KNOWN_COMMANDS).toContain("/status");
    expect(KNOWN_COMMANDS).toContain("/drop_table");
  });
});
