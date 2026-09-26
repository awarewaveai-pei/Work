// Kill switch: evaluateKillSwitch (sync decision table) + getActiveMode (DB read).
// FAIL_OPEN_FOR is empty -- no risk level is ever exempt from emergency_stop/maintenance,
// so the "command blocked" cases below are the security-relevant ones to pin.
import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateKillSwitch, FAIL_OPEN_FOR, getActiveMode, resetModeReportThrottle } from "../killSwitch";
import type { RiskLevel, SystemMode } from "../types";
import type { ModeLookup } from "../types";

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

beforeEach(() => {
  vi.mocked(Sentry.captureMessage).mockClear();
  resetModeReportThrottle();
});

function fakeSb(rows: Array<{ scope_type: string; scope_id: string | null; mode: SystemMode }> | null, error: unknown = null) {
  const or = vi.fn(async () => ({ data: rows, error }));
  const is = vi.fn(async () => ({ data: rows, error }));
  const eq = vi.fn(() => ({ is }));
  const select = vi.fn(() => ({ or, eq }));
  const from = vi.fn(() => ({ select }));
  return { sb: { from } as unknown as SupabaseClient, from, select, or, eq, is };
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
  it("returns 'unavailable' (not a real mode) when the query errors", async () => {
    const { sb } = fakeSb(null, { message: "boom" });
    expect(await getActiveMode(sb, "00000000-0000-4000-8000-000000000001")).toBe("unavailable");
  });

  it("a DB error blocks medium/high/critical commands (documented fail-closed contract)", async () => {
    const { sb } = fakeSb(null, { message: "boom" });
    const mode = await getActiveMode(sb, "00000000-0000-4000-8000-000000000001");
    for (const risk of ["medium", "high", "critical"] as RiskLevel[]) {
      expect(evaluateKillSwitch(mode, risk).blocks).toBe(true);
    }
  });

  it("a DB error reports the error message to Sentry before returning unavailable", async () => {
    const { sb } = fakeSb(null, { message: "boom" });
    await getActiveMode(sb, "00000000-0000-4000-8000-000000000001");
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
      expect.objectContaining({ level: "error", tags: { component: "kill-switch" } }),
    );
  });

  it("an unrecognized mode reports the offending value to Sentry before returning unavailable", async () => {
    const { sb } = fakeSb([{ scope_type: "global", scope_id: null, mode: "lockdown" as unknown as SystemMode }]);
    await getActiveMode(sb, "00000000-0000-4000-8000-000000000001");
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("lockdown"),
      expect.objectContaining({ level: "error", tags: { component: "kill-switch" } }),
    );
  });

  it("organizationId null queries only the global scope (no client-scope condition, no .or())", async () => {
    const { sb, or, eq, is } = fakeSb([{ scope_type: "global", scope_id: null, mode: "read_only" }]);
    expect(await getActiveMode(sb, null)).toBe("read_only");
    expect(or).not.toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("scope_type", "global");
    expect(is).toHaveBeenCalledWith("scope_id", null);
  });

  it("defaults to normal when no row matches org or global scope", async () => {
    const { sb } = fakeSb([]);
    expect(await getActiveMode(sb, "00000000-0000-4000-8000-000000000001")).toBe("normal");
  });

  it("a global emergency_stop is not overridden by a client-scoped normal row (most-restrictive contract)", async () => {
    const { sb } = fakeSb([
      { scope_type: "global", scope_id: null, mode: "emergency_stop" },
      { scope_type: "client", scope_id: "00000000-0000-4000-8000-000000000001", mode: "normal" },
    ]);
    expect(await getActiveMode(sb, "00000000-0000-4000-8000-000000000001")).toBe("emergency_stop");
  });

  it("returns emergency_stop when the client row is emergency_stop and the global row is maintenance", async () => {
    const { sb } = fakeSb([
      { scope_type: "global", scope_id: null, mode: "maintenance" },
      { scope_type: "client", scope_id: "00000000-0000-4000-8000-000000000001", mode: "emergency_stop" },
    ]);
    expect(await getActiveMode(sb, "00000000-0000-4000-8000-000000000001")).toBe("emergency_stop");
  });

  it("falls back to the global row when only a global row is returned", async () => {
    const { sb } = fakeSb([{ scope_type: "global", scope_id: null, mode: "read_only" }]);
    expect(await getActiveMode(sb, "00000000-0000-4000-8000-000000000001")).toBe("read_only");
  });
});

