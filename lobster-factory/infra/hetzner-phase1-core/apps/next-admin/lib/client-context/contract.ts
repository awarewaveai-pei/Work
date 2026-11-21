/**
 * 目前客戶契約（ADR 020）：純函式，無 React、無 fetch、無 process.env。
 * 規則正本：agency-os/docs/architecture/decisions/020-client-context.md §1。
 * 不得在此 import lib/portal/hosts（主機只在伺服器算，瀏覽器端模組禁用）。
 */

export const PARAM = { org: "org", site: "site" } as const;

/** 換客戶時必須一起清掉的、依附於 org 的網址參數。 */
export const ORG_DEPENDENT_PARAMS = ["site", "topic", "month"] as const;

export type Layer = "org" | "site";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(v: string | null): string | null {
  const t = (v ?? "").trim();
  return UUID_RE.test(t) ? t.toLowerCase() : null;
}

export interface NormalizedQuery {
  org: string | null;
  site: string | null;
  /** true＝網址要改寫：用了舊名 `siteId`，或 org／site 參數存在但不是 uuid。 */
  legacy: boolean;
}

export function normalizeQuery(sp: URLSearchParams): NormalizedQuery {
  const rawOrg = sp.get(PARAM.org);
  const rawSite = sp.get(PARAM.site);
  const rawLegacySite = sp.get("siteId");
  const org = asUuid(rawOrg);
  const site = asUuid(rawSite) ?? (rawSite === null ? asUuid(rawLegacySite) : null);
  const legacy =
    sp.has("siteId") ||
    (rawOrg !== null && org === null) ||
    (rawSite !== null && asUuid(rawSite) === null);
  return { org, site, legacy };
}

export interface SiteRow {
  id: string;
  organization_id: string | null;
}

export type SiteLookup = SiteRow | "not_found" | "forbidden" | null;

export type DecideStatus =
  | "ok"
  | "unselected"
  | "rejected"
  | "site_mismatch"
  | "not_found"
  | "forbidden"
  | "loading";

export interface DecideInput {
  viewer: "staff" | "client";
  /** ① session 綁定客戶（客戶帳號的 x-ops-org-id）。 */
  sessionOrg: string | null;
  /** ② 主機綁定客戶（白牌；今天恆 null）。 */
  hostOrg: string | null;
  internalOrgId: string | null;
  query: { org: string | null; site: string | null };
  /** 該客戶的網站列；null＝尚未載入。 */
  sites: readonly SiteRow[] | null;
  /** 只給 site 或 site 不在 sites 時查回的那一列；null＝尚未查。 */
  siteLookup: SiteLookup;
  layer: Layer;
}

export interface DecideResult {
  status: DecideStatus;
  orgId: string | null;
  siteId: string | null;
  /** 網址應改成的 {org, site}；null＝不用改。 */
  rewrite: { org: string | null; site: string | null } | null;
}

function result(
  status: DecideStatus,
  orgId: string | null,
  siteId: string | null,
  query: DecideInput["query"],
  target: { org: string | null; site: string | null } | null,
): DecideResult {
  const rewrite =
    target && (target.org !== query.org || target.site !== query.site) ? target : null;
  return { status, orgId, siteId, rewrite };
}

