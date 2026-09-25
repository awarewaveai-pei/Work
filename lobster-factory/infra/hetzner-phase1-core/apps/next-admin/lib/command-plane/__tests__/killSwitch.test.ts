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
  // KNOWN BUG on main (TASKS.md: kill switch fails open): killSwitch.ts:16-18 promises that
  // medium/high/critical commands fail closed when system_modes is unreadable, but getActiveMode
  // returns "normal" on a DB error. `it.fails` pins the documented contract: when the source is
  // fixed this starts passing, vitest reports it, and it must become a plain `it`.
  it.fails("a DB error blocks medium/high/critical commands (documented fail-closed contract)", async () => {
    const { sb } = fakeSb(null, { message: "boom" });
    const mode = await getActiveMode(sb, "org-1");
    for (const risk of ["medium", "high", "critical"] as RiskLevel[]) {
      expect(evaluateKillSwitch(mode, risk).blocks).toBe(true);
    }
  });

  it("defaults to normal when no row matches org or global scope", async () => {
    const { sb } = fakeSb([]);
    expect(await getActiveMode(sb, "org-1")).toBe("normal");
  });

  // KNOWN BUG on main: killSwitch.ts:16 promises the MOST-RESTRICTIVE mode across org and global;
  // the code prefers the client row, so a client "normal" row cancels a global emergency_stop.
  it.fails("a global emergency_stop is not overridden by a client-scoped normal row (most-restrictive contract)", async () => {
    const { sb } = fakeSb([
      { scope_type: "global", scope_id: null, mode: "emergency_stop" },
      { scope_type: "client", scope_id: "org-1", mode: "normal" },
    ]);
    expect(await getActiveMode(sb, "org-1")).toBe("emergency_stop");
  });

  it("returns emergency_stop when the client row is emergency_stop and the global row is maintenance", async () => {
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
