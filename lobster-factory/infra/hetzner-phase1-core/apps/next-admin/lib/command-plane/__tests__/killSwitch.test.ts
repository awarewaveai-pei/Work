// Kill switch: evaluateKillSwitch (sync decision table) + getActiveMode (DB read).
// FAIL_OPEN_FOR is empty -- no risk level is ever exempt from emergency_stop/maintenance,
// so the "command blocked" cases below are the security-relevant ones to pin.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { evaluateKillSwitch, getActiveMode } from "../killSwitch";
import type { RiskLevel, SystemMode } from "../types";

function fakeSb(rows: Array<{ scope_type: string; scope_id: string | null; mode: SystemMode }> | null, error: unknown = null) {
  const or = vi.fn(async () => ({ data: rows, error }));
  const select = vi.fn(() => ({ or }));
  const from = vi.fn(() => ({ select }));
  return { sb: { from } as unknown as SupabaseClient, from, select, or };
}

describe("evaluateKillSwitch", () => {
  it("emergency_stop blocks every risk level, including low", () => {
    for (const risk of ["low", "medium", "high", "critical"] as RiskLevel[]) {
      expect(evaluateKillSwitch("emergency_stop", risk)).toEqual({
        mode: "emergency_stop",
        blocks: true,
        reason: "system in emergency_stop",
      });
    }
  });

  it("maintenance blocks every risk level (FAIL_OPEN_FOR is empty -- no risk is exempt)", () => {
    for (const risk of ["low", "medium", "high", "critical"] as RiskLevel[]) {
      expect(evaluateKillSwitch("maintenance", risk).blocks).toBe(true);
    }
  });

  it("read_only blocks anything above low, allows low", () => {
    expect(evaluateKillSwitch("read_only", "low")).toEqual({ mode: "read_only", blocks: false });
    expect(evaluateKillSwitch("read_only", "medium").blocks).toBe(true);
    expect(evaluateKillSwitch("read_only", "high").blocks).toBe(true);
    expect(evaluateKillSwitch("read_only", "critical").blocks).toBe(true);
  });

  it("normal mode never blocks", () => {
    for (const risk of ["low", "medium", "high", "critical"] as RiskLevel[]) {
      expect(evaluateKillSwitch("normal", risk)).toEqual({ mode: "normal", blocks: false });
    }
  });
});

describe("getActiveMode", () => {
  it("defaults to normal when the DB errors (low-risk reads fail open at the mode-lookup layer)", async () => {
    const { sb } = fakeSb(null, { message: "boom" });
    expect(await getActiveMode(sb, "org-1")).toBe("normal");
  });

  it("defaults to normal when no row matches org or global scope", async () => {
    const { sb } = fakeSb([]);
    expect(await getActiveMode(sb, "org-1")).toBe("normal");
  });

  it("prefers a client-scoped row over a global row when both exist", async () => {
    const { sb } = fakeSb([
      { scope_type: "global", scope_id: null, mode: "maintenance" },
      { scope_type: "client", scope_id: "org-1", mode: "emergency_stop" },
    ]);
    expect(await getActiveMode(sb, "org-1")).toBe("emergency_stop");
  });

  it("falls back to the global row when only a global row is returned", async () => {
    const { sb } = fakeSb([{ scope_type: "global", scope_id: null, mode: "read_only" }]);
    expect(await getActiveMode(sb, "org-1")).toBe("read_only");
  });
});
