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

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => null,
  getSupabaseWriteClient: () => sbState.current,
}));
vi.mock("../../supabase-server", () => ({
  getSupabaseServerClient: () => null,
  getSupabaseWriteClient: () => sbState.current,
}));

import { startRepairFromIncident } from "../service";

describe("startRepairFromIncident -- system-mode gate", () => {
  beforeEach(() => {
    checkProductionChangeAllowed.mockClear();
    sbState.current = buildFakeSupabase();
  });

  it("blocks with system_mode_blocks_repair carrying the gate's mode, and never touches repair_runs", async () => {
    const result = await startRepairFromIncident({ incidentId: incidentRow.id, actor: "tester", source: "web" });
    expect(result).toEqual({ ok: false, error: "system_mode_blocks_repair", details: { mode: "unavailable" } });
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
