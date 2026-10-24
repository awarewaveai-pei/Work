import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ filters: [] as unknown[][], rows: [] as unknown[] }));
vi.mock("@/lib/supabase-server", () => {
  const q: Record<string, unknown> = {};
  for (const f of ["select", "eq", "lte", "or"]) q[f] = (...a: unknown[]) => { m.filters.push([f, ...a]); return q; };
  q.limit = async () => ({ data: m.rows, error: null });
  return { getSupabaseWriteClient: () => ({ from: (t: string) => { m.filters.push(["from", t]); return q; } }) };
});

import { holdsProduct } from "../door-holds";

describe("holdsProduct -- the door's one service-role read", () => {
  it("reads only the caller's own organization's active rows of that product", async () => {
    m.filters = []; m.rows = [{ id: "e1" }];
    expect(await holdsProduct({ organizationId: "org-1", productKey: "video", now: 100 })).toBe(true);
    expect(m.filters).toContainEqual(["from", "organization_entitlements"]);
    expect(m.filters).toContainEqual(["eq", "organization_id", "org-1"]);
    expect(m.filters).toContainEqual(["eq", "product_key", "video"]);
    expect(m.filters).toContainEqual(["eq", "status", "active"]);
  });

  it("no row means the product is not held", async () => {
    m.filters = []; m.rows = [];
    expect(await holdsProduct({ organizationId: "org-1", productKey: "design", now: 100 })).toBe(false);
  });
});
