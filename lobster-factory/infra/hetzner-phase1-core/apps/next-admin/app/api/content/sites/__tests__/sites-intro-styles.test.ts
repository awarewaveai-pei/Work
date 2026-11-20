// Card R2: the automatic videos' intro styles are set by their own field: automatic styles only, each once; [] clears; a
// whole-defaults save keeps the stored list; an old site (no field) stays without an intro.
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const ORG = vi.hoisted(() => "11111111-1111-4111-8111-111111111111");
const db = vi.hoisted(() => ({ updated: [] as Record<string, unknown>[], stored: {} as Record<string, unknown>, filters: [] as Array<[string, string, unknown]> }));
vi.mock("@/lib/supabase-server", () => {
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => { db.filters.push(["eq", col, v]); return q; },
    is: (col: string, v: unknown) => { db.filters.push(["is", col, v]); return q; },
    maybeSingle: async () => ({ data: { organization_id: ORG, url: "https://shop.example.com", content_defaults: db.stored }, error: null }),
    single: async () => ({ data: { id: "s1", name: "n", url: "https://shop.example.com", color: "#5855d0", active: true, note: null, created_at: "t",
      token: "x", username: "u", content_defaults: db.updated.at(-1)?.content_defaults ?? db.stored }, error: null }),
    update: (row: Record<string, unknown>) => { db.updated.push(row); return q; },
  };
  return { getSupabaseWriteClient: () => ({ from: () => q }) };
});
import { PATCH } from "../[id]/route";

const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" };
const patch = (body: Record<string, unknown>) => PATCH(new Request("https://app.aware-wave.com/api/content/sites/s1", {
  method: "PATCH", headers: { "content-type": "application/json", ...staff }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: "s1" }) });
const written = () => (db.updated.at(-1)?.content_defaults as { introStyles?: string[] } | undefined)?.introStyles;

beforeEach(() => { db.updated = []; db.stored = {}; db.filters = []; });

describe("site introStyles", () => {
  it("saves automatic styles in the given order; [] clears", async () => {
    expect((await patch({ introStyles: ["title-card", "cover-opener"] })).status).toBe(200);
    expect(written()).toEqual(["title-card", "cover-opener"]);
    db.stored = { introStyles: ["cover-opener"], tone: "Warm" };
    expect((await patch({ introStyles: [] })).status).toBe(200);
    expect(written()).toBeUndefined();
    expect(db.updated.at(-1)?.content_defaults).toEqual({ tone: "Warm" });
  });

  it("the write is conditional on the list it read (a racing save gets 409, not the old list written back)", async () => {
    db.stored = { introStyles: ["cover-opener", "title-card"] };
    await patch({ contentDefaults: { tone: "Calm" } });
    expect(db.filters).toContainEqual(["eq", "content_defaults->>introStyles", '["cover-opener", "title-card"]']);
    db.filters = []; db.stored = {};
    await patch({ introStyles: ["cover-opener"] });
    expect(db.filters).toContainEqual(["is", "content_defaults->>introStyles", null]);
  });

  it("introTransition: a name video-service can join, stored as given; others refused; kept by a whole-defaults save", async () => {
    expect((await patch({ introTransition: "黑場" })).status).toBe(200);
    expect((db.updated.at(-1)?.content_defaults as { introTransition?: string }).introTransition).toBe("黑場");
    for (const bad of ["向左擦除", "fade-black", "nope", 3]) expect((await patch({ introTransition: bad })).status).toBe(400);
    db.stored = { introTransition: "無" };
    await patch({ contentDefaults: { tone: "Calm" } });
    expect(db.updated.at(-1)?.content_defaults).toEqual({ tone: "Calm", introTransition: "無" });
    expect(db.filters).toContainEqual(["eq", "content_defaults->>introTransition", "無"]);
  });

  it("refuses manual-only, unknown, repeated or non-list values and writes nothing", async () => {
    for (const bad of [["product-review-typewriter"], ["nope"], ["cover-opener", "cover-opener"], "cover-opener", ["none"]]) {
      expect((await patch({ introStyles: bad })).status).toBe(400);
    }
    expect(db.updated).toEqual([]);
  });

  it("a whole-defaults save keeps the stored styles; an old site saved without the field stays without an intro", async () => {
    db.stored = { introStyles: ["scale-bg-text-slideup"] };
    expect((await patch({ contentDefaults: { tone: "Calm" } })).status).toBe(200);
    expect(db.updated.at(-1)?.content_defaults).toEqual({ tone: "Calm", introStyles: ["scale-bg-text-slideup"] });
    db.stored = { tone: "Old" };
    expect((await patch({ contentDefaults: { tone: "Old", introStyles: ["cover-opener"] } })).status).toBe(200);
    expect(written()).toBeUndefined();
  });
});
