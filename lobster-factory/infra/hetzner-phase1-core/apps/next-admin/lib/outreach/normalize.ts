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
 * Stable dedup key, in priority order: email > website domain > lowercased name.
 * Returns null when there's nothing to dedup on (caller treats as always-unique).
 */
export function dedupKey(n: NormalizedLead): string | null {
  if (n.email) return `email:${n.email}`;
  const dom = domainOf(n.website);
  if (dom) return `domain:${dom}`;
  if (n.normalized_name) return `name:${n.normalized_name.toLowerCase()}`;
  return null;
}

export interface SuppressionRow {
  email?: string | null;
  domain?: string | null;
  scope?: string | null; // email | domain | company | campaign | global
}

/** True when this lead must NOT be contacted per the suppression list. */
export function isSuppressed(n: NormalizedLead, rows: SuppressionRow[]): boolean {
  const email = n.email;
  const dom = domainOf(n.email) ?? domainOf(n.website);
  for (const r of rows) {
    if (r.scope === "global") return true;
    if (email && r.email && r.email.trim().toLowerCase() === email) return true;
    if (dom && r.domain && r.domain.trim().toLowerCase().replace(/^www\./, "") === dom) return true;
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
