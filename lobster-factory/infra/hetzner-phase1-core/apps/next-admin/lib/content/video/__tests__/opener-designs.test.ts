// Card R3: the ownership guard -- a design (我的設計) is looked up only inside the organization asked for; another
// organization's design is never found, so neither the site setting nor the editor can take it.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orgDesign } from "../opener-designs";

const ROWS = [
  { id: "11111111-1111-4111-8111-111111111111", organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", object_url: "https://r2.example/a.png", mime_type: "image/png", storage_backend: "r2", asset_domain: "ai_generated", is_current: true, created_at: "2026-11-20", metadata: { source: "banner", prompt: "我們的片頭" } },
  { id: "22222222-2222-4222-8222-222222222222", organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", object_url: "https://r2.example/b.png", mime_type: "image/png", storage_backend: "r2", asset_domain: "ai_generated", is_current: true, created_at: "2026-11-20", metadata: { source: "banner" } },
];
// media_assets with the eq filters the query names (the other predicates match every row here)
const db = () => ({
  from: () => {
    const filters: Array<[string, unknown]> = [];
    const q = {
      select: () => q, is: () => q, like: () => q,
      eq: (col: string, v: unknown) => (filters.push([col, v]), q),
      maybeSingle: async () => ({ data: ROWS.find((r) => filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v)) ?? null, error: null }),
    };
    return q;
  },
}) as unknown as SupabaseClient;

describe("orgDesign", () => {
  it("finds a design of the organization asked for, never another organization's", async () => {
    expect(await orgDesign(db(), ROWS[0].organization_id, ROWS[0].id)).toMatchObject({ id: ROWS[0].id, url: ROWS[0].object_url, name: "我們的片頭" });
    expect(await orgDesign(db(), ROWS[0].organization_id, ROWS[1].id)).toBeNull();
  });
});
