// Card C3.6 / C3.7 (SPEC §5.1): a fact is kept only when its excerpt is on the page; evidence from the lead's own site
// is approved, other sources wait; mailto before text, the site's own domain first; a lead's email is never replaced.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { autoApproves, bestEmail, claimSupport, pageEmails, pageEmailsOf, verifiedClaims, hostOf } from "../research-extract";
import { isPlatformHost } from "../normalize";
import { researchUrl } from "../research";

const m = vi.hoisted(() => ({
  cheap: vi.fn(async (_a: { user: string }) => ({ ok: true as const, raw: "[]", model: "gpt-5.4-nano" })),
  crawlDocs: [] as unknown[],
  upserts: [] as Array<Record<string, unknown>[]>,
  leadUpdates: [] as unknown[],
  timeline: [] as Array<{ event_type: string }>,
  verified: [] as string[][],
  evidenceUpdates: [] as unknown[],
  existing: [] as Array<Record<string, unknown>>,
  invalid: [] as string[],
}));
vi.mock("@/lib/ai/cheap-json", () => ({ generateCheapJsonText: m.cheap }));
vi.mock("@/lib/collect/run", () => ({
  LEAD_RESEARCH_BUDGET: { fetches: 15, ms: 60_000 },
  runLeadResearch: async (o: { sink: { run: (d: unknown[], c: unknown) => Promise<{ written: number; errors?: string[] }> } }) => {
    const sink = await o.sink.run(m.crawlDocs, { tenantRef: "t", runId: "r", log: () => {} });
    return { report: {}, sink };
  },
}));
vi.mock("../verify-email", async (orig) => ({ ...(await orig<typeof import("../verify-email")>()), verifyEmails: async (_db: unknown, _o: unknown, e: string[]) => {
  m.verified.push(e); return new Map(e.map((x) => [x, m.invalid.includes(x) ? "invalid" : "valid"])); } }));

const { researchLead } = await import("../research");

const db = {
  from: (table: string) => {
    const q: Record<string, unknown> = {};
    let counting = false;
    for (const k of ["eq", "in", "or", "is"]) q[k] = () => q;
    q.select = (_c?: string, o?: { count?: string }) => { counting = !!o?.count; return q; };
    q.upsert = (rows: Record<string, unknown>[]) => { m.upserts.push(rows); return { select: async () => ({ data: rows.map((r) => ({ status: r.status })), error: null }) }; };
    q.update = (p: unknown) => { if (table === "co_evidence") m.evidenceUpdates.push(p); else m.leadUpdates.push(p); return q; };
    q.insert = async (row: { event_type: string }) => { if (table === "co_timeline_events") m.timeline.push(row); return { error: null }; };
    q.maybeSingle = async () => ({ data: { id: "lead-1" }, error: null });
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(table === "co_evidence" && !counting ? { data: m.existing, error: null }
      : { count: m.upserts.flat().length, error: null }).then(ok);
    return q;
  },
} as never;

const doc = (url: string, text: string, html: string | null = null) => ({ uri: url, canonicalUrl: url, text, title: "t", collector: "collect/http-html",
  publishedAt: null, raw: html ? { bytes: new TextEncoder().encode(html), mime: "text/html" } : null, meta: {} as Record<string, unknown> });
const lead = (extra: Record<string, unknown> = {}) => ({ id: "lead-1", organization_id: "org-1", name: "小樹", website: "https://www.tree.example", email: null,
  consent_source: null, ...extra });
const run = (l = lead()) => researchLead(db, l, { grant: {} as never, grantContext: {} as never, runKey: "k" });

beforeEach(() => { m.upserts.length = 0; m.leadUpdates.length = 0; m.timeline.length = 0; m.verified.length = 0; m.crawlDocs = [];
  m.evidenceUpdates.length = 0; m.existing = []; m.invalid = []; m.cheap.mockClear(); });

