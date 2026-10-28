// A site's own industry feeds (AUTO_CONTENT P9.4) are checked when saved: public https only, trimmed, de-duplicated, at most 10.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = vi.hoisted(() => "11111111-1111-4111-8111-111111111111");
const db = vi.hoisted(() => ({ updated: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase-server", () => {
  const q = {
    select: () => q,
    eq: () => q,
    is: () => q,
    maybeSingle: async () => ({ data: { organization_id: ORG, url: "https://shop.example.com", content_defaults: {} }, error: null }),
    single: async () => ({ data: { id: "s1", name: "n", url: "https://shop.example.com", color: "#5855d0", active: true, note: null, created_at: "t",
      token: "x", username: "u", content_defaults: db.updated.at(-1)?.content_defaults ?? {} }, error: null }),
    update: (row: Record<string, unknown>) => { db.updated.push(row); return q; },
  };
  return { getSupabaseWriteClient: () => ({ from: () => q }) };
});
import { PATCH } from "../[id]/route";

const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" };
const save = (trendFeeds: unknown) => PATCH(new Request("https://app.aware-wave.com/api/content/sites/s1", {
  method: "PATCH", headers: { "content-type": "application/json", ...staff }, body: JSON.stringify({ contentDefaults: { tone: "Warm", trendFeeds } }),
}), { params: Promise.resolve({ id: "s1" }) });
const written = () => (db.updated.at(-1)?.content_defaults as { trendFeeds?: string[] } | undefined)?.trendFeeds;

beforeEach(() => { db.updated = []; });

describe("site trendFeeds", () => {
  it("refuses a non-https or private address and writes nothing", async () => {
    const res = await save(["http://x"]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("http://x");
    expect(db.updated).toEqual([]);
    expect((await save(["https://127.0.0.1/feed"])).status).toBe(400);
  });

  it("refuses more than 10", async () => {
    expect((await save(Array.from({ length: 11 }, (_, i) => `https://a${i}.example/feed`))).status).toBe(400);
    expect((await save(Array.from({ length: 10 }, (_, i) => `https://a${i}.example/feed`))).status).toBe(200);
  });

  it("trims and de-duplicates; blanks are dropped; a non-array is removed", async () => {
    expect((await save([" https://a.example/feed ", "https://a.example/feed", "  "])).status).toBe(200);
    expect(written()).toEqual(["https://a.example/feed"]);
    expect((await save("https://a.example/feed")).status).toBe(200);
    expect(written()).toBeUndefined();
  });
});
