// Every way a person reaches a brand's FluentCRM, one row each, so one look at a contact's tags names the channel
// (operator 2026-11-04). Tags: "來源：<label>" always, plus "表單：<name>" when the channel has a form. FluentCRM tags only
// add, so a person met through two channels carries both. New channel = new row + its consent_source prefix.
// Campaign / ad ids stay in co_leads for reports, not in FluentCRM (one tag per ad would flood the tag list).
export const CHANNELS = {
  meta_lead_ad: { label: "Meta 名單廣告", consentPrefixes: ["meta_lead_ad", "meta_lead_ad_csv"] },
  // co_leads is the prospecting table: a lead that did not come from a channel above was found and mailed by us.
  cold_outreach: { label: "冷信開發", consentPrefixes: [] },
} as const satisfies Record<string, { label: string; consentPrefixes: readonly string[] }>;

export type Channel = keyof typeof CHANNELS;

// FluentCRM's fc_tags.slug is varchar(192) and the plugin slugs a title with sanitize_title, which percent-encodes
// non-ASCII like encodeURIComponent (a CJK character = 9 bytes): a form tag is cut, by whole characters, to fit.
const SLUG_MAX = 192;
// A lone surrogate (valid JSON, e.g. from a CSV) makes encodeURIComponent throw: dropped.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** consent_source is "<prefix>:<detail>" (warm-leads.ts callers); the prefix picks the channel, unknown = null. */
export function channelOfConsentSource(source: string | null | undefined): Channel | null {
  const prefix = (source ?? "").split(":", 1)[0];
  if (!prefix) return null;
  for (const [key, c] of Object.entries(CHANNELS) as Array<[Channel, (typeof CHANNELS)[Channel]]>) {
    if ((c.consentPrefixes as readonly string[]).includes(prefix)) return key;
  }
  return null;
}

export function channelTags(channel: Channel, form?: string | null): string[] {
  const tags = [`來源：${CHANNELS[channel].label}`];
  let f = "";
  for (const ch of Array.from((form ?? "").replace(LONE_SURROGATE, "").trim())) {
    if (encodeURIComponent(`表單：${f}${ch}`).length > SLUG_MAX) break;
    f += ch;
  }
  if (f.trim()) tags.push(`表單：${f.trim()}`);
  return tags;
}
