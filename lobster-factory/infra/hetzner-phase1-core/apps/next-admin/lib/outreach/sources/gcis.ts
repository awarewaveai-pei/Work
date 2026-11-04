// Cold Outreach v2 -- lead source: registered companies from Taiwan's business registry open data (SPEC D20, card C12).
// Nothing here writes; the results go through the ordinary inbox import (normalize, dedup, suppression, score).
//
// SHAPE AND LIMITS COME FROM THE DOCS (data.gcis.nat.gov.tw/od/rule), NOT FROM OUR OWN CALL: the server IP is not
// whitelisted yet (card C12.3), so no call has been made from ks-aw-01. One live call must confirm, before this is
// trusted: the response keys below, the `Business_Item_Desc like` filter of the item lookup (documented only for
// Company_Name elsewhere), and the daily call limit ("超出本日最大介接次數" -- no number is published; $top max 1000).
//
//  - code table  FCB90AB1-...  $filter=Business_Item eq <code>  -> [{Business_Item, Business_Item_Desc, ...}] (items, not companies)
//  - by item     one API per category letter (CATEGORY_API), $filter=Business_Item eq <code>
//                -> [{Business_Accounting_NO, Company_Name, Company_Location, Capital_Stock_Amount}]. Only F is a
//                released API; the others are marked 測試 on the rule page (C answered "非授權介接之IP" to an unlisted IP).
//  - detail      5F64D864-...  $filter=Business_Accounting_NO eq <統編>
//                -> [{Company_Name, Responsible_Name, Company_Location, Company_Status_Desc, ...}]
//  - an empty body (HTTP 200) means no rows; an error is plain text ("此API不開放使用", "非授權介接之IP(...)").
// Attribution: GCIS terms 三(二) require a 顯名聲明 wherever the data is used; the Inbox page footer carries it (GCIS_ATTRIBUTION).
import type { ProviderCall } from "@/lib/collect/net/providers";
import { ProviderCallError } from "@/lib/collect/net/providers";
import { domainOf, isPlatformHost, type RawLead } from "../normalize";

export const GCIS_MAX_COMPANIES = 100;
/** The most Serper credits one run spends: one /search per company. Held from a paying wallet before the first call. */
export const GCIS_MAX_SERPER_CREDITS = GCIS_MAX_COMPANIES;
export const GCIS_SOURCE_TYPE = "gcis";
const LIST_TOP = 1000;
const MAX_LIST_PAGES = 5;
const CONCURRENCY = 5;
const MAX_ITEM_MATCHES = 20;

export const GCIS_ATTRIBUTION = "公司資料：經濟部商工登記公示資料（經濟部商業發展署）。此開放資料依政府資料開放授權條款（Open Government Data License）第 1 版進行公眾釋出：https://data.gov.tw/license";

const API = "/od/data/api/";
const ITEM_TABLE = "FCB90AB1-E382-45CE-8D4F-394861851E28";
const DETAIL_API = "5F64D864-61CB-4D0D-8AD9-492047CC1EA6";
/** Category letter (first letter of the item code) -> the company-by-item API of that category. */
export const CATEGORY_API: Readonly<Record<string, string>> = {
  A: "11944415-69DE-4770-8D19-1FD8732AA81A", B: "8C5BF2E5-F867-4CDC-A698-E3C93A31FA7D", C: "955A9F2C-8703-4550-A280-E6506B781A3B",
  D: "B486F6AE-F486-4BA9-B217-E04D15ED58C3", E: "3FA36C1B-4D3F-489A-9ACC-DCE1A1EB401D", F: "C8782705-DA48-4897-8537-9F7B0FC463EF",
  G: "4C4B0E58-551B-479E-8636-8A581BA9BE29", H: "4C237B5D-E4BC-46DC-B246-6B20B8660A22", I: "85F5E823-A0D5-4C2C-B7FA-765D80050ABA",
  J: "7BC6C09E-502F-407E-86D0-7E4D1143D687", Z: "BB446B37-1797-41BF-ADC2-D0B7BA846D23",
};

