// K25: a site's article cover settings are saved as sent and read back the same; a bad colour is refused, nothing written.
// An old site's overlay font is read as the cover's font (siteCover), its stored row untouched.
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
import { siteCover } from "@/lib/content/brand-voice";

const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" };
const save = (cover: unknown) => PATCH(new Request("https://app.aware-wave.com/api/content/sites/s1", {
  method: "PATCH", headers: { "content-type": "application/json", ...staff }, body: JSON.stringify({ contentDefaults: { tone: "Warm", cover } }),
}), { params: Promise.resolve({ id: "s1" }) });

beforeEach(() => { db.updated = []; });

describe("site cover settings (K25)", () => {
  it("saved and read back the same", async () => {
    const cover = { bandColor: "#123456", titleColor: "#ffffff", subtitleColor: "#abcdef", font: "serif" };
    const res = await save(cover);
    expect(res.status).toBe(200);
    const site = (await res.json()).site;
    expect(site.contentDefaults.cover).toEqual(cover);
    expect(siteCover(site.contentDefaults)).toEqual(cover);
  });

  it("a bad colour is refused and nothing is written", async () => {
    const res = await save({ bandColor: "red", titleColor: "#ffffff", subtitleColor: "#abcdef", font: "sans" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("bandColor");
    expect(db.updated).toEqual([]);
  });

  it("an old site's overlay font serif becomes the cover's font", () => {
    expect(siteCover({ featuredImageFont: "serif" } as never).font).toBe("serif");
    expect(siteCover({ featuredImageFont: "none" } as never).font).toBe("sans");
  });
});
