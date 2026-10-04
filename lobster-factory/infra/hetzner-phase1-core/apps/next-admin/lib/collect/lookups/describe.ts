// lookups v1 `describe`: who registered a site and when (the registry's RDAP record) and when the Internet Archive
// first kept the page. Ported from the engine's platform/net/rdap.py and wayback.py (worktree commit ceb3ac8a5).
// The item's own URL is never fetched: only the registry and the archive are asked about it.
//
// The earliest capture is wayback.py's question -- the capture closest to 1996, before the archive began -- asked of
// the archive's replay address (/web/1996/<url> redirects to that capture; HEAD, the redirect is read, not followed).
// wayback.py's availability API answered "no snapshots" for https://www.bbc.com/news on 2026-10-04 while the archive
// holds captures from 1999 (a false 查不到, R3), and its CDX index took 15-17 s for that URL.

import {
  LOOKUP_DEADLINE_MS,
  TOO_SLOW,
  deadline,
  found,
  notFound,
  unchecked,
  whyFailed,
  whyStatus,
  type Cell,
  type DescribeAnswerItem,
} from "@/lib/collect/lookups/contract";
import { COUNTRIES, FIRST_REGISTRATION, RDAP_BASES, RDAP_NOT_LISTED, SECOND_LEVEL } from "@/lib/collect/lookups/lists";

/** collect's fetcher (lib/collect/net/fetcher.ts createCollectFetch), or a fake in tests. */
export type LookupFetch = (
  url: string,
  init?: { headers?: Record<string, string>; method?: string; body?: string; stream?: boolean; redirect?: "manual" },
) => Promise<Response>;

const ARCHIVE_REPLAY = "https://web.archive.org/web/1996/";
const DAY_MS = 24 * 60 * 60 * 1000;

const REGISTRY = "網域註冊資料庫";
const ARCHIVE = "網頁封存館";
const IP_HOST = "這個網址用的是 IP 位址，沒有網域註冊資料";

type Registry = { registered: Cell; country: Cell };

/** RDAP records are public registry data: an answered site is not asked again for 24 h (查不到 included). */
export class RdapCache {
  private readonly map = new Map<string, { at: number; cells: Registry }>();
  constructor(
    private readonly ttlMs = DAY_MS,
    private readonly max = 5000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(site: string): Registry | null {
    const hit = this.map.get(site);
    if (!hit) return null;
    if (this.now() - hit.at >= this.ttlMs) {
      this.map.delete(site);
      return null;
    }
    return hit.cells;
  }

  set(site: string, cells: Registry): void {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value as string);
    this.map.set(site, { at: this.now(), cells });
  }
}

export const RDAP_CACHE = new RdapCache();