export const GCIS_COUNTIES = ["台北市", "新北市", "桃園市", "台中市", "台南市", "高雄市", "基隆市", "新竹市", "新竹縣", "苗栗縣", "彰化縣",
  "南投縣", "雲林縣", "嘉義市", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣", "金門縣", "連江縣"] as const;

/** Pages that list companies or jobs rather than being one company's own site: never a lead's website. Social and
 *  marketplace hosts are rejected too (isPlatformHost). */
export const DIRECTORY_HOSTS = ["104.com.tw", "1111.com.tw", "518.com.tw", "yes123.com.tw", "findbiz.nat.gov.tw", "gcis.nat.gov.tw",
  "twincn.com", "opencorporates.com", "yellowpages.com.tw", "iyp.com.tw", "ibiz.tw", "wikipedia.org", "ptt.cc", "dcard.tw", "mobile01.com"];

export class GcisError extends Error {
  constructor(message: string) { super(`gcis: ${message}`); this.name = "GcisError"; }
}

export interface GcisLead extends RawLead { consent_source: string }
/** Counters the caller reads even when the run throws midway: what to settle. */
export interface GcisUsage { serperCredits: number; gcisCalls: number }
export interface GcisItem { code: string; desc: string }
/** Where the next run of the same search starts in the national list by business item ($skip). */
export interface GcisCursor { skip: number }
export interface GcisResult { leads: GcisLead[]; /** Companies dropped: closed, not found, or a failed detail call. */ skipped: number; withoutWebsite: number;
  /** null = the national list was read to its end. A run reads at most MAX_LIST_PAGES pages (Codex C12 F2); a long list
   *  carries on from here the next run instead of being cut. */ next: GcisCursor | null }

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const fold = (v: string): string => v.replace(/臺/g, "台").toLowerCase();
export const findbizUrl = (taxId: string): string => `https://findbiz.nat.gov.tw/fts/query/QueryBar/queryInit.do?${taxId}`;

async function gcisRows(call: ProviderCall, usage: GcisUsage, api: string, filter: string, skip = 0, top = 50): Promise<Record<string, unknown>[]> {
  usage.gcisCalls++;
  const res = await call("gcis", { method: "GET",
    path: `${API}${api}?$format=json&$filter=${encodeURIComponent(filter)}&$skip=${skip}&$top=${top}` });
  const text = (await res.text()).trim();
  if (!text) return [];
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new GcisError(text.slice(0, 120)); }
  return Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
}

/** The search box: item codes whose description contains `text` (or the code itself, e.g. F101040), limited to the
 *  categories this source can list. */
export async function searchBusinessItems(call: ProviderCall, usage: GcisUsage, text: string): Promise<GcisItem[]> {
  const t = text.trim().replace(/['"]/g, "");
  if (!t || t.length > 40) return [];
  const filter = /^[A-Za-z]\d{6}$/.test(t) ? `Business_Item eq ${t.toUpperCase()}` : `Business_Item_Desc like ${t}`;
  const out: GcisItem[] = [];
  // `like` on Business_Item_Desc is not among the documented conditions (only `Business_Item eq`): a refusal of the
  // text search answers no match, and the page tells the person to type the item code (Codex C12 F3; checked at C12.3).
  let rows: Record<string, unknown>[];
  try { rows = await gcisRows(call, usage, ITEM_TABLE, filter, 0, 100); }
  catch (e) { if (filter.startsWith("Business_Item_Desc") && (e instanceof GcisError || (e instanceof ProviderCallError && e.kind === "http" && (e.status ?? 0) < 500 && ![401, 402, 403, 429].includes(e.status ?? 0)))) return []; throw e; }
  for (const r of rows) {
    const code = str(r.Business_Item)?.toUpperCase();
    const desc = str(r.Business_Item_Desc);
    if (!code || !desc || !CATEGORY_API[code[0]] || out.some((o) => o.code === code)) continue;
    out.push({ code, desc });
    if (out.length >= MAX_ITEM_MATCHES) break;
  }
  return out;
}

const SUFFIXES = /(股份有限公司|有限公司|無限公司|兩合公司|股份兩合公司|有限合夥|企業社|商行|公司)$/;
/** 「大樹咖啡股份有限公司」 -> 「大樹咖啡」: what a business's own page title would still say. */
export function companyCore(name: string): string {
  return name.replace(/[（(][^)）]*[)）]/g, "").replace(SUFFIXES, "").trim();
}

const isGovEdu = (host: string): boolean => {
  const l = host.split(".");
  return ["gov", "edu"].includes(l[l.length - 1]) || (l.length >= 2 && l[l.length - 1] === "tw" && ["gov", "edu"].includes(l[l.length - 2]));
};

/** Site roots from a Serper /search answer, in rank order: from the top 3 results, those whose host is not a platform,
 *  directory, or gov/edu host and whose title holds the company's core name. Whether a candidate really is this
 *  company's own site is decided across companies (ownCandidate). */
export function websiteCandidates(name: string, organic: unknown): string[] {
  const core = companyCore(name);
  const out: string[] = [];
  if (core.length < 2 || !Array.isArray(organic)) return out;
  for (const r of organic.slice(0, 3) as Array<{ link?: unknown; title?: unknown }>) {
    const link = str(r.link);
    const title = str(r.title);
    const host = domainOf(link)?.split(":")[0];
    if (!link || !title || !host || !/^https?:\/\//i.test(link)) continue;
    if (isPlatformHost(host) || isGovEdu(host) || DIRECTORY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) continue;
    if (!fold(title).includes(fold(core))) continue;
    try { const o = new URL(link).origin + "/"; if (!out.includes(o)) out.push(o); } catch { continue; }
  }
  return out;
}
const hostOf = (origin: string): string => new URL(origin).host;

/** One host stands for one company: a host that is a candidate of two or more different companies in the same run is a
 *  directory, whatever its name, and is nobody's website. */
function ownCandidate(candidates: string[], hostCompanies: Map<string, number>): string | null {
  return candidates.find((o) => hostCompanies.get(hostOf(o)) === 1) ?? null;
}

/** Runs `fn` over `items`, at most CONCURRENCY at a time, results in input order. */
async function pool<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let failure: { e: unknown } | null = null;
  // A failure stops new work but waits for the calls in flight, so the caller settles what they cost (Codex C12 F1).
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i]); } catch (e) { failure ??= { e }; next = items.length; }
    }
  }));
  if (failure) throw (failure as { e: unknown }).e;
  return out;
}