describe("verifiedClaims", () => {
  it("keeps a claim only when its excerpt is on the page (whitespace folded), at most three", () => {
    const page = "每週六上午 10 點\n親子律動課，一期 6 堂。報名請私訊。";
    const raw = JSON.stringify([
      { claim: "週六有親子律動課", excerpt: "每週六上午 10 點 親子律動課" },
      { claim: "有成人瑜伽", excerpt: "成人瑜伽每週三上午九點" },
      { claim: "一期 6 堂", excerpt: "親子律動課，一期 6 堂。" },
      { claim: "報名", excerpt: "報名請私訊" },
    ]);
    const r = verifiedClaims(`好的：${raw}`, page);
    expect(r.kept.map((k) => k.claim)).toEqual(["週六有親子律動課", "一期 6 堂"]);
    expect(r.dropped).toBe(2); // not on the page; an excerpt under 10 characters
    expect(verifiedClaims("not json", page).kept).toEqual([]);
    expect(verifiedClaims('[null, 3, {"claim":"一期 6 堂","excerpt":"親子律動課，一期 6 堂。"}]', page).kept).toHaveLength(1);
  });

  it("support: a paraphrase scores high, a claim the excerpt does not say scores low", () => {
    expect(claimSupport("週六有親子律動課", "每週六上午 10 點 親子律動課")).toBeGreaterThanOrEqual(0.5);
    expect(claimSupport("提供免費到府服務", "服務項目一覽，請洽門市")).toBeLessThan(0.5);
  });

  it.each([
    ["一期 8 堂", "親子律動課，一期 6 堂"],
    ["營業時間 9 點到 6 點", "營業時間 10 點到 8 點，週一公休"],
    ["週六上午10點開課", "每週日上午10點開課"],
    ["不提供到府服務", "我們提供到府服務，歡迎預約"],
    ["提供到府服務", "我們不提供到府服務，請到店"],
    ["一期三堂", "親子律動課一期六堂"],
    ["不提供到府服務", "提供到府服務不限地區"],
    ["有到府服務", "本店不提供到府服務，請到店"],
    ["到府服務可預約", "目前不提供到府服務"],
  ])("a claim whose number, weekday or negation the excerpt does not state is not auto-approved: %s", (claim, excerpt) => {
    expect(autoApproves(claim, excerpt)).toBe(false);
  });

  it("the same facts stated exactly are auto-approved", () => {
    expect(autoApproves("一期 6 堂", "親子律動課，一期 6 堂")).toBe(true);
    expect(autoApproves("週日上午10點開課", "每週日上午10點開課")).toBe(true);
    expect(autoApproves("不提供到府服務", "我們不提供到府服務，請到店")).toBe(true);
    // a negation on something else in the excerpt does not touch the claim
    expect(autoApproves("週一公休", "週一公休，非會員可報名")).toBe(true);
  });
});

describe("pageEmails", () => {
  it("own domain first, mailto before text, asset names dropped", () => {
    const html = '<a href="mailto:Hello@Gmail.com">x</a><a href="mailto:info@tree.example?subject=hi">y</a><img src="logo@2x.png">';
    const text = "聯絡 service@tree.example 或 hello@gmail.com，logo@2x.png";
    expect(pageEmails({ html, text }, hostOf("https://www.tree.example"))).toEqual(["info@tree.example", "service@tree.example", "hello@gmail.com"]);
  });
});

describe("which website may be read (SPEC D20)", () => {
  it("social networks, link pages and marketplaces are refused; a bare domain gets a scheme", () => {
    for (const w of ["https://www.facebook.com/tree", "instagram.com/tree", "https://linktr.ee/tree", "https://shopee.tw/tree", "https://sites.google.com/view/tree"]) {
      expect(researchUrl(w)).toEqual({ reason: "platform_website" });
    }
    expect(researchUrl("tree.example")).toEqual({ url: "https://tree.example" });
    expect(isPlatformHost("m.facebook.com")).toBe(true);
    expect(isPlatformHost("facebookcafe.tw")).toBe(false);
  });
});

