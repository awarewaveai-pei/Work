// commandRouter: the only entry point for normalised commands. Coordinates
// idempotency -> kill switch -> policy -> dispatch -> record.
// Every collaborator is mocked so this file proves the ORCHESTRATION logic --
// which branch fires in which order -- not any one collaborator's own rules
// (those have dedicated test files: policyEngine.test.ts, killSwitch.test.ts,
// idempotency.test.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeCommand, type CommandHandler } from "../commandRouter";
import { evaluatePolicy } from "../policyEngine";
import { evaluateKillSwitch, getActiveMode } from "../killSwitch";
import { claimCommandRequest, updateRequestStatus } from "../idempotency";
import { reportCommandError } from "../errorReporting";
import type { CommandRequestRow, NormalizedCommand, PolicyDecision } from "../types";

vi.mock("../policyEngine", () => ({ evaluatePolicy: vi.fn() }));
vi.mock("../killSwitch", () => ({ evaluateKillSwitch: vi.fn(), getActiveMode: vi.fn() }));
vi.mock("../idempotency", () => ({ claimCommandRequest: vi.fn(), updateRequestStatus: vi.fn() }));
vi.mock("../errorReporting", () => ({ reportCommandError: vi.fn() }));

const sb = {} as SupabaseClient;

const INPUT: NormalizedCommand = {
  source: "telegram",
  sourceEventId: "evt-1",
  actorType: "human",
  actorRef: "111",
  command: "/status",
  args: {},
  organizationId: "org-1",
  workspaceId: null,
  metadata: {},
};

function row(overrides: Partial<CommandRequestRow> = {}): CommandRequestRow {
  return {
    id: "req-1",
    organization_id: "org-1",
    workspace_id: null,
    source: "telegram",
    source_event_id: "evt-1",
    actor_type: "human",
    actor_ref: "111",
    command: "/status",
    args: {},
    risk_level: "low",
    status: "received",
    workflow_run_id: null,
    approval_id: null,
    rejection_reason: null,
    result: {},
    trace_id: "trace-1",
    received_at: "2026-01-01T00:00:00Z",
    resolved_at: null,
    metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(evaluateKillSwitch).mockReturnValue({ mode: "normal", blocks: false });
  vi.mocked(getActiveMode).mockResolvedValue("normal");
});

describe("routeCommand -- idempotency short-circuit", () => {
  it("returns the existing row's status/result without touching kill switch or policy when isNew is false", async () => {
    const existing = row({ status: "completed", result: { cached: true } });
    vi.mocked(evaluatePolicy).mockReturnValue({ outcome: "allow", riskLevel: "low" });
    vi.mocked(claimCommandRequest).mockResolvedValue({ request: existing, isNew: false });

    const result = await routeCommand(sb, INPUT, { handlers: {} });

    expect(result).toEqual({
      traceId: "trace-1",
      status: "completed",
      commandRequestId: "req-1",
      reason: "already_processed",
      result: { cached: true },
    });
    expect(getActiveMode).not.toHaveBeenCalled();
    expect(updateRequestStatus).not.toHaveBeenCalled();
  });
});

describe("routeCommand -- kill switch", () => {
  it("blocks and records blocked_by_killswitch when the mode blocks, before dispatch", async () => {
    vi.mocked(evaluatePolicy).mockReturnValue({ outcome: "allow", riskLevel: "low" });
    vi.mocked(claimCommandRequest).mockResolvedValue({ request: row(), isNew: true });
    vi.mocked(getActiveMode).mockResolvedValue("emergency_stop");
    vi.mocked(evaluateKillSwitch).mockReturnValue({ mode: "emergency_stop", blocks: true, reason: "system in emergency_stop" });
    const handler = vi.fn();

    const result = await routeCommand(sb, INPUT, { handlers: { "/status": handler } });

    expect(result.status).toBe("blocked_by_killswitch");
    expect(result.reason).toBe("system in emergency_stop");
    expect(handler).not.toHaveBeenCalled();
    expect(updateRequestStatus).toHaveBeenCalledWith(
      sb,
      "req-1",
      expect.objectContaining({ status: "blocked_by_killswitch", rejection_reason: "system in emergency_stop" }),
    );
  });

  it("blocks a medium-risk command as blocked_by_killswitch when system_modes is unreadable, without calling the handler", async () => {
    vi.mocked(evaluatePolicy).mockReturnValue({ outcome: "allow", riskLevel: "medium" });
    vi.mocked(claimCommandRequest).mockResolvedValue({ request: row({ risk_level: "medium" }), isNew: true });
    vi.mocked(getActiveMode).mockResolvedValue("unavailable");
    vi.mocked(evaluateKillSwitch).mockReturnValue({
      mode: "unavailable",
      blocks: true,
      reason: "system_modes unreadable (fail closed)",
    });
    const handler = vi.fn();

    const result = await routeCommand(sb, INPUT, { handlers: { "/status": handler } });

    expect(result.status).toBe("blocked_by_killswitch");
    expect(result.reason).toBe("system_modes unreadable (fail closed)");
    expect(handler).not.toHaveBeenCalled();
    expect(updateRequestStatus).toHaveBeenCalledWith(
      sb,
      "req-1",
      expect.objectContaining({
        status: "blocked_by_killswitch",
        rejection_reason: "system_modes unreadable (fail closed)",
      }),
    );
  });
});