/** Only a failure of this one company is survivable; no key, grant, budget, quota or whitelist ends the run. */
const survivable = (e: unknown): boolean => e instanceof GcisError
  || (e instanceof ProviderCallError && (e.kind === "network" || (e.kind === "http" && ![401, 402, 403, 429].includes(e.status ?? 0))));

/** Up to `limit` (≤ 100) companies running business item `item` in `county`: list by item, county filtered on
 *  Company_Location, detail by tax id (owner, status), website by a Serper search. A company with no website is kept
 *  (the pipeline marks it research_insufficient). The caller's callProvider carries the grant and budget. */
export async function discoverCompanies(call: ProviderCall, usage: GcisUsage, input: { item: string; itemDesc: string; county: string }, limit = GCIS_MAX_COMPANIES,
  from: GcisCursor | null = null): Promise<GcisResult> {
  const want = Math.min(Math.max(1, limit), GCIS_MAX_COMPANIES);
  const item = input.item.trim().toUpperCase();
  const api = CATEGORY_API[item[0] ?? ""];
  if (!/^[A-Z]\d{6}$/.test(item) || !api) throw new GcisError(`item_not_supported: ${input.item}`);
  const county = fold(input.county.trim());

  const ids: string[] = [];
  const seen = new Set<string>();
  let next: GcisCursor | null = from ?? { skip: 0 };
  for (let n = 0; next && ids.length < want && n < MAX_LIST_PAGES; n++) {
    const rows = await gcisRows(call, usage, api, `Business_Item eq ${item}`, next.skip, LIST_TOP);
    let i = 0;
    for (; i < rows.length && ids.length < want; i++) {
      const taxId = str(rows[i].Business_Accounting_NO);
      if (!taxId || !/^\d{8}$/.test(taxId) || seen.has(taxId)) continue;
      seen.add(taxId);
      if (county && !fold(str(rows[i].Company_Location) ?? "").startsWith(county)) continue;
      ids.push(taxId);
    }
    next = i < rows.length || rows.length === LIST_TOP ? { skip: next.skip + i } : null;
  }

  let skipped = 0;
  const found = await pool(ids, async (taxId): Promise<{ lead: Omit<GcisLead, "website">; candidates: string[] } | null> => {
    let d: Record<string, unknown> | undefined;
    try { d = (await gcisRows(call, usage, DETAIL_API, `Business_Accounting_NO eq ${taxId}`))[0]; }
    catch (e) { if (!survivable(e)) throw e; skipped++; return null; }
    const name = str(d?.Company_Name);
    const status = str(d?.Company_Status_Desc);
    if (!d || !name || (status && !status.includes("核准設立"))) { skipped++; return null; }
    let candidates: string[] = [];
    try {
      const res = await call("serper", { path: "/search", body: { q: name, num: 3, gl: "tw", hl: "zh-tw" } });
      const j = (await res.json()) as { organic?: unknown; credits?: unknown };
      usage.serperCredits += typeof j.credits === "number" ? j.credits : 1;
      candidates = websiteCandidates(name, j.organic);
    } catch (e) { if (!survivable(e)) throw e; usage.serperCredits += 1; }
    const url = findbizUrl(taxId);
    return { candidates, lead: { name, industry: input.itemDesc.trim() || null, region: str(d.Company_Location),
      contact_name: str(d.Responsible_Name), contact_role: "負責人", source_type: GCIS_SOURCE_TYPE, source_url: url,
      consent_source: `general_source:${url}` } };
  });
  const done = found.filter((f): f is NonNullable<typeof f> => !!f);
  const hostCompanies = new Map<string, number>();
  for (const f of done) for (const h of new Set(f.candidates.map(hostOf))) hostCompanies.set(h, (hostCompanies.get(h) ?? 0) + 1);
  const leads: GcisLead[] = done.map((f) => ({ ...f.lead, website: ownCandidate(f.candidates, hostCompanies) }));
  const withoutWebsite = leads.filter((l) => !l.website).length;
  return { leads, skipped, withoutWebsite, next };
}
