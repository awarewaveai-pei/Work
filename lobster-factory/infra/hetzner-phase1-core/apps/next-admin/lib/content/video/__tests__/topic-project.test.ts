// V7.1: a topic that starts a video gets one project (source content_topic, sourceRef = topic id, autonomy full_auto); a retry finds it again.
import { describe, expect, it, vi } from "vitest";
import { ensureTopicProject } from "../topic-project";

const topic = { id: "t1", organization_id: "o1", title: "春季保養" };

function fakeDb(existing: Array<{ id: string }>) {
  const insert = vi.fn();
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "limit"]) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: existing, error: null });
  q.insert = (row: unknown) => { insert(row); return { select: () => ({ single: async () => ({ data: { id: "new-project" }, error: null }) }) }; };
  return { sb: { from: () => q } as never, insert };
}

describe("ensureTopicProject", () => {
  it("makes one full_auto project for the topic, recorded as content_topic with the topic id", async () => {
    const { sb, insert } = fakeDb([]);
    expect(await ensureTopicProject(sb, topic, ["16x9", "9x16"])).toBe("new-project");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ organization_id: "o1", source: "content_topic", source_ref: "t1", autonomy: "full_auto", formats: ["16x9", "9x16"], title: "春季保養" }));
  });

  it("a retry finds the existing project instead of making a second one", async () => {
    const { sb, insert } = fakeDb([{ id: "p-existing" }]);
    expect(await ensureTopicProject(sb, topic, ["16x9"])).toBe("p-existing");
    expect(insert).not.toHaveBeenCalled();
  });
});
