// /api/social routes (SOCIAL_MANAGER_PLAN.md C4): one test per route -- who is refused, and what reaches the store.
// The store is mocked; the rules (state.ts, limits.ts, authz.ts) are real.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  listBrands: vi.fn(), listAccounts: vi.fn(), resolveConnectAttempt: vi.fn(), startConnect: vi.fn(), unlinkAccount: vi.fn(), cancelConnect: vi.fn(),
  listPosts: vi.fn(), getPost: vi.fn(), getPostAt: vi.fn(), savePost: vi.fn(), setState: vi.fn(), accountPlatforms: vi.fn(),
  listLists: vi.fn(), saveList: vi.fn(), deleteList: vi.fn(), listMedia: vi.fn(), addImage: vi.fn(), listLog: vi.fn(), releasePost: vi.fn(),
  listTrash: vi.fn(), listTexts: vi.fn(), addText: vi.fn(), deleteText: vi.fn(),
}));
const postiz = vi.hoisted(() => ({ listPosts: vi.fn(), deletePost: vi.fn() }));
const rotation = vi.hoisted(() => ({ materializeList: vi.fn(), listQueue: vi.fn(), reorderList: vi.fn(), deleteList: vi.fn(), nextPosition: vi.fn() }));
vi.mock("@/lib/social/rotation", () => rotation);
// C8: the brand's review setting (off unless a test turns it on); notifications are not this file's subject
const review = vi.hoisted(() => ({ requiresReview: vi.fn(async () => false), notifyReview: vi.fn(async () => undefined) }));
vi.mock("@/lib/social/review", async (orig) => ({ ...(await orig<typeof import("@/lib/social/review")>()), ...review }));
vi.mock("@/lib/content/postiz", async (orig) => ({ ...(await orig<typeof import("@/lib/content/postiz")>()), ...postiz }));
vi.mock("@/lib/social/store", async (orig) => ({ ...(await orig<typeof import("@/lib/social/store")>()), ...store }));
const wp = vi.hoisted(() => ({ listAccessibleWpSites: vi.fn(async () => ({ sites: [] as unknown[], tokens: {} as Record<string, string>, usernames: {} as Record<string, string> })) }));
vi.mock("@/lib/content/wp-sites", async (orig) => ({ ...(await orig<typeof import("@/lib/content/wp-sites")>()), ...wp }));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";
const ACC = "44444444-4444-4444-8444-444444444444";

