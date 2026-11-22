// K8 (ADR 020): the auto-content numbers are read for one picked client; none picked = no query at all.
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOverview } from "../overview-load";

describe("loadOverview", () => {
  it("no client picked: returns an empty overview for no client and reads nothing", async () => {
    const from = vi.fn();
    const mayRead = vi.fn(() => true);
    const o = await loadOverview({ from } as unknown as SupabaseClient, null, mayRead);
    expect(o).toMatchObject({ organizationId: null, rows: [], cells: {}, actual: {} });
    expect(from).not.toHaveBeenCalled();
    expect(mayRead).not.toHaveBeenCalled();
  });

  it("a picked client: the sites query is narrowed to it (and the answer names it, lower case)", async () => {
    const eqs: Array<[string, unknown]> = [];
    const q = { select: () => q, eq: (c: string, v: unknown) => { eqs.push([c, v]); return q; }, then: (r: (v: unknown) => void) => r({ data: [], error: null }) };
    const o = await loadOverview({ from: () => q } as unknown as SupabaseClient, "ABCDEF00-0000-4000-8000-000000000001", () => true);
    expect(eqs).toContainEqual(["organization_id", "abcdef00-0000-4000-8000-000000000001"]);
    expect(o.organizationId).toBe("abcdef00-0000-4000-8000-000000000001");
  });
});
