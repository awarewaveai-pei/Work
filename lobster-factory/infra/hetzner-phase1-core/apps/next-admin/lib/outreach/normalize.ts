// Cold Outreach — lead normalization + dedup + suppression matching (task T5). Pure + testable.

export interface RawLead {
  name?: string | null;
  email?: string | null;
  website?: string | null;
  social_url?: string | null;
  industry?: string | null;
  phone?: string | null;
  region?: string | null;
  source_type?: string | null;
  source_url?: string | null;
  observation?: string | null;
  contact_name?: string | null;
  contact_role?: string | null;
}

export interface NormalizedLead {
  normalized_name: string | null;
  email: string | null;
  website: string | null;
  social_url: string | null;
  normalized_industry: string | null;
  phone: string | null;
  region: string | null;
  source_type: string | null;
  source_url: string | null;
  observation: string | null;
  contact_name: string | null;
  contact_role: string | null;
}

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

/** Extract a bare hostname (no protocol, no www, no path) for dedup/suppression by domain. */
export function domainOf(urlOrEmail: string | null): string | null {
  if (!urlOrEmail) return null;
  const v = urlOrEmail.trim().toLowerCase();
  if (v.includes("@")) {
    const d = v.split("@")[1];
    return d ? d.replace(/^www\./, "") : null;
  }
  const m = v.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const host = m.split("/")[0];
  return host || null;
}

/** Social networks, link pages and marketplaces: a page there is the platform's, not the business's own site, and
 *  SPEC D20 forbids reading social pages at all. A lead whose website is one of these is not researched, and its host
 *  is shared by thousands of businesses, so it never identifies one (dedupKey, existing-leads.ts). */
export const PLATFORM_HOSTS = ["facebook.com", "fb.com", "instagram.com", "threads.net", "linkedin.com", "x.com", "twitter.com", "tiktok.com",
  "youtube.com", "line.me", "lin.ee", "linktr.ee", "portaly.cc", "shopee.tw", "shopee.com", "pinkoi.com", "momoshop.com.tw",
  "ruten.com.tw", "pchome.com.tw", "google.com", "goo.gl", "g.page", "maps.app.goo.gl", "sites.google.com",
  // What an Instagram profile links instead of a site (live 2026-11-01, 8 Taichung studios: none linked their own):
  // forms, short links and link-in-bio pages.
  "forms.gle", "bit.ly", "tinyurl.com", "reurl.cc", "ppt.cc", "lihi.cc", "lihi1.com", "lihi2.com", "beacons.ai", "lit.link", "linkin.bio",
  "taplink.cc", "bio.site", "msha.ke", "carrd.co"];

export function isPlatformHost(host: string): boolean {
  return PLATFORM_HOSTS.some((p) => host === p || host.endsWith(`.${p}`));
}

/** The website host that identifies one business: null for none or a platform host. */
export function ownHostOf(website: string | null): string | null {
  const host = domainOf(website)?.split(":")[0] ?? null;
  return host && !isPlatformHost(host) ? host : null;
}

export function normalizeLead(raw: RawLead): NormalizedLead {
  const email = clean(raw.email)?.toLowerCase() ?? null;
  return {
    normalized_name: clean(raw.name),
    email,
    website: clean(raw.website),
    social_url: clean(raw.social_url),
    normalized_industry: clean(raw.industry)?.toLowerCase() ?? null,
    phone: clean(raw.phone),
    region: clean(raw.region),
    source_type: clean(raw.source_type),
    source_url: clean(raw.source_url),
    observation: clean(raw.observation),
    contact_name: clean(raw.contact_name),
    contact_role: clean(raw.contact_role),
  };
}

/**
 * Stable dedup key, in priority order: email > website domain (not a platform's) > lowercased name.
 * Returns null when there's nothing to dedup on (caller treats as always-unique).
 */
export function dedupKey(n: NormalizedLead): string | null {
  if (n.email) return `email:${n.email}`;
  const dom = ownHostOf(n.website);
  if (dom) return `domain:${dom}`;
  if (n.normalized_name) return `name:${n.normalized_name.toLowerCase()}`;
  return null;
}

export interface SuppressionRow {
  email?: string | null;
  domain?: string | null;
  company_name?: string | null;
  scope?: string | null; // email | domain | company | campaign | global
}

/** Who a suppression row is matched against: an address, a site, a company name. */
export interface SuppressionSubject { email?: string | null; website?: string | null; name?: string | null }

const fold = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim().toLowerCase() : null);

/** True when this lead must NOT be contacted per the suppression list. Both sides are folded here: callers store and
 *  pass mixed case (co_leads.email is only trimmed on manual entry), so a match may never depend on who lowercased. */
export function isSuppressed(n: SuppressionSubject, rows: SuppressionRow[]): boolean {
  const email = fold(n.email);
  const dom = domainOf(email) ?? domainOf(n.website ?? null);
  const name = fold(n.name);
  for (const r of rows) {
    if (r.scope === "global") return true;
    if (email && fold(r.email) === email) return true;
    if (dom && fold(r.domain)?.replace(/^www\./, "") === dom) return true;
    if (r.scope === "company" && name && fold(r.company_name) === name) return true;
  }
  return false;
}

/** Mark duplicates within a freshly-imported batch (first occurrence kept). */
export function flagDuplicatesInBatch(batch: NormalizedLead[]): boolean[] {
  const seen = new Set<string>();
  return batch.map((n) => {
    const k = dedupKey(n);
    if (!k) return false; // nothing to dedup on → treat as unique
    if (seen.has(k)) return true;
    seen.add(k);
    return false;
  });
}
