// A repair or remediation the system mode blocks leaves every exit through the one contract
// (lib/system-modes/blocked-change.ts): the three HTTP routes answer its 423, the Telegram handler
// shows its message. The gate itself is covered by service-/remediations-system-mode-gate tests.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blockedChangeBody, blockedChangeMessage } from "@/lib/system-modes/blocked-change";

vi.mock("@/lib/ops-role", () => ({
  resolveOpsRole: () => ({ role: "owner" }),
  canApproveCommand: () => true,
  canModifyIncidentStatus: () => true,
}));

const BLOCKED = { ok: false, error: "system_mode_blocks_repair", details: { mode: "maintenance" }, blockedMode: "maintenance" };
const startRepairFromIncident = vi.hoisted(() => vi.fn(async (): Promise<Record<string, unknown>> => ({ ok: true })));
const confirmCriticalRun = vi.hoisted(() => vi.fn(async (): Promise<Record<string, unknown>> => ({ ok: true })));
vi.mock("@/lib/repair-center/service", () => ({ startRepairFromIncident, confirmCriticalRun }));

const tryRemediate = vi.hoisted(() => vi.fn(async (): Promise<Record<string, unknown>> => ({ attempted: true, ok: true })));
vi.mock("@/lib/repair-center/remediations/engine", () => ({ tryRemediate }));

const INCIDENT_ID = "00000000-0000-4000-8000-000000000009";
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: INCIDENT_ID }, error: null }) }) }) }),
  }),
}));

const repairs = await import("@/app/api/ops/repairs/route");
const confirm = await import("@/app/api/ops/repairs/[id]/confirm-critical/route");
const remediate = await import("@/app/api/ops/repairs/remediate/route");
const { approveRepairHandler } = await import("@/lib/command-plane/handlers/approveRepair");

const post = (url: string) =>
  new Request(`http://localhost${url}`, { method: "POST", body: JSON.stringify({ incident_id: INCIDENT_ID }) });

beforeEach(() => {
  startRepairFromIncident.mockReset();
  confirmCriticalRun.mockReset();
  tryRemediate.mockReset();
});

describe("repair exits when the system mode blocks", () => {
  it("POST /api/ops/repairs: the shared 423 (was 409 with the machine code)", async () => {
    startRepairFromIncident.mockResolvedValueOnce(BLOCKED);
    const res = await repairs.POST(post("/api/ops/repairs"));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual(blockedChangeBody("maintenance"));
  });

  it("POST /api/ops/repairs: any other failure keeps 409", async () => {
    startRepairFromIncident.mockResolvedValueOnce({ ok: false, error: "backup_failed" });
    expect((await repairs.POST(post("/api/ops/repairs"))).status).toBe(409);
  });

  it("POST /api/ops/repairs: an auto-remediation blocked mid-pipeline (T21 gap 1) is 409, not the shared 423 -- the run already exists with real state and must not be discarded", async () => {
    const runWithRealState = { id: "run-1", state: "triage_needed", audit_log: [{ action: "auto_remediation_blocked_by_system_mode" }] };
    startRepairFromIncident.mockResolvedValueOnce({
      ok: false,
      run: runWithRealState,
      error: "system_mode_blocks_remediation",
      details: { mode: "emergency_stop" },
      // deliberately no top-level blockedMode -- see route.ts's `result.blockedMode !== undefined` check
    });
    const res = await repairs.POST(post("/api/ops/repairs"));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ run: runWithRealState, error: "system_mode_blocks_remediation" });
  });

  it("POST confirm-critical: the shared 423", async () => {
    confirmCriticalRun.mockResolvedValueOnce(BLOCKED);
    const res = await confirm.POST(post("/api/ops/repairs/r1/confirm-critical"), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual(blockedChangeBody("maintenance"));
  });

  it("POST /api/ops/repairs/remediate: the shared 423 (was 200 with a reason code)", async () => {
    tryRemediate.mockResolvedValueOnce({ attempted: false, key: "k", reason: "system_mode_blocks_remediation", blockedMode: "emergency_stop" });
    const res = await remediate.POST(post("/api/ops/repairs/remediate"));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual(blockedChangeBody("emergency_stop"));
  });

  it("Telegram /approve_repair: the shared message", async () => {
    startRepairFromIncident.mockResolvedValueOnce(BLOCKED);
    const out = await approveRepairHandler({ args: { raw: INCIDENT_ID }, actor_ref: "t" } as never, {} as never);
    expect(out.text).toBe(`⛔ ${blockedChangeMessage("maintenance")}`);
  });
});
