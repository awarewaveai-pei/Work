"use client";

// 外框掛一次（K5）。讀網址 org／site（useSearchParams，reactive），抓目前客戶的網站清單一次、全頁共用，
// 用 contract.ts 的 decide() 算狀態，必要時改寫網址。規則正本 ADR 020；不得 import lib/portal/hosts（主機由 prop 傳入）。
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ORG_DEPENDENT_PARAMS,
  PARAM,
  decide,
  normalizeQuery,
  type Layer,
  type SiteLookup,
} from "@/lib/client-context/contract";
import { ClientContext, type ClientContextValue, type ContextSite } from "@/lib/client-context/use-client-context";

export interface ClientContextProviderProps {
  /** ① 客戶帳號的單位（x-ops-org-id）；員工＝null。 */
  sessionOrg: string | null;
  /** ② 白牌主機綁定的客戶；今天恆 null。 */
  hostOrg: string | null;
  internalOrgId: string | null;
  hosts: Readonly<Record<string, string>>;
  onDoor: boolean;
  children: ReactNode;
}

type Fetched = { org: string; rows: ContextSite[] } | null;

async function getSites(qs: string): Promise<{ status: number; rows: ContextSite[] }> {
  const res = await fetch(`/api/content/sites?${qs}`);
  if (!res.ok) return { status: res.status, rows: [] };
  const json = (await res.json()) as { ok?: boolean; sites?: ContextSite[] };
  return { status: res.status, rows: json.sites ?? [] };
}

export function ClientContextProvider({ sessionOrg, hostOrg, internalOrgId, hosts, onDoor, children }: ClientContextProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const spKey = sp.toString();
  const query = useMemo(() => normalizeQuery(new URLSearchParams(spKey)), [spKey]);
  const viewer: "staff" | "client" = sessionOrg ? "client" : "staff";

  const [layers, setLayers] = useState<Layer[]>([]);
  const layer: Layer | null = layers.includes("site") ? "site" : layers.includes("org") ? "org" : null;
  const register = useCallback((l: Layer) => {
    setLayers((xs) => [...xs, l]);
    return () => setLayers((xs) => {
      const i = xs.indexOf(l);
      return i < 0 ? xs : [...xs.slice(0, i), ...xs.slice(i + 1)];
    });
  }, []);

  // 網站清單：每個客戶只抓一次，全頁共用。
  const sitesOrg = sessionOrg ?? hostOrg ?? query.org;
  const [fetched, setFetched] = useState<Fetched>(null);
  const cache = useRef(new Map<string, ContextSite[]>());
  useEffect(() => {
    if (!layer || !sitesOrg) return;
    const hit = cache.current.get(sitesOrg);
    if (hit) { setFetched({ org: sitesOrg, rows: hit }); return; }
    let live = true;
    getSites(new URLSearchParams({ organizationId: sitesOrg }).toString())
      .then(({ rows }) => {
        cache.current.set(sitesOrg, rows);
        if (live) setFetched({ org: sitesOrg, rows });
      })
      .catch(() => { if (live) setFetched({ org: sitesOrg, rows: [] }); });
    return () => { live = false; };
  }, [layer, sitesOrg]);
  const sites = fetched && fetched.org === sitesOrg ? fetched.rows : null;

  // 只給 site、或 site 不在該客戶清單：查那一站。
  const needLookup = Boolean(layer && query.site && (!sitesOrg || (sites && !sites.some((s) => s.id === query.site))));
  const [lookup, setLookup] = useState<{ site: string; value: SiteLookup } | null>(null);
  useEffect(() => {
    if (!needLookup || !query.site) return;
    const site = query.site;
    let live = true;
    getSites(new URLSearchParams({ siteId: site }).toString())
      .then(({ status, rows }) => {
        const value: SiteLookup = status === 403 ? "forbidden" : rows[0] ?? "not_found";
        if (live) setLookup({ site, value });
      })
      .catch(() => { if (live) setLookup({ site, value: "not_found" }); });
    return () => { live = false; };
  }, [needLookup, query.site]);
  const siteLookup: SiteLookup = lookup && lookup.site === query.site ? lookup.value : null;

  const decided = decide({
    viewer,
    sessionOrg,
    hostOrg,
    internalOrgId,
    query: { org: query.org, site: query.site },
    sites,
    siteLookup,
    layer: layer ?? "org",
  });

  const replaceQuery = useCallback((edit: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(spKey);
    edit(params);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [spKey, pathname, router]);

  // 網址改寫：只在本頁有登記時做（未登記的頁不碰網址）。
  const rewrite = decided.rewrite;
  const needsRewrite = Boolean(layer && (rewrite || query.legacy));
  const targetOrg = rewrite ? rewrite.org : query.org;
  const targetSite = rewrite ? rewrite.site : query.site;
  const rewroteFor = useRef<string | null>(null);   // 同一個網址只改寫一次（等 router 換網址期間不重送）
  useEffect(() => {
    const key = `${spKey}|${targetOrg}|${targetSite}`;
    if (!needsRewrite || rewroteFor.current === key) return;
    rewroteFor.current = key;
    replaceQuery((p) => {
      p.delete("siteId");
      if (targetOrg) p.set(PARAM.org, targetOrg); else p.delete(PARAM.org);
      if (targetSite) p.set(PARAM.site, targetSite); else p.delete(PARAM.site);
    });
  }, [needsRewrite, spKey, targetOrg, targetSite, replaceQuery]);

  const setOrg = useCallback((org: string | null) => {
    replaceQuery((p) => {
      for (const k of ORG_DEPENDENT_PARAMS) p.delete(k);
      p.delete("siteId");
      if (org) p.set(PARAM.org, org); else p.delete(PARAM.org);
    });
  }, [replaceQuery]);

  const setSite = useCallback((site: string | null) => {
    replaceQuery((p) => {
      p.delete("siteId");
      if (site) p.set(PARAM.site, site); else p.delete(PARAM.site);
    });
  }, [replaceQuery]);

  const value: ClientContextValue = {
    viewer,
    layer,
    status: decided.status,
    org: decided.orgId,
    site: decided.siteId,
    sites,
    internalOrgId,
    onDoor,
    hosts,
    setOrg,
    setSite,
    register,
  };

  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}
