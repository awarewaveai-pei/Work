// @vitest-environment jsdom
//
// Opening post B right after post A, both at the same version, left A's text in the editor under B's id (the editor
// remounts on `${id}:${version}` and the manager kept A until B arrived; GAP_REPORT.md 2026-10-16 B1). A save would
// have written A's text into B. The manager now hands the editor a loaded post only while its id is the one on the
// route (C19: the composer is its own page, compose/<id>; going from A's page to B's keeps the same component).
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-14T04:00:00Z")); });   // Wed 12:00 Taipei
afterAll(() => vi.useRealTimers());

const brand = { id: "b1", slug: "b", name: "品牌", default_timezone: "Asia/Taipei", role: "owner" };
const account = { id: "a1", platform: "bluesky", label: "x.bsky.social", status: "connected", postiz_integration_id: "i1" };
const at = (h: number) => new Date(`2026-10-15T${String(h).padStart(2, "0")}:00:00+08:00`).toISOString();   // the pinned Thursday, Taipei (module load runs before beforeAll)
const post = (id: string, body: string, hour: number) => ({
  id, state: "scheduled", body, scheduled_at: at(hour), list_id: null, list_position: null, first_comment: null, link_url: null, link_utm: false,
  notes: null, source_url: null, published_at: null, deleted_at: null, version: 1,
  targets: [{ id: `${id}-t`, account_id: "a1", custom_body: null, format: "post", state: "pending", postiz_post_id: null, release_url: null, error: null }], media: [],
});
const posts = [post("p-a", "第一則的文字", 10), post("p-b", "第二則的文字", 14)];

vi.mock("../api", async (orig) => {
  const real = await orig<typeof import("../api")>();
  const api = {
    brands: async () => ({ brands: [brand] }),
    posts: async () => ({ posts, wordpress: [], undatedTruncated: false }),
    accounts: async () => ({ accounts: [account], connecting: null, justConnected: null, connectFailed: null }),
    get: async (_b: string, id: string) => ({ post: posts.find((p) => p.id === id) }),
    media: async () => ({ media: [] }),
    lists: async () => ({ lists: [] }),
    texts: async () => ({ texts: [] }),
  };
  return { ...real, api };
});
const { default: SocialManager } = await import("../SocialManager");

afterEach(() => cleanup());

describe("social manager -- switching between two posts", () => {
  it("the editor shows the post that was opened last, even at an equal version", async () => {
    const { rerender } = render(<SocialManager route={{ kind: "compose", postId: "p-a" }} />);
    await waitFor(() => expect((screen.getByLabelText("貼文內容") as HTMLTextAreaElement).value).toBe("第一則的文字"));
    rerender(<SocialManager route={{ kind: "compose", postId: "p-b" }} />);
    await waitFor(() => expect((screen.getByLabelText("貼文內容") as HTMLTextAreaElement).value).toBe("第二則的文字"));
  });
});
