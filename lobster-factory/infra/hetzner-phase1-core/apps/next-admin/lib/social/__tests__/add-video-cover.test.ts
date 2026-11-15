// Card VD.5: a video added for a social draft carries its cover (0163 cover_media_id + cover_kind) when it can; a cover
// that fails, or that would no longer fit the request's time (Codex 819670ab), never stops the video from being saved.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ inserts: [] as Row[], coverFails: false, mediaCalls: 0 }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: () => {
      let row: Row = {};
      const q = {
        insert: (r: Row) => { row = { id: `m${h.inserts.length + 1}`, ...r }; h.inserts.push(row); return q; },
        select: () => q,
        single: async () => ({ data: row, error: null }),
      };
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));
vi.mock("@/lib/content/postiz", () => ({
  uploadVideo: async () => ({ id: "pz-video", path: "https://pz/v.mp4" }),
  uploadMedia: async () => { h.mediaCalls++; if (h.coverFails) throw new Error("Postiz upload failed: 500"); return { id: "pz-cover", path: "https://pz/c.jpg" }; },
  connectUrl: () => "", listAllIntegrations: async () => [],
}));
const { addVideo } = await import("../store");

beforeEach(() => Object.assign(h, { inserts: [], coverFails: false, mediaCalls: 0 }));

describe("addVideo with a cover", () => {
  it("the cover becomes its own image row and the video points at it as an image", async () => {
    await addVideo("org", "https://r2/v.mp4", "16x9.mp4", "ops", "https://r2/c.jpg");
    const [cover, video] = h.inserts.filter((r) => r.kind);
    expect(cover).toMatchObject({ kind: "image", postiz_media_id: "pz-cover" });
    expect(video).toMatchObject({ kind: "video", cover_media_id: cover.id, cover_kind: "image" });
  });
  it("a refused cover upload still saves the video, without a cover", async () => {
    h.coverFails = true;
    await addVideo("org", "https://r2/v.mp4", "16x9.mp4", "ops", "https://r2/c.jpg");
    const video = h.inserts.find((r) => r.kind === "video")!;
    expect(video).not.toHaveProperty("cover_media_id");
    expect(video).not.toHaveProperty("cover_kind");
  });
  it("no time left before the request's deadline: the cover is skipped, not attempted", async () => {
    const now = () => 1_000_000;
    await addVideo("org", "https://r2/v.mp4", "16x9.mp4", "ops", "https://r2/c.jpg", 1_000_000 + 79_000, now);
    expect(h.mediaCalls).toBe(0);
    expect(h.inserts.find((r) => r.kind === "video")).not.toHaveProperty("cover_media_id");
  });
  it("no cover asked: as before", async () => {
    await addVideo("org", "https://r2/v.mp4", "16x9.mp4", "ops");
    expect(h.mediaCalls).toBe(0);
    expect(h.inserts.filter((r) => r.kind)).toHaveLength(1);
  });
});