describe("getActiveMode -- client x global takes the strictest (emergency_stop > maintenance > read_only > normal)", () => {
  const STRICTNESS_ORDER: SystemMode[] = ["normal", "read_only", "maintenance", "emergency_stop"];

  for (const clientMode of STRICTNESS_ORDER) {
    for (const globalMode of STRICTNESS_ORDER) {
      const expected =
        STRICTNESS_ORDER.indexOf(clientMode) >= STRICTNESS_ORDER.indexOf(globalMode) ? clientMode : globalMode;
      it(`client=${clientMode} x global=${globalMode} -> ${expected}`, async () => {
        const { sb } = fakeSb([
          { scope_type: "global", scope_id: null, mode: globalMode },
          { scope_type: "client", scope_id: "00000000-0000-4000-8000-000000000001", mode: clientMode },
        ]);
        expect(await getActiveMode(sb, "00000000-0000-4000-8000-000000000001")).toBe(expected);
      });
    }
  }
});

describe("evaluateKillSwitch -- unavailable (system_modes unreadable)", () => {
  it("blocks every risk level, including low, since FAIL_OPEN_FOR is empty", () => {
    for (const risk of ["low", "medium", "high", "critical"] as RiskLevel[]) {
      expect(evaluateKillSwitch("unavailable", risk)).toEqual({
        mode: "unavailable",
        blocks: true,
        reason: "system_modes unreadable (fail closed)",
      });
    }
  });

  it("fails open only for a risk level present in FAIL_OPEN_FOR (injected via the exported Set)", () => {
    FAIL_OPEN_FOR.add("low");
    try {
      expect(evaluateKillSwitch("unavailable", "low")).toEqual({ mode: "unavailable", blocks: false });
      expect(evaluateKillSwitch("unavailable", "medium").blocks).toBe(true);
    } finally {
      FAIL_OPEN_FOR.delete("low");
    }
  });
});

describe("modes this code does not know fail closed", () => {
  it("a row whose mode is outside SystemMode makes the lookup unavailable", async () => {
    const { sb } = fakeSb([{ scope_type: "global", scope_id: null, mode: "lockdown" as unknown as SystemMode }]);
    expect(await getActiveMode(sb, "00000000-0000-4000-8000-000000000001")).toBe("unavailable");
  });

  it("a row with a null mode makes the lookup unavailable", async () => {
    const { sb } = fakeSb([{ scope_type: "client", scope_id: "00000000-0000-4000-8000-000000000001", mode: null as unknown as SystemMode }]);
    expect(await getActiveMode(sb, "00000000-0000-4000-8000-000000000001")).toBe("unavailable");
  });

  it("evaluateKillSwitch blocks an unknown mode at every risk level", () => {
    for (const risk of ["low", "medium", "high", "critical"] as RiskLevel[]) {
      expect(evaluateKillSwitch("lockdown" as unknown as ModeLookup, risk).blocks).toBe(true);
    }
  });
});

describe("getActiveMode query shape and Sentry throttle", () => {
  it("an org id reads its client row and the global row with the exact PostgREST filter", async () => {
    const { sb, or } = fakeSb([]);
    await getActiveMode(sb, "00000000-0000-4000-8000-000000000001");
    expect(or).toHaveBeenCalledWith(
      "and(scope_type.eq.client,scope_id.eq.00000000-0000-4000-8000-000000000001),and(scope_type.eq.global,scope_id.is.null)",
    );
  });

  it("the same read failure reaches Sentry once per 5-minute window, then again", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      const { sb } = fakeSb(null, { message: "throttle-me" });
      await getActiveMode(sb, "00000000-0000-4000-8000-000000000001");
      await getActiveMode(sb, "00000000-0000-4000-8000-000000000001");
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      now.mockReturnValue(1_000_000 + 5 * 60_000);
      await getActiveMode(sb, "00000000-0000-4000-8000-000000000001");
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });
});

describe("getActiveMode refuses an organization id that is not a uuid", () => {
  it.each(["org-1", "", "x),and(id.is.null,or(scope_type.eq.nope"])("%j -> unavailable, system_modes never queried", async (org) => {
    const { sb, from } = fakeSb([{ scope_type: "global", scope_id: null, mode: "normal" }]);
    expect(await getActiveMode(sb, org)).toBe("unavailable");
    expect(from).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("not a uuid"),
      expect.objectContaining({ level: "error" }),
    );
  });
});
