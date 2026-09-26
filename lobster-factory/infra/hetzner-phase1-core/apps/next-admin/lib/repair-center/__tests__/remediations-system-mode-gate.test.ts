// tryRemediate: the system-mode gate runs after findRemediation and before
// cooldown, for BOTH auto and manual mode -- a human clicking "Run
// Remediation" does not bypass it. checkProductionChangeAllowed itself is
// mocked here (covered by lib/system-modes/__tests__/production-change-gate.test.ts);
// this file only proves the wiring, via a fake catalog entry whose precheck/execute
// must never be called.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Incident } from "@/lib/ops-inbox/types";

const gate = vi.hoisted(() => ({ allowed: false, mode: "emergency_stop" as const, reason: "system in emergency_stop" }));
const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_client: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string; reason?: string }> => gate),
);
vi.mock("../../system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));

// T21 gap 3: a blocked remediation (auto or manual) now records an ops_action_runs row too --
// defaults to null (matching the real beginOpsActionRun's fail-open return when
// SUPABASE_SERVICE_ROLE_KEY is unset, exactly this test env) so the pre-existing tests below,
// which assert the outcome via exact toEqual with no action_run_id key, are untouched.
const beginOpsActionRun = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));
const finishOpsActionRun = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../ops-actions/record", () => ({ beginOpsActionRun, finishOpsActionRun }));
vi.mock("@/lib/ops-actions/record", () => ({ beginOpsActionRun, finishOpsActionRun }));

const precheck = vi.hoisted(() => vi.fn(async () => ({ ok: true, detail: "must not run" })));
const execute = vi.hoisted(() => vi.fn(async () => ({ ok: true, detail: "must not run" })));
const healthcheck = vi.hoisted(() => vi.fn(async () => ({ ok: true, detail: "must not run" })));
const rollback = vi.hoisted(() => vi.fn(async () => ({ ok: true, detail: "no-op" })));
const fakeRemediation = vi.hoisted(() => ({
  key: "fake-remediation",
  title: "Fake",
  matches: () => true,
  precheck,
  execute,
  healthcheck,
  rollback,
}));
vi.mock("../remediations/index", () => ({ REMEDIATIONS: [fakeRemediation] }));
vi.mock("@/lib/repair-center/remediations/index", () => ({ REMEDIATIONS: [fakeRemediation] }));

import { tryRemediate } from "../remediations/engine";

const baseIncident = (over: Partial<Incident> = {}): Incident =>
  ({
    id: "00000000-0000-0000-0000-000000000002",
    source: "uptime_kuma",
    external_id: "x",
    fingerprint: "fp",
    signal_type: "uptime",
    severity: "high",
    service: "next-admin",
    environment: "production",
    title: "DOWN",
    message: null,
    occurrence_count: 1,
    first_seen_at: "2026-07-03T12:00:00Z",
    last_seen_at: "2026-07-03T12:00:00Z",
    status: "open",
    notes: null,
    due_at: null,
    reopen_count: 0,
    resolved_at: null,
    resolved_by: null,
    ai_provider_suggested: null,
    ai_diagnoses: [],
    cursor_deeplink: null,
    notification_log: [],
    raw: {},
    tags: {},
    created_at: "2026-07-03T12:00:00Z",
    updated_at: "2026-07-03T12:00:00Z",
    client_slug: null,
    organization_id: "org-1",
    ...over,
  }) as Incident;

