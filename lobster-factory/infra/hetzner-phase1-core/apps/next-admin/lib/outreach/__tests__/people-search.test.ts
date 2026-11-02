// Card C13.1/C13.4: the search guard -- approval passes on a search row's consent_source only when it is
// self_published:<link> or general_source:<link> and <link> is the row's own source_url; search results become
// profile rows (title/snippet/link only), a post or company page is dropped.
import { describe, expect, it } from "vitest";
import { createBudget, createProviderCall } from "@/lib/collect";
import { collectGrant } from "@/lib/collect/__tests__/grant-fixture";
import { inboxConsentSource, peopleQueries, resultToLead, searchPeople, type PeopleUsage } from "../sources/people-search";

const LINK = "https://tw.linkedin.com/in/ann-lee-123";

describe("inboxConsentSource", () => {
  it("a search row passes on only its own link, self_published or general_source", () => {
    expect(inboxConsentSource("search", `self_published:${LINK}`, LINK)).toBe(`self_published:${LINK}`);
    expect(inboxConsentSource("search", `general_source:${LINK}`, LINK)).toBe(`general_source:${LINK}`);
    expect(inboxConsentSource("search", "self_published:https://other.example/x", LINK)).toBeNull();
    expect(inboxConsentSource("search", "self_published:", LINK)).toBeNull();
    expect(inboxConsentSource("search", "meta_lead_ad:1", LINK)).toBeNull();
    expect(inboxConsentSource("search", "inferred", LINK)).toBeNull();
    expect(inboxConsentSource("search", `self_published:${LINK}`, null)).toBeNull();
  });

  it("any other source type passes nothing; gcis keeps its own rule", () => {
    expect(inboxConsentSource("manual", `self_published:${LINK}`, LINK)).toBeNull();
    expect(inboxConsentSource("pasted_person", `general_source:${LINK}`, LINK)).toBeNull();
    expect(inboxConsentSource("gcis", "general_source:https://findbiz.nat.gov.tw/x", null)).toBe("general_source:https://findbiz.nat.gov.tw/x");
    expect(inboxConsentSource("gcis", `self_published:${LINK}`, LINK)).toBeNull();
  });
});

describe("search results become profile rows", () => {
  it("LinkedIn title -> name, role, company; an email in the snippet = self_published, none = general_source", () => {
    const own = resultToLead("linkedin", { title: "Ann Lee - 行銷經理 - Acme | LinkedIn", link: `${LINK}?trk=x`, snippet: "聯絡 Ann@Acme.com" }, "台中");
    expect(own).toMatchObject({ name: "Ann Lee", contact_role: "行銷經理", industry: "Acme", email: "ann@acme.com", source_type: "search",
      source_url: LINK, social_url: LINK, consent_source: `self_published:${LINK}` });
    expect(resultToLead("linkedin", { title: "Ann Lee - CEO at Acme | LinkedIn", link: LINK, snippet: "Taichung" }, "")).toMatchObject({
      contact_role: "CEO", industry: "Acme", email: null, consent_source: `general_source:${LINK}` });
  });

  it("not a person's profile page: a company page, a post, a plain-http link, a profile-listing title", () => {
    expect(resultToLead("linkedin", { title: "Acme | LinkedIn", link: "https://www.linkedin.com/company/acme" }, "")).toBeNull();
    expect(resultToLead("instagram", { title: "Cafe (@cafe) • Instagram", link: "https://www.instagram.com/p/abc123/" }, "")).toBeNull();
    expect(resultToLead("linkedin", { title: "Ann Lee - CEO | LinkedIn", link: "http://www.linkedin.com/in/ann" }, "")).toBeNull();
    expect(resultToLead("linkedin", { title: "300+ \"CEO\" profiles | LinkedIn", link: "https://www.linkedin.com/in/x" }, "")).toBeNull();
    expect(resultToLead("instagram", { title: "Ann Yoga (@annyoga) • Instagram photos and videos", link: "https://www.instagram.com/annyoga/" }, "")).toMatchObject({
      name: "Ann Yoga", source_url: "https://www.instagram.com/annyoga" });
  });

  it("queries quote the phrases; a run asks Serper /search only, ≤ 20 rows, one profile once", async () => {
    expect(peopleQueries({ role: "行銷經理", company: "Acme", location: "台中", keyword: "" }).map((q) => q.q))
      .toEqual(['site:linkedin.com/in "行銷經理" "Acme" "台中"']);
    const urls: string[] = [];
    const transport = (async (u: string | URL, init: RequestInit) => {
      urls.push(String(u));
      const page = (JSON.parse(String(init.body)) as { page: number }).page;
      return new Response(JSON.stringify({ credits: 1, organic: Array.from({ length: 10 }, (_, i) => ({
        title: `Person${page}x${i} Lee - CEO - Acme | LinkedIn`, link: `https://www.linkedin.com/in/p${i % 8}-${page}`, snippet: "" })) }), { status: 200 });
    }) as unknown as typeof fetch;
    const call = createProviderCall({ grant: await collectGrant(), budget: createBudget(), env: { SERPER_API_KEY: "serper-test" }, transport });
    const usage: PeopleUsage = { serperCredits: 0 };
    const r = await searchPeople(call, usage, { role: "CEO", company: "", location: "", keyword: "" });
    expect(urls.every((u) => u === "https://google.serper.dev/search")).toBe(true);
    expect(r.leads).toHaveLength(16); // 8 distinct links per page, 2 pages, links repeat inside a page
    expect(new Set(r.leads.map((l) => l.source_url)).size).toBe(16);
    expect(usage.serperCredits).toBe(2);
  });
});