/** staff with an ops role, a client account bound to `org`, or (anonymous) no session identity at all */
function req(method: string, path: string, who: { role?: string; client?: string; anonymous?: true } = { role: "owner" }, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (who.anonymous) Object.assign(headers, { "x-ops-claims-role": "owner" });
  else if (who.client) Object.assign(headers, { "x-ops-user-kind": "client", "x-ops-org-id": who.client, "x-ops-claims-role": "viewer" });
  else Object.assign(headers, { "x-ops-user-kind": "staff", "x-ops-claims-role": who.role ?? "owner" });
  return new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const draft = (extra = {}) => ({ id: P, state: "draft", body: "hi", scheduled_at: null, list_id: null, list_position: null, published_at: null,
  targets: [{ id: "t1", account_id: ACC, custom_body: null, format: "post", state: "pending", postiz_post_id: null, release_url: null, error: null }],
  media: [], version: 3, ...extra });

beforeEach(async () => {
  Object.values(store).forEach((f) => f.mockReset());
  const { SocialStoreError } = await import("@/lib/social/store");
  store.getPostAt.mockImplementation(async (b: string, id: string, v: number) => {
    const p = await store.getPost(b, id);
    if (p.version !== v) throw new SocialStoreError(409, "changed");
    return p;
  });
  store.resolveConnectAttempt.mockResolvedValue({ open: null });
  store.savePost.mockResolvedValue({ id: P, version: 4 });
  store.setState.mockResolvedValue({ id: P, version: 4 });
  store.accountPlatforms.mockResolvedValue(new Map([[ACC, "bluesky"]]));
});

describe("/api/social routes", () => {
  it("brands: a client sees only its own brand, with role client", async () => {
    const { GET } = await import("../brands/route");
    store.listBrands.mockResolvedValue([{ id: A, slug: "a", name: "A", default_timezone: "UTC" }]);
    const res = await (await GET(req("GET", "/api/social/brands", { client: A }))).json();
    expect(store.listBrands).toHaveBeenCalledWith(A);
    expect(res.brands).toEqual([expect.objectContaining({ id: A, role: "client" })]);
  });

  it("accounts: another brand's client is refused; a viewer may not start a connection; an editor may", async () => {
    const { GET, POST } = await import("../accounts/route");
    expect((await GET(req("GET", `/api/social/accounts?brand=${A}`, { client: B }))).status).toBe(403);
    expect((await POST(req("POST", "/api/social/accounts", { role: "viewer" }, { brand: A, platform: "bluesky" }))).status).toBe(403);
    store.startConnect.mockResolvedValue({ attemptId: "x", url: "https://oauth" });
    const ok = await POST(req("POST", "/api/social/accounts", { role: "operator" }, { brand: A, platform: "bluesky" }));
    expect([ok.status, (await ok.json()).url]).toEqual([200, "https://oauth"]);
    expect(store.startConnect).toHaveBeenCalledWith(A, "bluesky", null, "ops:operator");
  });

  it("posts GET: the window is bounded; POST: text over the platform's limit is a 400 naming it", async () => {
    const { GET, POST } = await import("../posts/route");
    expect((await GET(req("GET", `/api/social/posts?brand=${A}&start=2026-01-01T00:00:00Z&end=2026-12-31T00:00:00Z`))).status).toBe(400);
    store.listPosts.mockResolvedValue({ posts: [], undatedTruncated: false });
    expect((await GET(req("GET", `/api/social/posts?brand=${A}&start=2026-10-01T00:00:00Z&end=2026-11-01T00:00:00Z`))).status).toBe(200);
    const long = await POST(req("POST", "/api/social/posts", { role: "owner" }, { brand: A, fields: { body: "x".repeat(301) }, targets: [{ account_id: ACC }] }));
    expect(long.status).toBe(400);
    expect((await long.json()).detail.overLimit[0]).toMatchObject({ platform: "bluesky", length: 301, limit: 300 });
    expect(store.savePost).not.toHaveBeenCalled();
    expect((await POST(req("POST", "/api/social/posts", { role: "owner" }, { brand: A, fields: { body: "ok" }, targets: [{ account_id: ACC }] }))).status).toBe(200);
  });

  it("posts/[id] PUT: needs the version; a client may not edit; DELETE goes through the state rules", async () => {
    const { PUT, DELETE } = await import("../posts/[id]/route");
    store.getPost.mockResolvedValue(draft());
    expect((await PUT(req("PUT", `/api/social/posts/${P}`, { role: "owner" }, { brand: A, fields: { body: "x" } }), ctx(P))).status).toBe(400);
    expect((await PUT(req("PUT", `/api/social/posts/${P}`, { client: A }, { brand: A, version: 3, fields: { body: "x" } }), ctx(P))).status).toBe(403);
    expect((await PUT(req("PUT", `/api/social/posts/${P}`, { role: "operator" }, { brand: A, version: 3, fields: { body: "x" } }), ctx(P))).status).toBe(200);
    expect(store.savePost).toHaveBeenCalledWith(A, P, 3, { body: "x" }, null, null, "ops:operator");
    store.getPost.mockResolvedValue(draft({ state: "queued", scheduled_at: "2026-10-15T00:00:00Z" }));
    store.getPost.mockResolvedValue(draft({ state: "queued", scheduled_at: new Date(Date.now() + 60_000).toISOString(),
      targets: [{ id: "t1", account_id: ACC, custom_body: null, format: "post", state: "queued", postiz_post_id: "pz-1", release_url: null, error: null }] }));
    expect((await DELETE(req("DELETE", `/api/social/posts/${P}?brand=${A}&version=3`), ctx(P))).status).toBe(409);   // going out right now
  });

  // C5: Postiz cannot move a post; a queued one is deleted there first, then released, and the sender recreates it
  it("posts/[id]/state: rescheduling a queued post deletes its Postiz post, then releases it; a published channel refuses", async () => {
    const { PUT } = await import("../posts/[id]/state/route");
    const later = new Date(Date.now() + 3600_000).toISOString();
    const queued = draft({ state: "queued", scheduled_at: later,
      targets: [{ id: "t1", account_id: ACC, custom_body: null, format: "post", state: "queued", postiz_post_id: "pz-1", release_url: null, error: null }] });
    store.getPost.mockResolvedValue(queued);
    postiz.listPosts.mockResolvedValue([{ id: "pz-1", state: "QUEUE" }]);
    postiz.deletePost.mockResolvedValue({ existed: true });
    store.releasePost.mockResolvedValue({ id: P, version: 4 });
    const moved = new Date(Date.now() + 2 * 3600_000).toISOString();
    const res = await PUT(req("PUT", `/api/social/posts/${P}/state`, { role: "operator" }, { brand: A, version: 3, action: "schedule", scheduledAt: moved }), ctx(P));
    expect(res.status).toBe(200);
    expect(postiz.deletePost).toHaveBeenCalledWith("pz-1");
    expect(store.releasePost).toHaveBeenCalledWith(A, P, 3, ["pz-1"], expect.objectContaining({ state: "scheduled", scheduledAt: moved }), "ops:operator", "schedule", {});
    expect(postiz.deletePost.mock.invocationCallOrder[0]).toBeLessThan(store.releasePost.mock.invocationCallOrder[0]);
    expect(store.setState).not.toHaveBeenCalled();
    postiz.deletePost.mockClear();
    postiz.listPosts.mockResolvedValue([{ id: "pz-1", state: "PUBLISHED" }]);
    const pub = await PUT(req("PUT", `/api/social/posts/${P}/state`, { role: "operator" }, { brand: A, version: 3, action: "unschedule" }), ctx(P));
    expect(pub.status).toBe(409);
    expect(postiz.deletePost).not.toHaveBeenCalled();
  });

  it("posts/[id]/state: a reviewer approves; an editor may not; a stale version comes back 409 from the store", async () => {
    const { PUT } = await import("../posts/[id]/state/route");
    const { SocialStoreError } = await import("@/lib/social/store");
    store.getPost.mockResolvedValue(draft({ state: "review" }));
    const body = { brand: A, version: 3, action: "approve", scheduledAt: "2099-01-01T09:00:00Z" };
    expect((await PUT(req("PUT", `/api/social/posts/${P}/state`, { role: "operator" }, body), ctx(P))).status).toBe(403);
    expect((await PUT(req("PUT", `/api/social/posts/${P}/state`, { role: "admin" }, body), ctx(P))).status).toBe(200);
    store.setState.mockRejectedValueOnce(new SocialStoreError(409, "changed"));
    expect((await PUT(req("PUT", `/api/social/posts/${P}/state`, { role: "admin" }, body), ctx(P))).status).toBe(409);
  });

  it("posts/[id]/state: a decision against an older version is refused before anything is written", async () => {
    const { PUT } = await import("../posts/[id]/state/route");
    store.getPost.mockResolvedValue(draft({ version: 4 }));
    const res = await PUT(req("PUT", `/api/social/posts/${P}/state`, { role: "owner" }, { brand: A, version: 3, action: "submit" }), ctx(P));
    expect(res.status).toBe(409);
    expect(store.setState).not.toHaveBeenCalled();
  });

  it("a request without a session identity (sync key, unmatched path) sees no brand at all", async () => {
    const { GET } = await import("../posts/route");
    expect((await GET(req("GET", `/api/social/posts?brand=${A}&start=2026-10-01T00:00:00Z&end=2026-11-01T00:00:00Z`, { anonymous: true }))).status).toBe(403);
    expect(store.listPosts).not.toHaveBeenCalled();
  });

  it("posts GET wp=1: WordPress drafts need the content calendar's role", async () => {
    const { GET } = await import("../posts/route");
    store.listPosts.mockResolvedValue({ posts: [], undatedTruncated: false });
    const url = `/api/social/posts?brand=${A}&start=2026-10-01T00:00:00Z&end=2026-11-01T00:00:00Z&wp=1`;
    expect((await GET(req("GET", url, { role: "viewer" }))).status).toBe(403);
    expect((await GET(req("GET", url, { role: "operator" }))).status).toBe(200);
  });

  it("accounts DELETE ?attempt gives up the open connection", async () => {
    const { DELETE } = await import("../accounts/route");
    expect((await DELETE(req("DELETE", `/api/social/accounts?brand=${A}&attempt=${P}`, { role: "operator" }))).status).toBe(200);
    expect(store.cancelConnect).toHaveBeenCalledWith(A, P, "ops:operator");
    expect(store.unlinkAccount).not.toHaveBeenCalled();
  });

  it("posts/bulk: a malformed item or an inherited name as action is that item's refusal, not a 500", async () => {
    const { POST } = await import("../posts/bulk/route");
    store.getPost.mockResolvedValue(draft());
    const res = await POST(req("POST", "/api/social/posts/bulk", { role: "owner" }, { brand: A, items: [
      null, { id: P, version: 3, action: "constructor" }, { id: P, version: 3, action: "submit" }] }));
    expect(res.status).toBe(200);
    expect((await res.json()).results.map((r: { ok: boolean }) => r.ok)).toEqual([false, false, true]);
  });

  it("posts/bulk: each item stands alone; publish_now never runs in bulk", async () => {
    const { POST } = await import("../posts/bulk/route");
    store.getPost.mockResolvedValue(draft());
    const res = await (await POST(req("POST", "/api/social/posts/bulk", { role: "owner" }, { brand: A, items: [
      { id: P, version: 3, action: "submit" }, { id: P, version: 3, action: "publish_now" }, { id: "bad", version: 3, action: "submit" }] }))).json();
    expect(res.results.map((r: { ok: boolean }) => r.ok)).toEqual([true, false, false]);
  });

  it("lists: weekdays and time are checked; an active list needs a weekday", async () => {
    const { POST } = await import("../lists/route");
    expect((await POST(req("POST", "/api/social/lists", { role: "owner" }, { brand: A, name: "L", weekdays: [8] }))).status).toBe(400);
    expect((await POST(req("POST", "/api/social/lists", { role: "owner" }, { brand: A, name: "L", active: true }))).status).toBe(400);
    store.saveList.mockResolvedValue("l1");
    expect((await POST(req("POST", "/api/social/lists", { role: "owner" }, { brand: A, name: "L", weekdays: [3, 1, 3], account_ids: [ACC] }))).status).toBe(200);
    expect(store.saveList).toHaveBeenCalledWith(A, null, { name: "L", weekdays: [1, 3], send_time: "10:00", active: false, account_ids: [ACC] }, expect.stringMatching(/^ops:/));
  });

  it("lists/[id] DELETE: a viewer is refused", async () => {
    const { DELETE } = await import("../lists/[id]/route");
    expect((await DELETE(req("DELETE", `/api/social/lists/${P}?brand=${A}`, { role: "viewer" }), ctx(P))).status).toBe(403);
  });

  it("media: only https or data:image URLs reach the upload", async () => {
    const { POST } = await import("../media/route");
    expect((await POST(req("POST", "/api/social/media", { role: "owner" }, { brand: A, imageUrl: "http://10.0.0.1/x.png" }))).status).toBe(400);
    expect(store.addImage).not.toHaveBeenCalled();
  });

  it("log: another brand's client is refused; before must be an id", async () => {
    const { GET } = await import("../log/route");
    expect((await GET(req("GET", `/api/social/log?brand=${A}`, { client: B }))).status).toBe(403);
    expect((await GET(req("GET", `/api/social/log?brand=${A}&before=x`))).status).toBe(400);
  });

  // C6: the bin lists deleted posts (GET posts excludes them); saved texts are per brand, written by editors only
  it("posts?trash=1 lists the bin; texts: read by any member, written by editors, refused across brands", async () => {
    const posts = await import("../posts/route");
    store.listTrash.mockResolvedValue([draft({ state: "deleted" })]);
    const bin = await (await posts.GET(req("GET", `/api/social/posts?brand=${A}&trash=1`, { client: A }))).json();
    expect([store.listTrash.mock.calls[0][0], bin.posts[0].state]).toEqual([A, "deleted"]);
    expect(store.listPosts).not.toHaveBeenCalled();
    const texts = await import("../texts/route");
    store.listTexts.mockResolvedValue([{ id: P, body: "hi" }]);
    expect((await texts.GET(req("GET", `/api/social/texts?brand=${A}`, { client: B }))).status).toBe(403);
    expect((await texts.POST(req("POST", "/api/social/texts", { client: A }, { brand: A, body: "x" }))).status).toBe(403);
    expect((await texts.POST(req("POST", "/api/social/texts", { role: "operator" }, { brand: A, body: "  " }))).status).toBe(400);
    store.addText.mockResolvedValue({ id: P, body: "x" });
    expect((await texts.POST(req("POST", "/api/social/texts", { role: "operator" }, { brand: A, body: " x " }))).status).toBe(200);
    expect(store.addText).toHaveBeenCalledWith(A, "x");
    expect((await texts.DELETE(req("DELETE", `/api/social/texts?brand=${A}&id=${P}`, { role: "operator" }))).status).toBe(200);
    expect(store.deleteText).toHaveBeenCalledWith(A, P);
  });

  // C7: a saved list is materialised right away (the save itself withdrew the old plan, 0101); reorder = exact items
  it("lists: saving materialises; GET [id] gives items; order needs unique ids; delete goes through 0101", async () => {
    const lists = await import("../lists/route");
    const one = await import("../lists/[id]/route");
    const order = await import("../lists/[id]/order/route");
    const L = "55555555-5555-4555-8555-555555555555";
    store.saveList.mockResolvedValue(L);
    rotation.materializeList.mockResolvedValue(3);
    const body = { brand: A, name: "FAQ", weekdays: [1, 3], send_time: "10:00", active: true, account_ids: [ACC] };
    expect(await (await lists.POST(req("POST", "/api/social/lists", { role: "operator" }, body))).json()).toMatchObject({ id: L, materialized: 3 });
    expect((await one.PUT(req("PUT", `/api/social/lists/${L}`, { client: A }, body), ctx(L))).status).toBe(403);
    expect((await one.PUT(req("PUT", `/api/social/lists/${L}`, { role: "operator" }, body), ctx(L))).status).toBe(200);
    expect(rotation.materializeList).toHaveBeenLastCalledWith(A, L);
    store.listLists.mockResolvedValue([{ id: L, name: "FAQ" }]);
    rotation.listQueue.mockResolvedValue({ items: [draft({ state: "rotation" })], upcoming: [] });
    expect(await (await one.GET(req("GET", `/api/social/lists/${L}?brand=${A}`, { client: A }), ctx(L))).json()).toMatchObject({ list: { id: L }, items: [{ state: "rotation" }] });
    expect((await order.PUT(req("PUT", `/api/social/lists/${L}/order`, { role: "operator" }, { brand: A, postIds: [P, P] }), ctx(L))).status).toBe(400);
    expect((await order.PUT(req("PUT", `/api/social/lists/${L}/order`, { role: "operator" }, { brand: A, postIds: [P] }), ctx(L))).status).toBe(200);
    expect(rotation.reorderList).toHaveBeenCalledWith(A, L, [P], "ops:operator");
    expect((await one.DELETE(req("DELETE", `/api/social/lists/${L}?brand=${A}`, { role: "operator" }), ctx(L))).status).toBe(200);
    expect(rotation.deleteList).toHaveBeenCalledWith(A, L, "ops:operator");
  });

  // C10: an article of this brand's site, read with the site's own password; another brand's site is a 404
  it("wp-article: editors only, the brand's site only, the REST answer reduced to excerpt / link / image", async () => {
    const { GET } = await import("../wp-article/route");
    wp.listAccessibleWpSites.mockResolvedValue({ sites: [{ id: "s1", name: "S", url: "https://soulful.example", color: "", username: "u", organizationId: A },
      { id: "s2", name: "Other", url: "https://other.example", color: "", username: "u", organizationId: B }], tokens: { s1: "pw" }, usernames: { s1: "u" } });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ title: { rendered: "T" }, excerpt: { rendered: "<p>E</p>" }, link: "https://soulful.example/t" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect((await GET(req("GET", `/api/social/wp-article?brand=${A}&site=s1&post=7`, { client: A }))).status).toBe(403);
      expect((await GET(req("GET", `/api/social/wp-article?brand=${A}&site=s2&post=7`, { role: "operator" }))).status).toBe(404);
      const ok = await (await GET(req("GET", `/api/social/wp-article?brand=${A}&site=s1&post=7`, { role: "operator" }))).json();
      expect(ok.article).toMatchObject({ title: "T", excerpt: "E", link: "https://soulful.example/t", image: null });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://soulful.example/wp-json/wp/v2/posts/7?_embed=wp:featuredmedia");
      expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // review 2026-10-15 R5: the limit counts the text as sent (the link appended), and a link must be a web address
  it("posts: the limit counts the appended link; a bare scheme is not a link", async () => {
    const { POST } = await import("../posts/route");
    store.accountPlatforms.mockResolvedValue(new Map([[ACC, "x"]]));
    const body = "a".repeat(270);
    const ok = await POST(req("POST", "/api/social/posts", { role: "operator" }, { brand: A, fields: { body }, targets: [{ account_id: ACC }] }));
    expect(ok.status).toBe(200);
    const over = await POST(req("POST", "/api/social/posts", { role: "operator" }, { brand: A, fields: { body, link_url: "https://soulful.example/a" }, targets: [{ account_id: ACC }] }));
    expect(over.status).toBe(400);
    expect((await over.json()).detail.overLimit[0]).toMatchObject({ platform: "x", limit: 280 });
    const bare = await POST(req("POST", "/api/social/posts", { role: "operator" }, { brand: A, fields: { body: "x", link_url: "https://" }, targets: [{ account_id: ACC }] }));
    expect(bare.status).toBe(400);
  });

  // C8: with review on, an editor may not change an approved post's content (unschedule first); notes are fine
  it("posts/[id] PUT with review on: an approved post's content is refused for an editor, not for an owner", async () => {
    const { PUT } = await import("../posts/[id]/route");
    review.requiresReview.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    store.getPost.mockResolvedValue(draft({ state: "scheduled", scheduled_at: "2099-01-01T00:00:00Z" }));
    expect((await PUT(req("PUT", `/api/social/posts/${P}`, { role: "operator" }, { brand: A, version: 3, fields: { body: "x" } }), ctx(P))).status).toBe(409);
    expect((await PUT(req("PUT", `/api/social/posts/${P}`, { role: "operator" }, { brand: A, version: 3, fields: { notes: "n" } }), ctx(P))).status).toBe(200);
    expect((await PUT(req("PUT", `/api/social/posts/${P}`, { role: "owner" }, { brand: A, version: 3, fields: { body: "x" } }), ctx(P))).status).toBe(200);
  });
});