describe("routeCommand -- policy block (unknown command / policy-denied)", () => {
  it("blocks and records blocked_by_policy for an unknown command, never reaching the handler map", async () => {
    const decision: PolicyDecision = { outcome: "block", riskLevel: "high", reason: "unknown_command" };
    vi.mocked(evaluatePolicy).mockReturnValue(decision);
    vi.mocked(claimCommandRequest).mockResolvedValue({ request: row({ command: "/totally_unknown" }), isNew: true });
    const handler = vi.fn();

    const result = await routeCommand(sb, { ...INPUT, command: "/totally_unknown" }, { handlers: { "/totally_unknown": handler } });

    expect(result.status).toBe("blocked_by_policy");
    expect(result.reason).toBe("unknown_command");
    expect(handler).not.toHaveBeenCalled();
    expect(updateRequestStatus).toHaveBeenCalledWith(
      sb,
      "req-1",
      expect.objectContaining({ status: "blocked_by_policy", rejection_reason: "unknown_command" }),
    );
  });
});

describe("routeCommand -- approval required", () => {
  it("queues the request and calls notifyApprovalRequest, without dispatching a handler", async () => {
    vi.mocked(evaluatePolicy).mockReturnValue({ outcome: "require_approval", riskLevel: "high" });
    vi.mocked(claimCommandRequest).mockResolvedValue({ request: row(), isNew: true });
    const handler = vi.fn();
    const notify = vi.fn().mockResolvedValue(undefined);

    const result = await routeCommand(sb, INPUT, { handlers: { "/status": handler }, notifyApprovalRequest: notify });

    expect(result).toMatchObject({ status: "queued", reason: "approval_required" });
    expect(notify).toHaveBeenCalledWith(row());
    expect(handler).not.toHaveBeenCalled();
  });

  it("swallows a notifyApprovalRequest rejection (notification is best-effort, must not fail the route)", async () => {
    vi.mocked(evaluatePolicy).mockReturnValue({ outcome: "require_approval", riskLevel: "high" });
    vi.mocked(claimCommandRequest).mockResolvedValue({ request: row(), isNew: true });
    const notify = vi.fn().mockRejectedValue(new Error("telegram send failed"));

    const result = await routeCommand(sb, INPUT, { handlers: {}, notifyApprovalRequest: notify });

    expect(result.status).toBe("queued");
  });
});

describe("routeCommand -- dispatch (no handler registered)", () => {
  it("records blocked_by_policy with no_handler_registered when allow but the command has no handler entry", async () => {
    vi.mocked(evaluatePolicy).mockReturnValue({ outcome: "allow", riskLevel: "low" });
    vi.mocked(claimCommandRequest).mockResolvedValue({ request: row(), isNew: true });

    const result = await routeCommand(sb, INPUT, { handlers: {} });

    expect(result.status).toBe("blocked_by_policy");
    expect(result.reason).toBe("no_handler_registered");
  });
});

describe("routeCommand -- dispatch success", () => {
  it("runs the handler and records completed with its result", async () => {
    vi.mocked(evaluatePolicy).mockReturnValue({ outcome: "allow", riskLevel: "low" });
    vi.mocked(claimCommandRequest).mockResolvedValue({ request: row(), isNew: true });
    const handler: CommandHandler = vi.fn().mockResolvedValue({ ok: true, count: 3 });

    const result = await routeCommand(sb, INPUT, { handlers: { "/status": handler } });

    expect(result).toMatchObject({ status: "completed", commandRequestId: "req-1", result: { ok: true, count: 3 } });
    expect(handler).toHaveBeenCalledWith(row(), { supabase: sb });
    expect(updateRequestStatus).toHaveBeenCalledWith(sb, "req-1", { status: "dispatched" });
    expect(updateRequestStatus).toHaveBeenCalledWith(
      sb,
      "req-1",
      expect.objectContaining({ status: "completed", result: { ok: true, count: 3 } }),
    );
  });
});

describe("routeCommand -- dispatch failure (handler throws, e.g. on bad/missing args)", () => {
  it("records failed with a truncated rejection_reason and reports the error", async () => {
    vi.mocked(evaluatePolicy).mockReturnValue({ outcome: "allow", riskLevel: "low" });
    vi.mocked(claimCommandRequest).mockResolvedValue({ request: row(), isNew: true });
    const handler: CommandHandler = vi.fn().mockRejectedValue(new Error("missing required arg: client_slug"));

    const result = await routeCommand(sb, INPUT, { handlers: { "/status": handler } });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("missing required arg: client_slug");
    expect(reportCommandError).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ error_code: "handler_threw", organizationId: "org-1" }),
    );
    expect(updateRequestStatus).toHaveBeenCalledWith(
      sb,
      "req-1",
      expect.objectContaining({ status: "failed", rejection_reason: "missing required arg: client_slug" }),
    );
  });

  it("truncates a very long error message to 500 chars in rejection_reason", async () => {
    vi.mocked(evaluatePolicy).mockReturnValue({ outcome: "allow", riskLevel: "low" });
    vi.mocked(claimCommandRequest).mockResolvedValue({ request: row(), isNew: true });
    const longMsg = "x".repeat(600);
    const handler: CommandHandler = vi.fn().mockRejectedValue(new Error(longMsg));

    const result = await routeCommand(sb, INPUT, { handlers: { "/status": handler } });

    expect(result.reason).toHaveLength(500);
  });
});

describe("routeCommand -- idempotency claim itself fails", () => {
  it("reports the error and rethrows, never reaching kill switch/policy/dispatch", async () => {
    vi.mocked(evaluatePolicy).mockReturnValue({ outcome: "allow", riskLevel: "low" });
    vi.mocked(claimCommandRequest).mockRejectedValue(new Error("db unreachable"));

    await expect(routeCommand(sb, INPUT, { handlers: {} })).rejects.toThrow("db unreachable");
    expect(reportCommandError).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ error_code: "claim_failed", organizationId: "org-1" }),
    );
    expect(getActiveMode).not.toHaveBeenCalled();
  });
});
