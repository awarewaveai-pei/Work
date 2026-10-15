// Postiz v2.25.1 public-API client (SOCIAL_MANAGER_PLAN.md C3). Responses are the real ones captured from
// postiz.aware-wave.com after the G5 upgrade (fixtures/postiz-v2.25.1/, 2026-10-15).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));

const { listPosts, deletePost, changeStatus, connectUrl, listGroups, createSocialPost, createPost, sendKeyOf, PostizApiError } = await import("../postiz");

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", "postiz-v2.25.1", name), "utf8");
const fetchMock = vi.fn();

function answer(status: number, body: string, headers: Record<string, string> = {}) {
  fetchMock.mockResolvedValueOnce(new Response(body, { status, headers: { "content-type": "application/json", ...headers } }));
}
const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url: new URL(url), init };
};

beforeEach(() => {
  process.env.POSTIZ_API_BASE_URL = "https://postiz.example/api";
  process.env.POSTIZ_API_KEY = "test-key";
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("Postiz v2.25.1 client", () => {
  // C5: the send key rides in the post's settings (Postiz keeps unknown keys and returns them), so an uncertain send is
  // found again by it; Postiz assigns the post id itself
  it("createPost stores the send key in settings, sendKeyOf reads it back; a 429 carries retryAfter", async () => {
    answer(200, fixture("post-create.json"));
    const id = await createPost({ sendKey: "k-1", integrationId: "int-1", type: "schedule", date: "2026-10-16T01:00:00.000Z",
      values: [{ content: "<p>hi</p>", image: [] }, { content: "<p>first comment</p>", image: [] }], settings: { __type: "bluesky" } });
    expect(id).toBe("cmv8oh9kq0000rk8znfwq2ll1");
    const { url, init } = lastCall();
    expect([init.method, url.pathname]).toEqual(["POST", "/api/public/v1/posts"]);
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ type: "schedule", date: "2026-10-16T01:00:00.000Z", shortLink: false, tags: [] });
    expect(sent.posts[0].settings).toEqual({ __type: "bluesky", awarewave_send_key: "k-1" });
    expect(sent.posts[0].value).toHaveLength(2);
    expect(sendKeyOf({ settings: JSON.stringify(sent.posts[0].settings) })).toBe("k-1");
    expect(sendKeyOf({ settings: "{\"__type\":\"bluesky\"}" })).toBeNull();
    expect(sendKeyOf({ settings: "not json" })).toBeNull();
    expect(sent.posts[0].integration).toEqual({ id: "int-1" });
    answer(429, "slow down", { "retry-after": "120" });
    const err = await createPost({ sendKey: "k-2", integrationId: "int-1", type: "now", date: "2026-10-16T01:00:00.000Z", values: [{ content: "x", image: [] }], settings: { __type: "x" } }).catch((e) => e);
    expect(err).toBeInstanceOf(PostizApiError);
    expect([err.status, err.retryAfterSeconds]).toEqual([429, 120]);
  });

  it("listPosts sends the window and the group, returns the posts as Postiz shapes them", async () => {
    answer(200, fixture("posts-with-draft.json"));
    const posts = await listPosts({ start: new Date("2026-10-13T00:00:00Z"), end: new Date("2026-10-16T00:00:00Z"), customer: "brand-1" });
    const { url, init } = lastCall();
    expect(url.pathname).toBe("/api/public/v1/posts");
    expect(Object.fromEntries(url.searchParams)).toEqual({ startDate: "2026-10-13T00:00:00.000Z", endDate: "2026-10-16T00:00:00.000Z", customer: "brand-1" });
    expect((init.headers as Record<string, string>).Authorization).toBe("test-key");
    expect(posts[0]).toMatchObject({ id: "cmv8oh9kq0000rk8znfwq2ll1", state: "DRAFT", integration: { providerIdentifier: "bluesky" } });
  });

  it("deletePost: 200 = it existed, 404 = already gone (v2.25.1), anything else throws", async () => {
    answer(200, "{}");
    expect(await deletePost("p1")).toEqual({ existed: true });
    expect(lastCall()).toMatchObject({ init: { method: "DELETE" } });
    answer(404, '{"message":"Post not found"}');
    expect(await deletePost("p1")).toEqual({ existed: false });
    answer(500, "boom");
    await expect(deletePost("p1")).rejects.toBeInstanceOf(PostizApiError);
  });

  it("changeStatus PUTs the status body", async () => {
    answer(200, "{}");
    await changeStatus("p1", "schedule");
    const { url, init } = lastCall();
    expect([url.pathname, init.method, init.body]).toEqual(["/api/public/v1/posts/p1/status", "PUT", '{"status":"schedule"}']);
  });

  it("connectUrl asks for the platform's OAuth URL, with refresh for a reconnect", async () => {
    answer(200, '{"url":"https://bsky.example/oauth?state=x"}');
    expect(await connectUrl("bluesky", "cmqe3jw960001p58nt0xohbi8")).toBe("https://bsky.example/oauth?state=x");
    const { url } = lastCall();
    expect([url.pathname, url.searchParams.get("refresh")]).toEqual(["/api/public/v1/social/bluesky", "cmqe3jw960001p58nt0xohbi8"]);
  });

  it("listGroups returns Postiz's customer groups", async () => {
    answer(200, fixture("groups.json"));
    expect(await listGroups()).toEqual([]);
    answer(200, '[{"id":"g1","name":"Soulful"}]');
    expect(await listGroups()).toEqual([{ id: "g1", name: "Soulful" }]);
  });

  it("429 carries retryAfter for the caller; the client does not retry", async () => {
    answer(429, '{"message":"ThrottlerException: Too Many Requests"}', { "retry-after": "1800" });
    const err = await listPosts({ start: new Date(), end: new Date() }).catch((e) => e);
    expect(err).toBeInstanceOf(PostizApiError);
    expect([err.status, err.retryAfterSeconds]).toEqual([429, 1800]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    answer(429, "{}");
    const bare = await listGroups().catch((e) => e);
    expect(bare.retryAfterSeconds).toBeUndefined(); // no header is not "retry now"
  });

  it("createSocialPost: text-only sends an empty image array and reads v2.25.1's [{postId}] answer", async () => {
    answer(201, fixture("post-create.json"));
    const [r] = await createSocialPost({ clientId: "c1", mode: "draft", posts: [{ integrationId: "cmqe3jw960001p58nt0xohbi8", platform: "bluesky", content: "hi" }] });
    expect(r).toMatchObject({ status: "ok", postizPostId: "cmv8oh9kq0000rk8znfwq2ll1" });
    expect(JSON.parse(lastCall().init.body as string).posts[0].value[0].image).toEqual([]);
  });
});
