// GCIS company source (card C12.1) against faked responses: list -> county filter -> detail -> website accept/reject, cap 100.
import { describe, expect, it } from "vitest";
import { createBudget, createProviderCall } from "@/lib/collect";
import { collectGrant } from "@/lib/collect/__tests__/grant-fixture";
import { discoverCompanies, type GcisCursor, type GcisUsage } from "../sources/gcis";

const GRANT = await collectGrant();
const F_API = "C8782705-DA48-4897-8537-9F7B0FC463EF";
const DETAIL_API = "5F64D864-61CB-4D0D-8AD9-492047CC1EA6";
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

interface Fake { taxId: string; name: string; location: string; status?: string; organic?: Array<{ link: string; title: string }> }

/** Fake registry + Serper: the list holds every company, detail answers by tax id, /search by the company name asked. */
function setup(companies: Fake[]) {
  const urls: string[] = [];
  const transport = (async (u: string | URL, init: RequestInit) => {
    const url = String(u);
    urls.push(url);
    if (url.startsWith("https://google.serper.dev/search")) {
      const q = (JSON.parse(String(init.body)) as { q: string }).q;
      return json({ organic: companies.find((c) => c.name === q)?.organic ?? [], credits: 1 });
    }
    const filter = decodeURIComponent(new URL(url).search.match(/\$filter=([^&]*)/)![1]);
    if (url.includes(F_API)) {
      const skip = Number(new URL(url).searchParams.get("$skip") ?? 0), top = Number(new URL(url).searchParams.get("$top") ?? 1000);
      return json(companies.slice(skip, skip + top).map((c) => ({ Business_Accounting_NO: c.taxId, Company_Name: c.name, Company_Location: c.location, Capital_Stock_Amount: "1" })));
    }
    if (url.includes(DETAIL_API)) {
      const c = companies.find((x) => filter.endsWith(` ${x.taxId}`));
      return c ? json([{ Business_Accounting_NO: c.taxId, Company_Name: c.name, Responsible_Name: `負責人${c.taxId}`, Company_Location: c.location, Company_Status_Desc: c.status ?? "核准設立" }]) : new Response("", { status: 200 });
    }
    throw new Error(`unexpected ${url}`);
  }) as unknown as typeof fetch;
  const call = createProviderCall({ grant: GRANT, budget: createBudget(), env: { SERPER_API_KEY: "serper-test" }, transport });
  const usage: GcisUsage = { serperCredits: 0, gcisCalls: 0 };
  return { call, usage, urls };
}
const run = (companies: Fake[], county = "台中市", limit?: number, from: GcisCursor | null = null) => {
  const s = setup(companies);
  return discoverCompanies(s.call, s.usage, { item: "F501060", itemDesc: "餐館業", county }, limit, from).then((r) => ({ ...r, ...s }));
};

describe("discoverCompanies", () => {
  it("list -> detail -> website: owner, findbiz source, consent_source; a directory host and a title mismatch give no website", async () => {
    const r = await run([
      { taxId: "11111111", name: "大樹咖啡股份有限公司", location: "臺中市西區某路1號", organic: [
        { link: "https://www.104.com.tw/company/abc", title: "大樹咖啡 - 104人力銀行" },
        { link: "https://www.bigtree.example.tw/about", title: "大樹咖啡 | 關於我們" }] },
      { taxId: "22222222", name: "小河餐飲有限公司", location: "台中市北區某路2號", organic: [
        { link: "https://www.twincn.com/item.aspx?no=22222222", title: "小河餐飲有限公司 公司資料" }] },
      { taxId: "33333333", name: "森林烘焙有限公司", location: "台中市南區某路3號", organic: [
        { link: "https://other.example.tw/", title: "完全不相干的網站" }] },
    ]);
    expect(r.leads).toHaveLength(3);
    expect(r.leads[0]).toMatchObject({ name: "大樹咖啡股份有限公司", website: "https://www.bigtree.example.tw/", industry: "餐館業",
      contact_name: "負責人11111111", contact_role: "負責人", source_type: "gcis",
      source_url: "https://findbiz.nat.gov.tw/fts/query/QueryBar/queryInit.do?11111111",
      consent_source: "general_source:https://findbiz.nat.gov.tw/fts/query/QueryBar/queryInit.do?11111111" });
    expect(r.leads[1].website).toBeNull(); // directory host
    expect(r.leads[2].website).toBeNull(); // title does not hold the company name
    expect(r.withoutWebsite).toBe(2);
    expect(r.usage.serperCredits).toBe(3);
  });

  it("county filter: Company_Location prefix (臺/台 folded) decides before any detail call; a closed company is skipped", async () => {
    const r = await run([
      { taxId: "11111111", name: "甲公司", location: "臺北市中山區1號" },
      { taxId: "22222222", name: "乙商行", location: "台中市西區2號" },
      { taxId: "33333333", name: "丙企業社", location: "台中市北區3號", status: "解散" },
    ]);
    expect(r.leads.map((l) => l.name)).toEqual(["乙商行"]);
    expect(r.skipped).toBe(1);
    expect(r.urls.filter((u) => u.includes(DETAIL_API))).toHaveLength(2); // 甲 never asked
  });

  it("at most 100 companies per run, even when the registry holds more in the county", async () => {
    const many = Array.from({ length: 130 }, (_, i) => ({ taxId: String(10000000 + i), name: `公司${i}號企業社`, location: "台中市西區1號" }));
    const r = await run(many, "台中市", 500);
    expect(r.leads).toHaveLength(100);
    expect(r.urls.filter((u) => u.includes(DETAIL_API))).toHaveLength(100);
    expect(r.next).toEqual({ skip: 100 });
    const rest = await run(many, "台中市", 500, r.next);  // the same search again: the other 30, then the list's end
    expect(rest.leads.map((l) => l.name)).toEqual(many.slice(100).map((c) => c.name));
    expect(rest.next).toBeNull();
  });

  it("a host that is a candidate of 2+ companies is a directory: each company keeps its own host, or none", async () => {
    const dir = (n: string) => ({ link: `https://dir.example.com/c/${n}`, title: `${n}` });
    const r = await run([
      { taxId: "11111111", name: "甲甲餐飲有限公司", location: "台中市西區1號", organic: [dir("甲甲餐飲"), { link: "https://jiajia.example.tw/", title: "甲甲餐飲" }] },
      { taxId: "22222222", name: "乙乙餐飲有限公司", location: "台中市西區2號", organic: [dir("乙乙餐飲"), { link: "https://yiyi.example.tw/", title: "乙乙餐飲" }] },
      { taxId: "33333333", name: "丙丙餐飲有限公司", location: "台中市西區3號", organic: [dir("丙丙餐飲")] },
    ]);
    expect(r.leads.map((l) => l.website)).toEqual(["https://jiajia.example.tw/", "https://yiyi.example.tw/", null]);
    expect(r.withoutWebsite).toBe(1);
  });

  it("gov.tw and edu.tw hosts are never a company's website", async () => {
    const r = await run([
      { taxId: "11111111", name: "丁丁餐飲有限公司", location: "台中市西區1號", organic: [
        { link: "https://www.mlshb.gov.tw/a", title: "丁丁餐飲" }, { link: "https://cm.asia.edu.tw/b", title: "丁丁餐飲" }] },
    ]);
    expect(r.leads[0].website).toBeNull();
    expect(r.withoutWebsite).toBe(1);
  });
});
