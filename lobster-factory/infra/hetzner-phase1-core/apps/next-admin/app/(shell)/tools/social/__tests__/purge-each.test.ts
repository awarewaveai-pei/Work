// Card E (2026-11-14): 永久刪除所選 with one post that is not in the bin -- that one is refused, the others still go, and
// the status line says which were refused. The server's refusal itself (assertCanPurge, the DELETE's guard) is
// lib/social/__tests__/purge.e2e.test.ts against a real database.
import { describe, expect, it, vi } from "vitest";
import { purgeEach } from "../Trash";
import type { Post } from "../model";

const post = (id: string, body: string, state = "deleted") => ({ id, body, state, version: 3, targets: [] }) as unknown as Post;

describe("purgeEach", () => {
  it("one post not in the bin: refused and named; the others are erased", async () => {
    const posts = [post("a", "第一則"), post("b", "混進來的草稿", "draft"), post("c", "第三則")];
    const purgeOne = vi.fn(async (p: Post) => { if (p.state !== "deleted") throw new Error("a draft post is not in the bin"); });
    const line = await purgeEach(posts, purgeOne);
    expect(purgeOne.mock.calls.map((c) => c[0].id)).toEqual(["a", "b", "c"]);   // the refusal does not stop the rest
    expect(line).toEqual({ text: "已永久刪除 2 則；1 則沒刪掉：「混進來的草稿」a draft post is not in the bin", error: true });
  });
  it("all erased", async () => {
    expect(await purgeEach([post("a", "x"), post("c", "y")], async () => ({}))).toEqual({ text: "已永久刪除 2 則。", error: false });
  });
});