export interface DescribeDeps {
  fetch: LookupFetch;
  /** Test seam: a registry list other than collect's own. */
  registries?: { bases: Record<string, string>; notListed: Record<string, string> };
  cache?: RdapCache;
  deadlineMs?: number;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isIpHost(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[");
}

/** The name a registry holds: the last two labels, or three under a second level like co.uk or com.tw. */
export function registrable(host: string): string {
  const labels = host.toLowerCase().replace(/^\.+|\.+$/g, "").replace(/^www\./, "").split(".");
  const keep = labels.length >= 3 && SECOND_LEVEL.has(labels.slice(-2).join(".")) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

/** The registrant's country as the record states it (vCard adr `cc`, else the address's country line). */
function countryOf(entities: unknown): string | null {
  if (!Array.isArray(entities)) return null;
  for (const entity of entities) {
    if (!isObject(entity)) continue;
    if (Array.isArray(entity.roles) && entity.roles.includes("registrant")) {
      const vcard = entity.vcardArray;
      const lines = Array.isArray(vcard) && vcard.length > 1 && Array.isArray(vcard[1]) ? vcard[1] : [];
      for (const line of lines) {
        if (!Array.isArray(line) || line.length < 4 || line[0] !== "adr") continue;
        const params = isObject(line[1]) ? line[1] : {};
        const value = line[3];
        const country = params.cc || (Array.isArray(value) && value.length > 6 ? value[6] : null);
        if (typeof country === "string" && country.trim() && !country.toLowerCase().includes("redact")) return country.trim().slice(0, 60);
      }
    }
    const nested = countryOf(entity.entities);
    if (nested) return nested;
  }
  return null;
}

async function registry(name: string, deps: DescribeDeps): Promise<Registry> {
  const labels = name.split(".");
  const tld = labels[labels.length - 1] ?? "";
  const bases = deps.registries?.bases ?? RDAP_BASES;
  const notListed = deps.registries?.notListed ?? RDAP_NOT_LISTED;
  const suffix = labels.map((_, i) => labels.slice(i).join(".")).find((s) => s !== name && notListed[s] !== undefined);
  const base = bases[tld];
  if (suffix !== undefined || !base) {
    const why = suffix !== undefined ? notListed[suffix] : `「.${tld}」的網域註冊資料庫不在找資料的服務的名單上`;
    return { registered: unchecked(why), country: unchecked(why) };
  }
  const cache = deps.cache ?? RDAP_CACHE;
  const cached = cache.get(name);
  if (cached) return cached;
  const failed = (why: string): Registry => ({ registered: unchecked(why), country: unchecked(why) });
  let record: unknown;
  try {
    const res = await deps.fetch(`${base}domain/${name}`, { headers: { accept: "application/rdap+json" } });
    if (res.status === 404) {
      const why = `網域註冊資料庫查不到 ${name}`;
      const none = { registered: notFound(why), country: notFound(why) };
      cache.set(name, none);
      return none;
    }
    if (!res.ok) return failed(whyStatus(res.status, REGISTRY));
    if (res.headers.get("x-collect-truncated") === "1") return failed(`${REGISTRY}的回答太大，找資料的服務沒有讀完`);
    record = await res.json().catch(() => null);
  } catch (e) {
    return failed(whyFailed(e, REGISTRY));
  }
  if (!isObject(record)) return failed(`${REGISTRY}的回答格式不對`);
  const events = Array.isArray(record.events) ? record.events : [];
  const event = events.find((e) => isObject(e) && e.eventAction === "registration") as Record<string, unknown> | undefined;
  const date = typeof event?.eventDate === "string" ? event.eventDate.slice(0, 10) : "";
  const country = countryOf(record.entities);
  const cells: Registry = {
    registered: !/^\d{4}-\d{2}-\d{2}$/.test(date)
      ? notFound("註冊資料沒有寫註冊日期")
      : date < FIRST_REGISTRATION
        ? notFound("註冊資料寫的註冊日早於 1985 年，不是真的註冊日")
        : found(date, `${name} 在網域註冊資料庫的註冊日`),
    country: country ? found(COUNTRIES[country.toUpperCase()] ?? country, "網域註冊資料寫的") : notFound("註冊資料沒有寫國家（常被隱藏）"),
  };
  cache.set(name, cells);
  return cells;
}

/** The archive's replay address for the capture closest to 1996 (the page's URL without its #fragment). */
export function archiveReplayUrl(url: string): string {
  const page = new URL(url);
  page.hash = "";
  return `${ARCHIVE_REPLAY}${page.toString()}`;
}

/** 查到 the date of the earliest capture; 查不到 when the archive answered 404 (it never kept the page). */
async function firstArchived(url: string, deps: DescribeDeps): Promise<Cell> {
  let res: Response;
  try {
    res = await deps.fetch(archiveReplayUrl(url), { method: "HEAD", redirect: "manual" });
  } catch (e) {
    return unchecked(whyFailed(e, ARCHIVE));
  }
  if (res.status === 404) return notFound("網頁封存館沒有存過這一頁");
  if (res.status >= 400) return unchecked(whyStatus(res.status, ARCHIVE));
  const stamp = /\/web\/(\d{8})\d*/.exec(res.headers.get("location") ?? "")?.[1];
  if (res.status < 300 || !stamp) return unchecked(`${ARCHIVE}的回答格式不對`);
  return found(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`);
}

/** One answer item per URL, same order (R1). A site is asked once per request; nothing here throws. */
export async function describe(urls: string[], deps: DescribeDeps): Promise<DescribeAnswerItem[]> {
  const { inTime, clear } = deadline(deps.deadlineMs ?? LOOKUP_DEADLINE_MS);
  const perSite = new Map<string, Promise<Registry>>();
  try {
    return await Promise.all(
      urls.map(async (url): Promise<DescribeAnswerItem> => {
        const host = new URL(url).hostname;
        const archived = inTime(firstArchived(url, deps), unchecked(TOO_SLOW));
        if (isIpHost(host)) {
          return { url, site: host, registered: unchecked(IP_HOST), country: unchecked(IP_HOST), first_archived: await archived };
        }
        const site = registrable(host);
        if (!perSite.has(site)) perSite.set(site, registry(site, deps));
        const cells = await inTime(perSite.get(site)!, { registered: unchecked(TOO_SLOW), country: unchecked(TOO_SLOW) });
        return { url, site, registered: cells.registered, country: cells.country, first_archived: await archived };
      }),
    );
  } finally {
    clear();
  }
}
