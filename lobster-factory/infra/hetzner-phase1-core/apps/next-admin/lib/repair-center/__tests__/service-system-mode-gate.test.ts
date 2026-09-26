// startRepairFromIncident: the system-mode gate runs AFTER the incident is
// fetched (so it can use incident.organization_id) and BEFORE any repair_runs
// write. checkProductionChangeAllowed itself is mocked here -- its own contract is
// covered by lib/system-modes/__tests__/production-change-gate.test.ts; this file only proves the wiring.
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ allowed: false, mode: "unavailable" as const, reason: "system_modes unreadable (fail closed)" }));
const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_client: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string; reason?: string }> => gate),
);
// Past the gate the pipeline would reach the backup runner; it must never run from a unit test.
vi.mock("../backup", () => ({ runPreRepairBackup: vi.fn(async () => { throw new Error("backup must not run in tests"); }) }));
vi.mock("../../system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));

const incidentRow = {
  id: "11111111-1111-1111-1111-111111111111",
  organization_id: "org-9",
  source: "uptime_kuma",
  severity: "high",
  client_slug: null,
  title: "DOWN",
  fingerprint: "fp-1",
};

const fromCalls = vi.hoisted(() => [] as string[]);
const sbState = vi.hoisted(() => ({ current: null as unknown }));

function buildFakeSupabase(row: Record<string, unknown> = incidentRow) {
  fromCalls.length = 0;
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => {
    fromCalls.push(table);
    return { select };
  });
  return { from } as unknown as SupabaseClient;
}

// getSupabaseServerClient now also serves sbState.current (was hardcoded null): confirmCriticalRun's
// fetchRepairRunWithIncident reads through it, unlike startRepairFromIncident which only ever uses
// getSupabaseWriteClient -- the existing 4 tests above never call getSupabaseServerClient, so this
// widening does not change their behavior.
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => sbState.current,
  getSupabaseWriteClient: () => sbState.current,
}));
vi.mock("../../supabase-server", () => ({
  getSupabaseServerClient: () => sbState.current,
  getSupabaseWriteClient: () => sbState.current,
}));

import { confirmCriticalRun, startRepairFromIncident } from "../service";

describe("startRepairFromIncident -- system-mode gate", () => {
  beforeEach(() => {
    checkProductionChangeAllowed.mockClear();
    sbState.current = buildFakeSupabase();
  });

  it("blocks with system_mode_blocks_repair carrying the gate's mode, and never touches repair_runs", async () => {
    const result = await startRepairFromIncident({ incidentId: incidentRow.id, actor: "tester", source: "web" });
    expect(result).toEqual({ ok: false, error: "system_mode_blocks_repair", details: { mode: "unavailable" }, blockedMode: "unavailable" });
    expect(fromCalls).not.toContain("repair_runs");
  });

  it("the gate is called with the fetched incident's organization_id, after the incident lookup", async () => {
    await startRepairFromIncident({ incidentId: incidentRow.id, actor: "tester", source: "web" });
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), "org-9");
    expect(fromCalls).toEqual(["ops_incidents"]);
  });

  it("an incident without an organization is gated on the global row only (org null, as the run records it)", async () => {
    sbState.current = buildFakeSupabase({ ...incidentRow, organization_id: null });
    const result = await startRepairFromIncident({ incidentId: incidentRow.id, actor: "tester", source: "web" });
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), null);
    expect(result.error).toBe("system_mode_blocks_repair");
  });

  it("allowed: continues past the gate to the repair_runs lookup", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: true, mode: "normal" });
    await startRepairFromIncident({ incidentId: incidentRow.id, actor: "tester", source: "web" }).catch(() => {});
    expect(fromCalls).toContain("repair_runs");
  });
});