describe("tryRemediate -- system-mode gate blocks both auto and manual", () => {
  const savedFlag = process.env.AUTO_REMEDIATE_ENABLED;

  beforeEach(() => {
    checkProductionChangeAllowed.mockClear();
    precheck.mockClear();
    execute.mockClear();
    healthcheck.mockClear();
    beginOpsActionRun.mockClear();
    finishOpsActionRun.mockClear();
  });
  afterEach(() => {
    if (savedFlag === undefined) delete process.env.AUTO_REMEDIATE_ENABLED;
    else process.env.AUTO_REMEDIATE_ENABLED = savedFlag;
  });

  it("auto mode: blocked with system_mode_blocks_remediation, precheck/execute/healthcheck never called", async () => {
    process.env.AUTO_REMEDIATE_ENABLED = "true";
    const outcome = await tryRemediate({} as SupabaseClient, baseIncident(), { mode: "auto", actor: "system" });
    expect(outcome).toEqual({ attempted: false, key: "fake-remediation", reason: "system_mode_blocks_remediation", blockedMode: "emergency_stop" });
    expect(precheck).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(healthcheck).not.toHaveBeenCalled();
  });

  it("manual mode: blocked the same way -- a human clicking Remediate does not bypass the gate", async () => {
    const outcome = await tryRemediate({} as SupabaseClient, baseIncident(), { mode: "manual", actor: "ops-console:owner" });
    expect(outcome).toEqual({ attempted: false, key: "fake-remediation", reason: "system_mode_blocks_remediation", blockedMode: "emergency_stop" });
    expect(precheck).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("the gate is queried with the incident's organization_id", async () => {
    await tryRemediate({} as SupabaseClient, baseIncident({ organization_id: "org-42" }), { mode: "manual", actor: "x" });
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), "org-42");
  });

  it("an incident without an organization is gated on the platform org it will be recorded under", async () => {
    const sb = {
      from: (table: string) => {
        if (table !== "organizations") throw new Error(`unexpected table ${table}`);
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "platform-org" }, error: null }) }) }) };
      },
    } as unknown as SupabaseClient;
    const outcome = await tryRemediate(sb, baseIncident({ organization_id: null }), { mode: "manual", actor: "x" });
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(sb, "platform-org");
    expect(outcome.reason).toBe("system_mode_blocks_remediation");
  });

  it("allowed: the call continues past the gate (the cooldown query is the next step)", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: true, mode: "normal" });
    const sb = {
      from: () => {
        throw new Error("past-gate");
      },
    } as unknown as SupabaseClient;
    const outcome = await tryRemediate(sb, baseIncident(), { mode: "manual", actor: "x" });
    expect(outcome).toEqual({ attempted: false, reason: "past-gate" });
    expect(precheck).not.toHaveBeenCalled();
  });

  it("T21: manual mode blocked -- records one ops_action_runs row with a blocked outcome (begin + finish, not silently skipped)", async () => {
    beginOpsActionRun.mockResolvedValueOnce("blocked-run-manual");
    const outcome = await tryRemediate({} as SupabaseClient, baseIncident({ organization_id: "org-7" }), { mode: "manual", actor: "ops-console:owner" });

    expect(beginOpsActionRun).toHaveBeenCalledTimes(1);
    expect(beginOpsActionRun).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: "ops.remediation.fake-remediation", organizationId: "org-7", actorRole: "operator" }),
    );
    expect(finishOpsActionRun).toHaveBeenCalledWith(
      "blocked-run-manual",
      false,
      expect.anything(),
      expect.stringContaining("system_mode_blocks_remediation: emergency_stop"),
    );
    expect(outcome).toEqual({
      attempted: false,
      key: "fake-remediation",
      reason: "system_mode_blocks_remediation",
      blockedMode: "emergency_stop",
      action_run_id: "blocked-run-manual",
    });
  });

  it("T21: auto mode blocked -- the same fix applies (shared gate code path)", async () => {
    process.env.AUTO_REMEDIATE_ENABLED = "true";
    beginOpsActionRun.mockResolvedValueOnce("blocked-run-auto");
    await tryRemediate({} as SupabaseClient, baseIncident(), { mode: "auto", actor: "system" });
    expect(beginOpsActionRun).toHaveBeenCalledTimes(1);
    expect(finishOpsActionRun).toHaveBeenCalledWith("blocked-run-auto", false, expect.anything(), expect.stringContaining("emergency_stop"));
  });

  it("no resolvable organization -- no ops_action_runs row is attempted (matches the pre-existing no_organization outcome's own silence)", async () => {
    const sb = {
      from: (table: string) => {
        if (table !== "organizations") throw new Error(`unexpected table ${table}`);
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      },
    } as unknown as SupabaseClient;
    const outcome = await tryRemediate(sb, baseIncident({ organization_id: null }), { mode: "manual", actor: "x" });
    expect(beginOpsActionRun).not.toHaveBeenCalled();
    expect(outcome).toEqual({ attempted: false, key: "fake-remediation", reason: "system_mode_blocks_remediation", blockedMode: "emergency_stop" });
  });
});
