// existing-leads (card C10): the same business is found however many rows its query matches (pages past PostgREST's
// max-rows) and whatever characters its source_url holds (a comma cannot ride in .in()).
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findExisting, findExistingLead } from "../existing-leads";

type Row = { id: string; email: string | null; website: string | null; source_url: string | null; name?: string | null; phone?: string | null };

/** A table that honours source_url filters, order + limit + gt (keyset) and caps every answer at 1000 rows. */
function fakeDb(rows: Row[]) {
  const from = () => {
    let src: string[] | null = null;
    let limit = Infinity;
    let after: string | null = null;
    const q: Record<string, unknown> = {};
    for (const k of ["select", "is", "or", "ilike", "order"]) q[k] = () => q;
    q.eq = (col: string, v: string) => { if (col === "source_url") src = [v]; return q; };
    q.in = (col: string, v: string[]) => { if (col === "source_url") src = v; return q; };
    q.limit = (n: number) => { limit = n; return q; };
    q.gt = (_c: string, v: string) => { after = v; return q; };
    q.then = (ok: (v: unknown) => unknown) => {
      const hit = rows.filter((r) => (!src || src.includes(r.source_url ?? "")) && (!after || r.id > after)).sort((a, b) => a.id.localeCompare(b.id));
      return ok({ data: hit.slice(0, Math.min(limit, 1000)), error: null });
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const noise = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `a${String(i).padStart(5, "0")}`, email: null,
  website: `https://shop${i}.cafe.tw/`, source_url: null }));

describe("findExisting / findExistingLead", () => {
  it("a match past the first 1000 rows of a host query is still found", async () => {
    const db = fakeDb([...noise(1500), { id: "z00001", email: null, website: "https://cafe.tw/", source_url: null }]);
    expect(await findExisting(db, "org", [{ website: "http://www.cafe.tw/menu" }])).toEqual([true]);
  });

  it("a source_url with a comma is queried on its own and matched", async () => {
    const src = "https://example.com/place?coords=25,121";
    const db = fakeDb([{ id: "l1", email: null, website: null, source_url: src, name: "店", phone: null }]);
    expect(await findExisting(db, "org", [{ source_url: src }])).toEqual([true]);
    expect((await findExistingLead(db, "org", { source_url: src, name: "店" }))?.id).toBe("l1");
  });
});
