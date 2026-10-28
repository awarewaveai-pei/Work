import { describe, expect, it, vi } from "vitest";

// V4.1 / D6: one aspect ratio = one media_assets row, each with its own checksum; the extra ratios point at the primary.
const upserts: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: () => ({
      upsert: (row: Record<string, unknown>) => { upserts.push(row); return Promise.resolve({ error: null }); },
      select: () => {
        const q: Record<string, unknown> = {};
        let key = "";
        q.eq = (col: string, val: string) => { if (col === "object_key") key = val; return q; };
        q.maybeSingle = () => Promise.resolve({ data: { id: `id:${key}`, checksum_sha256: key.includes("9x16") ? "bb" : "aa" }, error: null });
        return q;
      },
    }),
  }),
}));

const { recordVideoAsset } = await import("../video-pipeline");

describe("recordVideoAsset per-ratio rows", () => {
  it("two ratios -> two rows with their own checksum; variant points at the primary", async () => {
    upserts.length = 0;
    const outputs = { "16x9": "https://cdn.example/d/16x9.mp4", "9x16": "https://cdn.example/d/9x16.mp4" };
    const res = await recordVideoAsset({
      organizationId: "11111111-1111-1111-1111-111111111111",
      primaryUrl: outputs["16x9"], outputs, title: "T", sceneCount: 2,
      outputMeta: { "16x9": { width: 1920, height: 1080, checksumSha256: "aa" }, "9x16": { width: 1080, height: 1920, checksumSha256: "bb" } },
    });
    expect(res?.id).toBe("id:d/16x9.mp4");
    expect(res?.rows.map((r) => [r.format, r.checksumSha256])).toEqual([["16x9", "aa"], ["9x16", "bb"]]);
    expect(upserts).toHaveLength(2);
    expect(upserts[0]).toMatchObject({ object_key: "d/16x9.mp4", checksum_sha256: "aa" });
    expect((upserts[0].metadata as Record<string, unknown>).variantOf).toBeUndefined();
    expect(upserts[1]).toMatchObject({ object_key: "d/9x16.mp4", checksum_sha256: "bb", metadata: { variantOf: "id:d/16x9.mp4", format: "9x16" } });
  });
});