describe("bestEmail across pages", () => {
  it("the own-domain address on a later page beats a free-mail address on the home page", () => {
    const site = hostOf("https://company.example");
    const found = [...pageEmailsOf({ html: null, text: "owner@gmail.com", url: "https://company.example/" }, site),
      ...pageEmailsOf({ html: null, text: "info@company.example", url: "https://company.example/contact" }, site)];
    expect(bestEmail(found)).toMatchObject({ email: "info@company.example", sourceUrl: "https://company.example/contact" });
  });
  it("a third party's address in the text (a designer's footer credit) is never taken; a placeholder is never found", () => {
    const site = hostOf("https://company.example");
    const found = pageEmailsOf({ html: null, text: "網頁設計：service@xxdesign.com.tw 例：name@example.com", url: "https://company.example/" }, site);
    expect(found.map((f) => f.email)).toEqual(["service@xxdesign.com.tw"]);
    expect(bestEmail(found)).toBeNull();
    const mailto = pageEmailsOf({ html: '<a href="mailto:owner@gmail.com">寫信給我們</a>', text: "", url: "https://company.example/contact" }, site);
    expect(bestEmail(mailto)).toMatchObject({ email: "owner@gmail.com", mailto: true });
    // a third party's mailto in the footer is another organization, even on the business's own page
    const credit = pageEmailsOf({ html: '<footer>網頁設計 <a href="mailto:service@xxdesign.com.tw">xx 數位</a></footer>', text: "聯絡 owner@gmail.com",
      url: "https://company.example/" }, site);
    expect(bestEmail(credit)).toBeNull();
  });
});

describe("schema.org contact email", () => {
  it("the email of the site's own business JSON-LD counts as a declared contact; a Person's does not; a malformed block is ignored", () => {
    const html = '<script type="application/ld+json">{"@graph":[{"@type":"Organization","email":"Info@Tree.example"},'
      + '{"@type":"Person","name":"designer","email":"designer@gmail.com"}]}</script>'
      + '<script type="application/ld+json">{not json</script>';
    const found = pageEmailsOf({ html, text: "", url: "https://tree.example/" }, "tree.example");
    expect(found).toEqual([{ email: "info@tree.example", sourceUrl: "https://tree.example/", own: true, mailto: true }]);
  });
});

