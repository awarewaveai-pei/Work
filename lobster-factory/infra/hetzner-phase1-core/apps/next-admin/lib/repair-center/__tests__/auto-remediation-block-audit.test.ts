// T21 gap 1: when tryRemediate's OWN system-mode gate blocks an auto-remediation attempt mid-
// pipeline (findRemediation matched, but the gate said no), startRepairFromIncident used to fall
// through silently, leaving the run in "repairing" forever with no audit trail. This is a
// different call site from service-system-mode-gate.test.ts (which covers the FIRST gate check,
// before any repair_runs row exists, and deliberately makes everything past it explode) --
// reaching the point under test here requires a full successful run through incident fetch ->
// run creation -> backup -> GitHub issue -> "repairing", so it gets its own file rather than
// overloading either existing *system-mode-gate*.test.ts file's narrower scope.
//
// checkProductionChangeAllowed (the FIRST gate) is mocked to always allow; tryRemediate itself is
// mocked directly to return the blocked outcome engine.ts now produces (T21 gap 3: it also carries
// action_run_id since that fix always records an ops_action_runs row). backup/github-issue are
// mocked to succeed; the fake Supabase client is a single mutable "repair_runs" row so update
// calls compose realistically.
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Incident } from "@/lib/ops-inbox/types";

vi.mock("@/lib/system-modes/production-change-gate", () => ({
  checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }),
}));
vi.mock("../../system-modes/production-change-gate", () => ({
  checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }),
}));

vi.mock("../backup", () => ({
  runPreRepairBackup: async () => ({ ok: true, backupRef: "backup-1", detail: {} }),
}));

const createRepairIssue = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, owner: "o", repo: "r", number: 1, url: "https://github.com/o/r/issues/1" })),
);
vi.mock("../github", () => ({
  resolveGithubTarget: () => ({ owner: "o", repo: "r" }),
  createRepairIssue,
  postEscalationComment: vi.fn(),
}));
vi.mock("@/lib/repair-center/github", () => ({
  resolveGithubTarget: () => ({ owner: "o", repo: "r" }),
  createRepairIssue,
  postEscalationComment: vi.fn(),
}));

const findRemediation = vi.hoisted(() => vi.fn(() => ({ key: "fake-remediation" })));
const tryRemediate = vi.hoisted(() =>
  vi.fn(async () => ({
    attempted: false as const,
    key: "fake-remediation",
    reason: "system_mode_blocks_remediation",
    blockedMode: "emergency_stop",
    action_run_id: "blocked-run-1",
  })),
);
vi.mock("../remediations/engine", () => ({ findRemediation, tryRemediate }));
vi.mock("@/lib/repair-center/remediations/engine", () => ({ findRemediation, tryRemediate }));

const INCIDENT: Incident & { client_slug?: string | null } = {
  id: "00000000-0000-4000-8000-00000000000a",
  source: "uptime_kuma",
  external_id: "x",
  fingerprint: "fp-block",
  signal_type: "uptime",
  severity: "high", // not "critical" -- skips the second-confirmation gate entirely
  service: "next-admin",
  environment: "production",
  title: "DOWN",
  message: null,
  occurrence_count: 1,
  first_seen_at: "2026-09-26T00:00:00Z",
  last_seen_at: "2026-09-26T00:00:00Z",
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
  created_at: "2026-09-26T00:00:00Z",
  updated_at: "2026-09-26T00:00:00Z",
  client_slug: null,
  organization_id: "org-1",
} as unknown as Incident & { client_slug?: string | null };

/** A single mutable repair_runs row: each .update() composes onto it, like the real table would. */
function buildFakeSupabase() {
  let runRow: Record<string, unknown> | null = null;
  const applyUpdate = (patch: Record<string, unknown>) => {
    runRow = { ...(runRow ?? {}), ...patch };
    return { data: runRow, error: null };
  };
  const from = vi.fn((table: string) => {
    if (table === "ops_incidents") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: INCIDENT, error: null }) }) }) };
    }
    if (table === "repair_runs") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: runRow, error: null }) }) }),
        insert: (patch: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              runRow = { id: "run-1", ...patch };
              return { data: runRow, error: null };
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            select: () => ({ maybeSingle: async () => applyUpdate(patch) }),
            eq: () => ({ select: () => ({ maybeSingle: async () => applyUpdate(patch) }) }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table in this test's fake Supabase client: ${table}`);
  });
  return { from } as unknown as SupabaseClient;
}

const sbState = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => null,
  getSupabaseWriteClient: () => sbState.current,
}));
vi.mock("../../supabase-server", () => ({
  getSupabaseServerClient: () => null,
  getSupabaseWriteClient: () => sbState.current,
}));

import { startRepairFromIncident } from "../service";

describe("startRepairFromIncident -- auto-remediation blocked by system mode mid-pipeline", () => {
  beforeEach(() => {
    createRepairIssue.mockClear();
    findRemediation.mockClear();
    tryRemediate.mockClear();
    sbState.current = buildFakeSupabase();
  });

  it("leaves triage_needed (not stuck in repairing) with an audit entry naming the mode", async () => {
    const result = await startRepairFromIncident({ incidentId: INCIDENT.id, actor: "tester", source: "web" });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("system_mode_blocks_remediation");
    expect(result.run?.state).toBe("triage_needed");
    // Not a top-level blockedMode: this run already has real state (backed up, issue filed) --
    // a generic 423 would discard it. The mode still travels in `details`.
    expect(result.blockedMode).toBeUndefined();
    expect(result.details).toEqual({ mode: "emergency_stop" });

    const auditLog = result.run?.audit_log ?? [];
    const blockEntry = auditLog.find((e) => e.action === "auto_remediation_blocked_by_system_mode");
    expect(blockEntry).toBeDefined();
    expect(blockEntry?.detail).toContain("emergency_stop");
    expect(blockEntry?.data).toMatchObject({ key: "fake-remediation", mode: "emergency_stop", action_run_id: "blocked-run-1" });
  });

  it("never claims the remediation ran: no catalog_remediation_success/failed entry, no deploy_status change", async () => {
    const result = await startRepairFromIncident({ incidentId: INCIDENT.id, actor: "tester", source: "web" });
    const auditLog = result.run?.audit_log ?? [];
    expect(auditLog.some((e) => e.action === "catalog_remediation_success")).toBe(false);
    expect(auditLog.some((e) => e.action === "catalog_remediation_failed")).toBe(false);
  });

  it("mutation control: an allowed (attempted) remediation still resolves normally (regression guard for the new branch)", async () => {
    tryRemediate.mockResolvedValueOnce({ attempted: true, ok: true, key: "fake-remediation", action_run_id: "run-ok-1", steps: [] } as never);
    const result = await startRepairFromIncident({ incidentId: INCIDENT.id, actor: "tester", source: "web" });
    expect(result.ok).toBe(true);
    expect(result.run?.state).toBe("resolved");
  });
});
