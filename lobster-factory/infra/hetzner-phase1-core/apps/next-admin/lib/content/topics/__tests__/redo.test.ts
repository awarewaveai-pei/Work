// The human gate's send-back (redoTopic): only drafts go to their trash, then the topic returns to approved with nothing made.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Topic } from "../store";
import { SocialStoreError } from "@/lib/social/store";

const m = vi.hoisted(() => ({
  calls: [] as string[], read: {} as Record<string, unknown>, trash: {} as Record<string, unknown>,
  social: null as null | (() => Promise<unknown>), claimed: true as boolean,
}));
vi.mock("@/lib/content/publish/wp-post-core", () => ({
  readWpPost: async () => m.read,
  trashWpPost: async (_i: unknown, _s: string, id: number) => { m.calls.push(`wp-trash:${id}`); return m.trash; },
}));
vi.mock("@/lib/social/store", async (orig) => ({
  SocialStoreError: (await orig<typeof import("@/lib/social/store")>()).SocialStoreError,
  getPost: async () => m.social!(),
}));
vi.mock("@/lib/social/actions", () => ({
  applyAction: async (_b: string, p: { id: string }, action: string) => { m.calls.push(`social-${action}:${p.id}`); return {}; },
}));
vi.mock("../store", async (orig) => ({
  ...(await orig<typeof import("../store")>()),
  claimTopic: async (_sb: unknown, t: Topic) => { m.calls.push("claim"); return m.claimed ? { ...t, version: t.version + 1 } : null; },
  move: async (_sb: unknown, t: Topic, to: string, patch: Record<string, unknown>) => { m.calls.push(`move:${to}`); return { ...t, ...patch, status: to }; },
}));
const { redoTopic } = await import("../redo");

const topic = (over: Partial<Topic> = {}): Topic => ({
  id: "t1", organization_id: "org", site_id: "site", status: "reviewed", version: 3, formats: ["article", "social"],
  artifacts: { article: { wp_post_id: 34 }, social: { post_id: "p1" } }, review: { pass: false }, last_error: null, ...over,
} as unknown as Topic);
const wpPost = (status: string) => ({ ok: true, post: { id: 34, status, date: "", link: "" } });

beforeEach(() => {
  m.calls = []; m.read = wpPost("draft"); m.trash = { ok: true }; m.claimed = true;
  m.social = async () => ({ id: "p1", state: "draft", version: 1 });
});

describe("redoTopic", () => {
  it("trashes the WordPress draft and the social draft, then returns the topic to approved with nothing made", async () => {
    const r = await redoTopic({} as never, topic(), "ops:owner:u");
    expect(m.calls).toEqual(["claim", "wp-trash:34", "social-delete:p1", "move:approved"]);
    expect(r).toMatchObject({ status: "approved", artifacts: {}, review: null, last_error: null });
  });

  it("only a reviewed topic is sent back", async () => {
    await expect(redoTopic({} as never, topic({ status: "scheduled" }), "x")).rejects.toThrow("only a reviewed topic");
    expect(m.calls).toEqual([]);
  });

  it("an article a person published in WordPress refuses the send-back and is never trashed", async () => {
    m.read = wpPost("publish");
    await expect(redoTopic({} as never, topic(), "x")).rejects.toThrow("不能退回重做");
    expect(m.calls).toEqual(["claim"]);
  });

  it("a post WordPress no longer has is fine; a site it cannot reach stops before the topic moves", async () => {
    m.read = { ok: false, status: 404, error: "Invalid post ID.", code: "rest_post_invalid_id" };
    expect(await redoTopic({} as never, topic(), "x")).toMatchObject({ status: "approved" });
    m.calls = []; m.read = { ok: false, status: 404, error: "Site not found or token missing" };
    await expect(redoTopic({} as never, topic(), "x")).rejects.toThrow("讀不到 WordPress 文章");
    expect(m.calls).toEqual(["claim"]);
  });

  it("a social post a person moved on is left; one that is gone is fine; an unreadable one stops it", async () => {
    m.social = async () => ({ id: "p1", state: "scheduled", version: 1 });
    await redoTopic({} as never, topic(), "x");
    expect(m.calls).toEqual(["claim", "wp-trash:34", "move:approved"]);
    m.calls = []; m.social = async () => { throw new SocialStoreError(404, "no such post"); };
    expect(await redoTopic({} as never, topic(), "x")).toMatchObject({ status: "approved" });
    m.calls = []; m.social = async () => { throw new SocialStoreError(500, "db down"); };
    await expect(redoTopic({} as never, topic(), "x")).rejects.toThrow("db down");
    expect(m.calls).not.toContain("move:approved");
  });

  it("a lost claim changes nothing", async () => {
    m.claimed = false;
    expect(await redoTopic({} as never, topic(), "x")).toBeNull();
    expect(m.calls).toEqual(["claim"]);
  });
});
