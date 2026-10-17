// listVisibleSourceTitles (lib/kb/db.ts): the titles handed to the customer-service translator must
// come from the same documents retrieval may return -- above all, never a sensitive one.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<[string, unknown[]]> = [];
const result = vi.hoisted(() => ({ value: { data: [{ title: " Back To The Origin " }, { title: "" }], error: null } as { data: unknown; error: unknown } }));
function builder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "select", "in", "eq", "or", "order"]) b[m] = (...args: unknown[]) => { calls.push([m, args]); return b; };
  b.limit = async (...args: unknown[]) => { calls.push(["limit", args]); return result.value; };
  return b;
}
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => builder() }));

const { listVisibleSourceTitles } = await import("@/lib/kb/db");
const ORG = "11111111-1111-4111-8111-111111111111";
const scope = (o: Partial<{ includeSensitive: boolean; spaces: string[] | null }> = {}) => ({ scope: [ORG], spaces: null, viewer: ORG, asOf: null, model: "m", includeSensitive: false, ...o });
const has = (m: string, pred: (args: unknown[]) => boolean) => calls.some(([n, a]) => n === m && pred(a));

beforeEach(() => { calls.length = 0; });

describe("listVisibleSourceTitles -- same visibility as retrieval", () => {
  it("customer-service scope: sensitive documents excluded, active only, default space includes NULL", async () => {
    const out = await listVisibleSourceTitles(scope(), 100);
    expect(out).toEqual(["Back To The Origin"]);
    expect(has("eq", (a) => a[0] === "is_sensitive" && a[1] === false)).toBe(true);
    expect(has("eq", (a) => a[0] === "status" && a[1] === "active")).toBe(true);
    expect(has("in", (a) => a[0] === "organization_id")).toBe(true);
    expect(has("or", (a) => String(a[0]).startsWith("space_id.is.null,"))).toBe(true);
    expect(has("limit", (a) => a[0] === 100)).toBe(true);
  });

  it("returns nothing when the query fails", async () => {
    result.value = { data: null, error: { message: "x" } };
    expect(await listVisibleSourceTitles(scope(), 100)).toEqual([]);
    result.value = { data: [{ title: " Back To The Origin " }, { title: "" }], error: null };
  });
});