export function decide(input: DecideInput): DecideResult {
  const { viewer, sessionOrg, hostOrg, query, sites, siteLookup, layer } = input;

  // ① 與 ② 並存且不同 → 拒絕，不顯示任何資料，不取高者。
  if (sessionOrg && hostOrg && sessionOrg !== hostOrg) {
    return { status: "rejected", orgId: null, siteId: null, rewrite: null };
  }

  const bound = sessionOrg ?? hostOrg;

  if (!bound && viewer === "client") {
    return { status: "rejected", orgId: null, siteId: null, rewrite: null };
  }

  if (bound) {
    // org 恆為綁定客戶；網址上他人的 org／site 一律移除，不查名、不報錯。
    const orgInUrl = query.org === bound ? bound : null;
    let siteId: string | null = null;
    if (query.site) {
      if (sites) {
        siteId = sites.some((s) => s.id === query.site) ? query.site : null;
      } else if (siteLookup && siteLookup !== "not_found" && siteLookup !== "forbidden") {
        siteId = siteLookup.id === query.site && siteLookup.organization_id === bound ? query.site : null;
      } else if (siteLookup === "not_found" || siteLookup === "forbidden") {
        siteId = null;
      } else if (layer === "site") {
        return { status: "loading", orgId: bound, siteId: null, rewrite: null };
      }
    }
    if (layer === "site" && !siteId) {
      if (!sites) {
        return { status: "loading", orgId: bound, siteId: null, rewrite: null };
      }
      if (sites.length === 1) {
        const only = sites[0].id;
        return result("ok", bound, only, query, { org: orgInUrl ?? bound, site: only });
      }
      return result("unselected", bound, null, query, { org: orgInUrl, site: null });
    }
    return result("ok", bound, siteId, query, { org: orgInUrl, site: siteId });
  }

  // 員工、只有網址（③）。
  let orgId = query.org;

  if (!orgId) {
    if (!query.site) {
      // 空 org＝未選；永不回 internalOrgId。
      return { status: "unselected", orgId: null, siteId: null, rewrite: null };
    }
    // 只給 site → 由 site.organization_id 推 org。
    if (siteLookup === null) return { status: "loading", orgId: null, siteId: null, rewrite: null };
    if (siteLookup === "not_found" || siteLookup === "forbidden") {
      return { status: siteLookup, orgId: null, siteId: null, rewrite: null };
    }
    if (siteLookup.id !== query.site || !siteLookup.organization_id) {
      return { status: "not_found", orgId: null, siteId: null, rewrite: null };
    }
    orgId = siteLookup.organization_id;
    return result("ok", orgId, siteLookup.id, query, { org: orgId, site: siteLookup.id });
  }

  if (query.site) {
    if (!sites) return { status: "loading", orgId, siteId: null, rewrite: null };
    if (sites.some((s) => s.id === query.site)) {
      return result("ok", orgId, query.site, query, { org: orgId, site: query.site });
    }
    // 不在該客戶的網站裡：由 siteLookup 決定原因；永不退回第一個。
    if (siteLookup === null) return { status: "loading", orgId, siteId: null, rewrite: null };
    if (siteLookup === "not_found" || siteLookup === "forbidden") {
      return { status: siteLookup, orgId, siteId: null, rewrite: null };
    }
    if (siteLookup.organization_id === orgId && siteLookup.id === query.site) {
      return result("ok", orgId, query.site, query, { org: orgId, site: query.site });
    }
    return { status: "site_mismatch", orgId, siteId: null, rewrite: null };
  }

  if (layer === "site") {
    if (!sites) return { status: "loading", orgId, siteId: null, rewrite: null };
    if (sites.length === 1) {
      const only = sites[0].id;
      return result("ok", orgId, only, query, { org: orgId, site: only });
    }
    return { status: "unselected", orgId, siteId: null, rewrite: null };
  }

  return { status: "ok", orgId, siteId: null, rewrite: null };
}

/**
 * 在 href 上加或換 org、site，保留其餘 query 與 hash。
 * 值為 string＝設定；null＝刪除；undefined＝不動。絕對與相對網址皆可。
 */
export function withContext(
  href: string,
  ctx: { org?: string | null; site?: string | null },
): string {
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const noHash = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const qAt = noHash.indexOf("?");
  const base = qAt >= 0 ? noHash.slice(0, qAt) : noHash;
  const rawQuery = qAt >= 0 ? noHash.slice(qAt + 1) : "";

  const wanted: Array<[string, string | null | undefined]> = [
    [PARAM.org, ctx.org],
    [PARAM.site, ctx.site],
  ];
  const parts = rawQuery === "" ? [] : rawQuery.split("&");
  const done = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    const name = decodeURIComponent((eq >= 0 ? part.slice(0, eq) : part).replace(/\+/g, " "));
    const hit = wanted.find(([n]) => n === name);
    if (!hit) {
      out.push(part);
      continue;
    }
    const [, value] = hit;
    if (value === undefined) {
      out.push(part);
    } else if (value !== null && !done.has(name)) {
      out.push(`${name}=${encodeURIComponent(value)}`);
      done.add(name);
    }
    // 重複的同名參數只留第一個；null＝全刪。
    if (value === undefined) done.add(name);
  }
  for (const [name, value] of wanted) {
    if (typeof value === "string" && !done.has(name)) {
      out.push(`${name}=${encodeURIComponent(value)}`);
    }
  }
  return base + (out.length ? `?${out.join("&")}` : "") + hash;
}