describe("researchLead", () => {
  it("own-site facts the excerpt supports are approved, the rest pending; an off-site page is not read; the lead takes the best address", async () => {
    m.crawlDocs = [doc("https://tree.example/about", "每週六上午親子律動課，報名請寫信 info@tree.example，服務項目一覽"),
      doc("https://news.example/a", "小樹親子館開幕，聯絡 pr@news.example")];
    m.cheap.mockImplementation(async (a: { user: string }) => ({ ok: true as const, model: "gpt-5.4-nano",
      raw: '[{"claim":"週六有親子律動課","excerpt":"每週六上午親子律動課"},{"claim":"提供免費到府服務","excerpt":"報名請寫信 info@tree.example，服務項目一覽"}]' }));
    const o = await run();
    expect(m.upserts.flat().map((r) => [r.claim, r.status])).toEqual([["週六有親子律動課", "approved"], ["提供免費到府服務", "pending"]]);
    expect(m.cheap).toHaveBeenCalledTimes(1); // news.example was never sent to the model
    expect(o).toMatchObject({ status: "done", written: 2, approved: 1, emailFound: "info@tree.example" });
    // read off the lead's own site: published by the business itself (SPEC D20), so no notice line is needed
    expect(m.leadUpdates).toMatchObject([{ email: "info@tree.example", consent_source: "self_published:https://tree.example/about" }]);
    expect(m.verified).toEqual([["info@tree.example"]]);
    expect(m.timeline.map((t) => t.event_type)).toEqual(["research_started", "email_found", "research_done"]);
  });

  it("a short page the quality gate set aside gives its address, never a fact; a later mailto upgrades a plain mention", async () => {
    m.crawlDocs = [doc("https://tree.example/", "聯絡 owner@gmail.com"),
      { ...doc("https://tree.example/contact", "聯絡我們", '<a href="mailto:owner@gmail.com">寫信</a>'), meta: { aside: "too_short" } }];
    m.cheap.mockResolvedValue({ ok: true as const, raw: "[]", model: "gpt-5.4-nano" });
    const o = await run();
    expect(m.cheap).toHaveBeenCalledTimes(1); // the aside page never went to the model
    expect(o.emailFound).toBe("owner@gmail.com");
  });

  it("evidence whose excerpt has left an admitted page goes stale; a stale row whose excerpt is back returns", async () => {
    m.existing = [
      { id: "e-old", claim: "全館免運", excerpt: "全館免運費優惠中", status: "approved", reviewed_by: null },
      { id: "e-keep", claim: "週六上午親子律動課", excerpt: "每週六上午親子律動課", status: "approved", reviewed_by: null },
      { id: "e-back", claim: "一期 6 堂", excerpt: "親子律動課一期 6 堂", status: "stale", reviewed_by: null },
      // the rule alone would leave this one pending (support 3/7): only the person's approval brings it back approved
      { id: "e-person", claim: "提供免費到府服務", excerpt: "週末可預約到府服務", status: "stale", reviewed_by: "u-1" },
    ];
    m.crawlDocs = [doc("https://tree.example/about", "每週六上午親子律動課，親子律動課一期 6 堂，週末可預約到府服務")];
    m.cheap.mockResolvedValue({ ok: true as const, raw: "[]", model: "gpt-5.4-nano" });
    await run();
    expect(m.evidenceUpdates).toEqual([{ status: "stale" }, { status: "approved" }, { status: "approved" }]);
  });

  it("a page the quality gate set aside never makes evidence stale (its text may be a fragment)", async () => {
    m.existing = [{ id: "e1", claim: "週六上午親子律動課", excerpt: "每週六上午親子律動課", status: "approved", reviewed_by: "u-1" }];
    m.crawlDocs = [{ ...doc("https://tree.example/about", "請稍候"), meta: { aside: "too_short" } }];
    await run();
    expect(m.evidenceUpdates).toEqual([]);
  });

  it("an address whose domain receives no mail is never filled in; the next eligible one is", async () => {
    m.crawlDocs = [doc("https://tree.example/", "寫信 old@tree.example", '<a href="mailto:owner@gmail.com">寫信</a>')];
    m.invalid = ["old@tree.example"];
    m.cheap.mockResolvedValue({ ok: true as const, raw: "[]", model: "gpt-5.4-nano" });
    const o = await run();
    expect(o.emailFound).toBe("owner@gmail.com");
    expect(m.timeline.map((t) => t.event_type)).toContain("email_undeliverable");
  });

  it("on a shared host (a path-scoped site) the platform's own address is not the business's", async () => {
    m.crawlDocs = [doc("https://medium.com/@biz/about", "聯絡平台 support@medium.com")];
    m.cheap.mockResolvedValue({ ok: true as const, raw: "[]", model: "gpt-5.4-nano" });
    const o = await run(lead({ website: "https://medium.com/@biz" }));
    expect(o.emailFound).toBeNull();
  });

  it("never replaces an email the lead already has", async () => {
    m.crawlDocs = [doc("https://tree.example/", "寫信到 info@tree.example")];
    m.cheap.mockResolvedValue({ ok: true as const, raw: "[]", model: "gpt-5.4-nano" });
    const o = await run(lead({ email: "owner@tree.example" }));
    expect(o.emailFound).toBeNull();
    expect(m.leadUpdates).toEqual([]);
  });

  it("no website = no crawl, and the reason is on the timeline", async () => {
    const o = await run(lead({ website: "  " }));
    expect(o.status).toBe("no_website");
    expect(m.timeline.map((t) => t.event_type)).toEqual(["research_insufficient"]); // nothing was started
  });

  // Card C17: a website field that is an Instagram page is read through the social ladder instead of being refused.
  it("an Instagram website: the profile's facts become evidence, its declared address is filled, the site is not crawled", async () => {
    const bio = "台中市北區篤行路316巷2號，平日 15:00—01:00 營業，訂位請寫信 coffeehere@gmail.com";
    const call = async (id: string, init: { path: string }) => new Response(JSON.stringify(
      init.path.includes("/me?") ? { instagram_business_account: { id: "17841423840764175" } }
        : id === "meta_discovery" ? { business_discovery: { name: "Coffee Here", biography: bio,
          media: { data: [{ caption: "六月起平日 15:00—01:00 營業，假日照常", permalink: "https://www.instagram.com/p/X1/", timestamp: new Date().toISOString() }] } } } : {}), { status: 200 });
    m.crawlDocs = [doc("https://www.instagram.com/_coffeehere_/", "should never be crawled")];
    m.cheap.mockImplementation(async () => ({ ok: true as const, model: "gpt-5.4-nano", raw: '[{"claim":"平日 15:00—01:00 營業","excerpt":"平日 15:00—01:00 營業"}]' }));
    const o = await researchLead(db, lead({ website: "https://www.instagram.com/_coffeehere_?igsh=x" }),
      { grant: {} as never, grantContext: {} as never, runKey: "k", callProvider: call as never });
    // the profile's fact follows the auto-approve rule; the same fact in a post is a dated announcement and waits
    expect(m.upserts.flat().map((r) => [r.claim, r.status, r.source_url])).toEqual([["平日 15:00—01:00 營業", "approved", "https://www.instagram.com/_coffeehere_/"],
      ["平日 15:00—01:00 營業", "pending", "https://www.instagram.com/p/X1/"]]);
    expect(o).toMatchObject({ status: "done", emailFound: "coffeehere@gmail.com" });
    expect(m.leadUpdates).toMatchObject([{ email: "coffeehere@gmail.com", consent_source: "self_published:https://www.instagram.com/_coffeehere_/" }]);
    expect(m.timeline.map((t) => t.event_type)).toEqual(["research_started", "social_research", "email_found", "research_done"]);
  });

  it("the own site an Instagram profile links becomes the lead's website and is read in the same run; a maps link is not a site", async () => {
    const ig = (website: string) => async (_id: string, init: { path: string }) => new Response(JSON.stringify(
      init.path.includes("/me?") ? { instagram_business_account: { id: "17841423840764175" } }
        : { business_discovery: { name: "Coffee Here", biography: "台中北區的咖啡店", website } }), { status: 200 });
    m.crawlDocs = [doc("https://coffeehere.tw/menu", "招牌手沖一杯 180 元，每週一公休")];
    const o = await researchLead(db, lead({ website: "https://www.instagram.com/_coffeehere_/" }),
      { grant: {} as never, grantContext: {} as never, runKey: "k", callProvider: ig("https://coffeehere.tw") as never });
    expect(o.websiteFound).toBe("https://coffeehere.tw");
    // the profile URL moves to social_url, the business's own site takes the website field
    expect(m.leadUpdates[0]).toMatchObject({ website: "https://coffeehere.tw", social_url: "https://www.instagram.com/_coffeehere_/" });
    expect(m.cheap.mock.calls.some(([a]) => a.user.includes("招牌手沖一杯 180 元"))).toBe(true); // the site page went to the model
    expect(m.timeline.map((t) => t.event_type).slice(0, 3)).toEqual(["research_started", "social_research", "website_found"]);

    m.leadUpdates.length = 0; m.timeline.length = 0; m.cheap.mockClear();
    const o2 = await researchLead(db, lead({ website: "https://www.instagram.com/_coffeehere_/" }),
      { grant: {} as never, grantContext: {} as never, runKey: "k", callProvider: ig("https://maps.app.goo.gl/sf1fMrZxgnHAAmSR8") as never });
    expect(o2.websiteFound).toBeUndefined();
    expect(m.leadUpdates.some((u) => (u as { website?: string }).website)).toBe(false);
    expect(m.cheap.mock.calls.some(([a]) => a.user.includes("招牌手沖"))).toBe(false); // nothing crawled
    // what profiles link instead of a site (live 2026-11-01): a form, a link page, a LINE account
    for (const w of ["https://forms.gle/bJGRHYirEb71xn7V9", "https://linktr.ee/52syoga", "https://page.line.me/612qmcyq"]) {
      expect(researchUrl(w)).toEqual({ reason: "platform_website" });
    }
  });

  it("a platform website that is not Instagram or Facebook is still refused", async () => {
    const o = await run(lead({ website: "https://linktr.ee/cafe" }));
    expect(o.status).toBe("platform_website");
  });
});
