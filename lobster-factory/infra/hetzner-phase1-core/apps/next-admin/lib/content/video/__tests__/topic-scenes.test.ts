import { expect, it, vi } from "vitest";
const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));
import { saveTopicVideoScenes } from "../topic-project";
it("keeps topic fields and the exact scenes, scopes reads/writes and retries a concurrent change", async () => {
  const eq = vi.fn(), update = vi.fn(); let saves = 0;
  const sb = { from: () => {
    let saving = false;
    const q = { select: () => q, eq: (...args: unknown[]) => { eq(...args); return q; },
      maybeSingle: async () => ({ data: { brief_json: { topicId: "topic", other: "keep" }, updated_at: "now" }, error: null }),
      update: (v: unknown) => { saving = true; update(v); return q; },
      then: (resolve: (v: unknown) => void) => resolve({ data: saving && ++saves > 1 ? [{ id: "project" }] : [], error: null }),
    }; return q;
  } };
  getSupabaseWriteClient.mockReturnValue(sb);
  const scenes = [{ narration: "一句", image_prompt: "海邊" }, { narration: "二句", image_prompt: "山" }];
  await saveTopicVideoScenes("org", "project", scenes);
  expect(update).toHaveBeenCalledTimes(2); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ brief_json: { topicId: "topic", other: "keep", videoScenes: scenes } }));
  expect(eq).toHaveBeenCalledWith("organization_id", "org"); expect(eq).toHaveBeenCalledWith("source", "content_topic"); expect(eq).toHaveBeenCalledWith("updated_at", "now");
});
