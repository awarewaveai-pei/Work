// checkRepairAllowed is the only gatekeeper for repair paths that mutate
// production. Runs through the REAL getActiveMode/evaluateKillSwitch (only
// Sentry is mocked, same as killSwitch.test.ts) so this file proves the
// gate's own contract, not a mocked stand-in of it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { checkRepairAllowed } from "../system-mode-gate";
import type { SystemMode } from "@/lib/command-plane/types";

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

function fakeSb(rows: Array<{ scope_type: string; scope_id: string | null; mode: SystemMode }> | null, error: unknown = null) {
  const or = vi.fn(async () => ({ data: rows, error }));
  const is = vi.fn(async () => ({ data: rows, error }));
  const eq = vi.fn(() => ({ is }));
  const select = vi.fn(() => ({ or, eq }));
  const from = vi.fn(() => ({ select }));
  return { sb: { from } as unknown as SupabaseClient, or, eq, is };
}

describe("checkRepairAllowed", () => {
  it("normal mode allows", async () => {
    const { sb } = fakeSb([{ scope_type: "global", scope_id: null, mode: "normal" }]);
    expect(await checkRepairAllowed(sb, "org-1")).toEqual({ allowed: true, mode: "normal" });
  });

  it.each(["read_only", "maintenance", "emergency_stop"] as SystemMode[])("%s blocks", async (mode) => {
    const { sb } = fakeSb([{ scope_type: "global", scope_id: null, mode }]);
    const result = await checkRepairAllowed(sb, "org-1");
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe(mode);
  });

  it("a DB error blocks and reports mode 'unavailable'", async () => {
    const { sb } = fakeSb(null, { message: "boom" });
    const result = await checkRepairAllowed(sb, "org-1");
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe("unavailable");
  });

  it("a null client blocks without querying anything, mode 'unavailable'", async () => {
    const result = await checkRepairAllowed(null, "org-1");
    expect(result).toEqual({ allowed: false, mode: "unavailable", reason: "supabase_write_not_configured" });
  });

  it("a client-scoped emergency_stop plus a global normal row still blocks (most-restrictive wins)", async () => {
    const { sb } = fakeSb([
      { scope_type: "global", scope_id: null, mode: "normal" },
      { scope_type: "client", scope_id: "org-1", mode: "emergency_stop" },
    ]);
    const result = await checkRepairAllowed(sb, "org-1");
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe("emergency_stop");
  });

  it("organizationId null only looks at the global row (queries global scope only, no .or())", async () => {
    const { sb, or, eq, is } = fakeSb([{ scope_type: "global", scope_id: null, mode: "normal" }]);
    expect(await checkRepairAllowed(sb, null)).toEqual({ allowed: true, mode: "normal" });
    expect(or).not.toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("scope_type", "global");
    expect(is).toHaveBeenCalledWith("scope_id", null);
  });
});
