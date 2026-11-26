import { describe, expect, it, vi } from "vitest";

// A door's service-role read (registry-code.test.ts DOOR_OWN_ORG_READS): pinned to the caller's own organization AND user.
const m = vi.hoisted(() => ({ filters: [] as unknown[][], rows: [] as unknown[] }));
vi.mock("@/lib/supabase-server", () => {
  const q: Record<string, unknown> = {};
  for (const f of ["select", "eq"]) q[f] = (...a: unknown[]) => { m.filters.push([f, ...a]); return q; };
  q.limit = async () => ({ data: m.rows, error: null });
  return { getSupabaseWriteClient: () => ({ from: (t: string) => { m.filters.push(["from", t]); return q; } }) };
});

import { callerManagesUnit } from "../account-manager";

describe("callerManagesUnit -- the door frame's manager read", () => {
  it("reads the member link of the caller's own organization for the caller's own user id, nothing wider", async () => {
    m.filters = []; m.rows = [{ user_id: "user-1" }];
    expect(await callerManagesUnit("org-1", " user-1 ")).toBe(true);
    expect(m.filters).toContainEqual(["from", "customer_identities"]);
    expect(m.filters).toContainEqual(["eq", "organization_id", "org-1"]);
    expect(m.filters).toContainEqual(["eq", "user_id", "user-1"]);
    m.rows = [];
    expect(await callerManagesUnit("org-1", "user-2")).toBe(false);
    m.filters = [];
    expect(await callerManagesUnit("org-1", null)).toBe(false);
    expect(await callerManagesUnit(undefined, "user-1")).toBe(false);
    expect(m.filters).toEqual([]);   // no ids, no read
  });
});