// T21 gap 2: confirmCriticalRun gates BEFORE writing "critical_severity_gate_confirmed" -- a
// blocked confirmation must never carry that entry (chose this over writing a distinct
// "confirmation_blocked" entry AFTER it; see the comment in service.ts for why). Reuses this
// file's sbState/fromCalls plumbing; needs its own fake repair_runs row (with organization_id,
// needs_human_review, state, policy) since the top-level tests above only model ops_incidents.
describe("confirmCriticalRun -- gate runs BEFORE writing \"confirmed\"", () => {
  const RUN_ROW_BASE = {
    id: "run-1",
    incident_id: incidentRow.id,
    organization_id: "org-9",
    needs_human_review: true,
    state: "triage_needed",
    policy: "auto_repair",
  };

  function buildConfirmFakeSupabase() {
    let currentRun: Record<string, unknown> = { ...RUN_ROW_BASE, audit_log: [] as unknown[] };
    const from = vi.fn((table: string) => {
      fromCalls.push(table);
      if (table === "repair_runs") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: currentRun, error: null }) }) }),
          update: (patch: Record<string, unknown>) => {
            currentRun = { ...currentRun, ...patch };
            return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: currentRun, error: null }) }) }) };
          },
        };
      }
      if (table === "ops_incidents") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: incidentRow, error: null }) }) }) };
      }
      throw new Error(`unexpected table in this test's fake Supabase client: ${table}`);
    });
    return { client: { from } as unknown as SupabaseClient, getCurrentRun: () => currentRun };
  }

  beforeEach(() => {
    checkProductionChangeAllowed.mockClear();
    fromCalls.length = 0;
  });

  it("blocked: writes confirmation_blocked, never critical_severity_gate_confirmed, and never re-enters startRepairFromIncident", async () => {
    const fake = buildConfirmFakeSupabase();
    sbState.current = fake.client;
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "maintenance", reason: "system in maintenance" });

    const result = await confirmCriticalRun({ runId: "run-1", actor: "tester" });

    expect(result).toEqual({ ok: false, error: "system_mode_blocks_repair", details: { mode: "maintenance" }, blockedMode: "maintenance" });
    const actions = (fake.getCurrentRun().audit_log as { action: string }[]).map((e) => e.action);
    expect(actions).toContain("confirmation_blocked");
    expect(actions).not.toContain("critical_severity_gate_confirmed");
    // startRepairFromIncident, if reached, would fetch ops_incidents a SECOND time (its own
    // incident lookup, independent of fetchRepairRunWithIncident's one call here).
    expect(fromCalls.filter((t) => t === "ops_incidents")).toHaveLength(1);
  });

  it("the confirmation_blocked entry names the mode", async () => {
    const fake = buildConfirmFakeSupabase();
    sbState.current = fake.client;
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop", reason: "x" });
    await confirmCriticalRun({ runId: "run-1", actor: "tester" });
    const entry = (fake.getCurrentRun().audit_log as { action: string; detail?: string }[]).find((e) => e.action === "confirmation_blocked");
    expect(entry?.detail).toContain("emergency_stop");
  });

  it("gate is checked with the run's own organization_id", async () => {
    const fake = buildConfirmFakeSupabase();
    sbState.current = fake.client;
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "maintenance" });
    await confirmCriticalRun({ runId: "run-1", actor: "tester" });
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(fake.client, "org-9");
  });

  it("allowed: writes critical_severity_gate_confirmed and proceeds into startRepairFromIncident (reaches its own incident lookup)", async () => {
    const fake = buildConfirmFakeSupabase();
    sbState.current = fake.client;
    checkProductionChangeAllowed.mockResolvedValue({ allowed: true, mode: "normal" });

    await confirmCriticalRun({ runId: "run-1", actor: "tester" }).catch(() => {});

    const actions = (fake.getCurrentRun().audit_log as { action: string }[]).map((e) => e.action);
    expect(actions).toContain("critical_severity_gate_confirmed");
    expect(actions).not.toContain("confirmation_blocked");
    expect(fromCalls.filter((t) => t === "ops_incidents").length).toBeGreaterThanOrEqual(2);
  });
});
