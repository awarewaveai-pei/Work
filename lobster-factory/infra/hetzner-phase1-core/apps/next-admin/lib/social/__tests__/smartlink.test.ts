// C26 smart link (SOCIAL_MANAGER_PLAN.md §1b): slug unique, an unpublished page answers 404 with its words, a click is
// counted (once per visitor, link and day) and sent on. The SQL side is
// packages/db/scripts/0113_social_smart_link_visitor_dedupe-local-verify.sh; the real chain is
// tests/e2e/social/smartlink-real-db.sh.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => h.client }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
const { brandDay, publicPage, saveSmartLink, slugProblem } = await import("../smartlink");
const { SocialStoreError } = await import("../store");
const { LinkPageClosed } = await import("../../../app/(shell)/tools/social/smartlinks/LinkPage");
const { GET } = await import("../../../app/(public)/smartlink/[slug]/go/[item]/route");
const Page = (await import("../../../app/(public)/smartlink/[slug]/page")).default;

const ITEM = "11111111-1111-4111-8111-111111111111";
const link = { slug: "soulful", title: "Soulful", bio: "", colour: "b" as const, published: true };

/** a supabase stand-in: rows per table for maybeSingle / list reads, rpc results by name */
function fake(tables: Record<string, unknown>, rpcs: Record<string, { data?: unknown; error?: { code: string; message: string } }> = {}) {
  const rpc = vi.fn(async (name: string, _params: unknown) => ({ data: null, error: null, ...rpcs[name] }));
  h.client = {
    rpc,
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      for (const k of ["select", "eq", "order", "in", "gte"]) q[k] = () => q;
      q.maybeSingle = async () => ({ data: Array.isArray(tables[t]) ? (tables[t] as unknown[])[0] ?? null : tables[t] ?? null, error: null });
      q.then = (ok: (v: unknown) => unknown) => ok({ data: tables[t] ?? [], error: null });
      return q;
    },
  };
  return rpc;
}
const go = (headers: Record<string, string> = { "user-agent": "Mozilla/5.0", "x-real-ip": "203.0.113.7" }) =>
  GET(new Request(`http://x/smartlink/soulful/go/${ITEM}`, { headers }), { params: Promise.resolve({ slug: "soulful", item: ITEM }) });

describe("slug", () => {
  it("lower-case letters, digits and -, never a reserved word", () => {
    expect(slugProblem("soulful-art")).toBeNull();
    for (const bad of ["Soulful", "-art", "a", "有中文", "go", "admin", "api", "new"]) expect(slugProblem(bad), bad).not.toBeNull();
  });

  it("is unique across brands: another brand's slug is a 409 the editor can show", async () => {
    fake({}, { social_save_smart_link: { error: { code: "23505", message: "duplicate key value violates unique constraint" } } });
    const e = await saveSmartLink("b1", link, [], "ops:owner").catch((x) => x);
    expect(e).toBeInstanceOf(SocialStoreError);
    expect(e.status).toBe(409);
    expect(e.message).toBe("這個名字已經有其他品牌在用，請換一個。");
  });
});

describe("an unpublished page", () => {
  it("is not served: the page 404s and says 這頁還沒開放, the same as a page that does not exist", async () => {
    fake({ social_smart_links: { organization_id: "b1", title: "Soulful", bio: "", colour: "b", published: false } });
    expect(await publicPage("soulful")).toBeNull();
    await expect(Page({ params: Promise.resolve({ slug: "soulful" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    fake({});
    expect(await publicPage("nobody")).toBeNull();
    expect(renderToStaticMarkup(LinkPageClosed())).toContain("這頁還沒開放");
  });

  it("sends nobody anywhere and counts nothing", async () => {
    const rpc = fake({ social_smart_links: { organization_id: "b1", published: false } });
    const res = await go();
    expect(res.status).toBe(404);
    expect(rpc.mock.calls.filter((c) => c[0] === "social_smart_link_click")).toHaveLength(0);
  });

  it("a published page shows only what the brand typed, and its buttons go through /go", async () => {
    fake({ social_smart_links: { organization_id: "b1", title: "Soulful", bio: "畫畫", colour: "b", published: true },
      social_smart_link_items: [{ id: ITEM, title: "官網" }] });
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: "soulful" }) }));
    expect(html).toContain("官網");
    expect(html).toContain(`/smartlink/soulful/go/${ITEM}`);
    expect(html).not.toContain("b1");
  });
});

describe("a click", () => {
  beforeEach(() => {
    process.env.SMARTLINK_VISITOR_HASH_SALT = "unit-test-only-salt";
    fake({ social_smart_links: { organization_id: "b1", published: true }, social_smart_link_items: { url: "https://soulful.example" } },
      { social_smart_link_click: { data: { url: "https://soulful.example", counted: true } } });
  });
  afterEach(() => { delete process.env.SMARTLINK_VISITOR_HASH_SALT; });

  it("is counted and sent on with a 302 to the link's own url", async () => {
    const rpc = h.client as { rpc: ReturnType<typeof vi.fn> };
    const res = await go({ "user-agent": "Mozilla/5.0", "x-real-ip": "198.51.100.1" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://soulful.example/");
    expect(rpc.rpc.mock.calls[0][1].p_visitor_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rpc.rpc.mock.calls[0][1].p_visitor_hash).not.toContain("198.51.100.1");
  });

  it("a count that fails with 503 does not hold the visitor: the retry is counted", async () => {
    const rpc = (h.client as { rpc: ReturnType<typeof vi.fn> }).rpc;
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX", message: "down" } });
    const who = { "user-agent": "Mozilla/5.0", "x-real-ip": "198.51.100.9" };
    expect((await go(who)).status).toBe(503);
    expect((await go(who)).status).toBe(302);
    expect(rpc.mock.calls.filter((c) => c[0] === "social_smart_link_click")).toHaveLength(2);
  });

  it("a repeat is still sent on, without counting", async () => {
    const rpc = (h.client as { rpc: ReturnType<typeof vi.fn> }).rpc;
    rpc.mockResolvedValueOnce({ data: { url: "https://soulful.example", counted: true }, error: null });
    rpc.mockResolvedValueOnce({ data: { url: "https://soulful.example", counted: false }, error: null });
    const who = { "user-agent": "Mozilla/5.0", "x-real-ip": "198.51.100.2" };
    await go(who);
    const res = await go(who);
    expect(res.status).toBe(302);
    expect(rpc.mock.calls.filter((c) => c[0] === "social_smart_link_click")).toHaveLength(2);
  });

  it("fails closed without the salt but still redirects", async () => {
    delete process.env.SMARTLINK_VISITOR_HASH_SALT;
    const rpc = (h.client as { rpc: ReturnType<typeof vi.fn> }).rpc;
    const res = await go();
    expect(res.status).toBe(302);
    expect(rpc.mock.calls.some((c) => c[0] === "social_smart_link_click")).toBe(false);
  });
});

describe("brandDay", () => {
  it("steps back whole calendar days across a DST change", () => {
    const now = new Date("2024-03-11T12:00:00Z");   // New York: DST began 2024-03-10
    expect(brandDay("America/New_York", 0, now)).toBe("2024-03-11");
    expect(brandDay("America/New_York", 1, now)).toBe("2024-03-10");
    expect(brandDay("America/New_York", 2, now)).toBe("2024-03-09");
    expect(brandDay("Asia/Taipei", 0, new Date("2026-10-18T17:00:00Z"))).toBe("2026-10-19");
  });
});
