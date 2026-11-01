// Cold Outreach v2 -- research a lead's social profile (SPEC D20, card C17): about half the businesses a map search
// finds use an Instagram or Facebook page as their website, and research of the own site alone left them without facts
// or an address. A ladder, cheapest and safest first; the first layer that gives a profile or an address ends it:
//
//  1. meta_discovery (Instagram only, free): Graph API Business Discovery asked from our page's linked IG account.
//     GET /v21.0/me?fields=instagram_business_account -> {instagram_business_account:{id}}; then
//     GET /v21.0/{ig}?fields=business_discovery.username(h){username,name,biography,website,media.limit(5){caption,permalink}}
//     -> {business_discovery:{...}} -- confirmed live 2026-11-01 (_coffeehere_: bio with address, hours, closing days).
//     A personal account is not discoverable: Graph answers an error (code 110 / 100), read as "nothing here".
//  2. serper (both, ~US$0.001): POST /search {q: site:<host> "<handle>"}; a result whose link is this profile gives
//     the addresses in its title and snippet. Never evidence: a snippet is Google's excerpt, not the page.
//  3. apify_instagram / apify_facebook (US$0.0026 / 0.0066 per profile, list price): an actor reads the public page
//     without logging in, on Apify's machines -- never our Meta app, accounts or host. Credits are held before the call
//     (Grant.hold) and kept when it answers. Output shapes NOT yet confirmed live; parsed defensively below.
//
// An address written in the business's own profile is one it declared as its contact (FoundEmail.mailto); the profile
// text becomes documents for sink/outreach-research, which keeps only facts whose excerpt is in that text.
import { createHash } from "node:crypto";
import type { ProviderCall } from "@/lib/collect/net/providers";
import { ProviderCallError } from "@/lib/collect/net/providers";
import { COLLECTED_PROVENANCE, screenForInjection } from "@/lib/collect/provenance";
import type { RawDoc } from "@/lib/collect/types";
import type { Grant } from "@/lib/entitlements/can";
import { holdCost } from "@/lib/ai/log-ai-call";
import { creditsForCost } from "@/lib/entitlements/ledger";
import { isPlatformHost } from "./normalize";
import { hostOf, pageEmailsOf, type FoundEmail } from "./research-extract";

export type SocialPlatform = "instagram" | "facebook";
export type SocialLayer = "meta_discovery" | "serper" | "apify_instagram" | "apify_facebook";
export interface SocialTarget { platform: SocialPlatform; handle: string; url: string }

const GRAPH = "/v21.0";
/** Apify list prices per profile (store pages, 2026-11-01); the ceiling of one lead is the Facebook one. */
export const APIFY_USD: Record<SocialPlatform, number> = { instagram: 0.0026, facebook: 0.0066 };
const SERPER_USD = 0.001;
const MAX_POSTS = 5;
const MIN_POST_CHARS = 20;
/** A post older than this states hours, prices and holidays that have moved on (live 2026-11-01: a January post's
 *  13:00-00:00 next to June's 13:00-01:00, both approved). The profile itself is current by definition. */
export const MAX_POST_AGE_DAYS = 180;

// Not profiles: Instagram and Facebook paths that name a post, a feature or a directory.
const IG_RESERVED = new Set(["p", "reel", "reels", "explore", "stories", "tv", "accounts", "direct", "about", "legal", "developer"]);
const FB_RESERVED = new Set(["share", "sharer", "groups", "events", "watch", "marketplace", "photo", "photos", "story.php", "permalink.php",
  "login", "help", "policies", "pages", "people", "hashtag", "reel", "videos", "plugins", "dialog", "l.php"]);
const HANDLE_RE = /^[A-Za-z0-9._-]{1,50}$/;

/** The Instagram or Facebook profile a URL names, or null (another platform, a post, a share link). */
export function socialTarget(raw: string | null | undefined): SocialTarget | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|web)\./, "");
  const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
  if (host === "instagram.com") {
    const h = seg.toLowerCase();
    if (!h || IG_RESERVED.has(h) || !/^[a-z0-9._]{1,30}$/.test(h)) return null;
    return { platform: "instagram", handle: h, url: `https://www.instagram.com/${h}/` };
  }
  if (host === "facebook.com" || host === "fb.com") {
    if (seg === "profile.php") {
      const id = u.searchParams.get("id") ?? "";
      return /^\d{5,25}$/.test(id) ? { platform: "facebook", handle: id, url: `https://www.facebook.com/profile.php?id=${id}` } : null;
    }
    if (!seg || FB_RESERVED.has(seg.toLowerCase()) || !HANDLE_RE.test(seg)) return null;
    return { platform: "facebook", handle: seg, url: `https://www.facebook.com/${seg}` };
  }
  return null;
}

export interface SocialProfile {
  layer: SocialLayer;
  url: string;
  name: string | null;
  bio: string | null;
  website: string | null;
  phone: string | null;
  /** Contact addresses the platform shows as fields (Facebook page email, Instagram business email). */
  contactEmails: string[];
  posts: Array<{ text: string; url: string; at: string | null }>;
}

export interface LayerResult { layer: SocialLayer; result: "found" | "empty" | "skipped" | "error"; detail?: string }

export interface SocialOutcome {
  target: SocialTarget;
  profile: SocialProfile | null;
  emails: FoundEmail[];
  /** Documents for sink/outreach-research; an injection-suspect one is left out (and counted in `quarantined`). */
  docs: RawDoc[];
  quarantined: number;
  layers: LayerResult[];
  costUsd: number;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const kind = (e: unknown) => (e instanceof ProviderCallError ? e.kind : "error");

/** Graph answers "this is not a business account" or "no such user" as an error: the profile is simply not here. */
const NOT_DISCOVERABLE = new Set([100, 110]);

// The page's own IG account id, asked once per process: it changes only if someone relinks the page.
let igIdOnce: Promise<string | null> | null = null;
async function ourIgId(call: ProviderCall): Promise<string | null> {
  igIdOnce ??= (async () => {
    const res = await call("meta_discovery", { method: "GET", path: `${GRAPH}/me?fields=instagram_business_account` });
    const j = (await res.json()) as { instagram_business_account?: { id?: string } };
    return str(j.instagram_business_account?.id);
  })().catch((e) => { igIdOnce = null; throw e; });
  return igIdOnce;
}
/** Test seam: forget the cached account id. */
export const resetSocialCache = () => { igIdOnce = null; };

async function metaDiscovery(call: ProviderCall, t: SocialTarget): Promise<SocialProfile | null> {
  const ig = await ourIgId(call);
  if (!ig) throw new ProviderCallError("meta_discovery_no_linked_ig_account", "unconfigured");
  const fields = `business_discovery.username(${t.handle}){username,name,biography,website,media.limit(${MAX_POSTS}){caption,permalink,timestamp}}`;
  let res: Response;
  try {
    res = await call("meta_discovery", { method: "GET", path: `${GRAPH}/${ig}?fields=${encodeURIComponent(fields)}` });
  } catch (e) {
    // Graph answers 400 for a personal or unknown account; only that status is "nothing here", any other is an error.
    if (e instanceof ProviderCallError && e.status === 400) return null;
    throw e;
  }
  const j = (await res.json()) as { business_discovery?: Record<string, unknown>; error?: { code?: number } };
  if (j.error) { if (NOT_DISCOVERABLE.has(Number(j.error.code))) return null; throw new Error(`graph_error_${j.error.code}`); }
  const b = j.business_discovery;
  if (!b) return null;
  const media = ((b.media as { data?: unknown[] } | undefined)?.data ?? []) as Array<Record<string, unknown>>;
  return {
    layer: "meta_discovery", url: t.url, name: str(b.name), bio: str(b.biography), website: str(b.website), phone: null, contactEmails: [],
    posts: media.flatMap((m) => { const text = str(m.caption); const url = str(m.permalink); return text && url ? [{ text, url, at: str(m.timestamp) }] : []; }),
  };
}

async function serperSnippets(call: ProviderCall, t: SocialTarget): Promise<FoundEmail[]> {
  const host = t.platform === "instagram" ? "instagram.com" : "facebook.com";
  const res = await call("serper", { path: "/search", body: { q: `site:${host} "${t.handle}"`, num: 5, gl: "tw", hl: "zh-tw" } });
  const j = (await res.json()) as { organic?: Array<{ link?: unknown; title?: unknown; snippet?: unknown }> };
  const out: FoundEmail[] = [];
  for (const r of j.organic ?? []) {
    const link = str(r.link);
    if (!link || socialTarget(link)?.handle.toLowerCase() !== t.handle.toLowerCase()) continue;
    const text = [str(r.title), str(r.snippet)].filter(Boolean).join("\n");
    for (const f of pageEmailsOf({ html: null, text, url: t.url }, null)) {
      if (!out.some((o) => o.email === f.email)) out.push({ ...f, mailto: true });
    }
  }
  return out;
}

const APIFY_PATH: Record<SocialPlatform, string> = {
  instagram: "/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items",
  facebook: "/v2/acts/apify~facebook-pages-scraper/run-sync-get-dataset-items",
};

/** First dataset item of an actor run, as a profile. Field names vary between actor versions: every one optional. */
export function apifyProfile(platform: SocialPlatform, t: SocialTarget, items: unknown): SocialProfile | null {
  const it = (Array.isArray(items) ? items[0] : null) as Record<string, unknown> | null;
  if (!it || typeof it !== "object") return null;
  const list = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).flatMap((x) => (typeof x === "string" && x.trim() ? [x.trim()] : []));
  if (platform === "instagram") {
    const posts = ((Array.isArray(it.latestPosts) ? it.latestPosts : []) as Array<Record<string, unknown>>).slice(0, MAX_POSTS)
      .flatMap((p) => { const text = str(p.caption); const url = str(p.url); return text && url ? [{ text, url, at: str(p.timestamp) }] : []; });
    const profile: SocialProfile = { layer: "apify_instagram", url: t.url, name: str(it.fullName), bio: str(it.biography),
      website: str(it.externalUrl), phone: str(it.businessPhoneNumber), contactEmails: list([it.businessEmail, it.publicEmail]), posts };
    return profile.name || profile.bio || profile.website ? profile : null;
  }
  const info = list(it.info).join("\n") || null;
  const profile: SocialProfile = { layer: "apify_facebook", url: t.url, name: str(it.title) ?? str(it.name),
    bio: [str(it.intro), str(it.about), info].filter(Boolean).join("\n") || null, website: list(it.websites)[0] ?? str(it.website),
    phone: str(it.phone), contactEmails: list([it.email, it.emails].flat()), posts: [] };
  return profile.name || profile.bio || profile.website ? profile : null;
}

async function apify(call: ProviderCall, grant: Grant, t: SocialTarget): Promise<{ profile: SocialProfile | null; costUsd: number } | "no_credits"> {
  const usd = APIFY_USD[t.platform];
  const hold = await holdCost(grant, usd);
  if (!hold) return "no_credits";
  const body = t.platform === "instagram" ? { usernames: [t.handle] } : { startUrls: [{ url: t.url }] };
  let delivered = false;
  try {
    const res = await call(t.platform === "instagram" ? "apify_instagram" : "apify_facebook", { path: `${APIFY_PATH[t.platform]}?timeout=90`, body });
    delivered = true;
    return { profile: apifyProfile(t.platform, t, await res.json()), costUsd: usd };
  } finally {
    // The actor ran (and was paid) once it answered, profile or not; a refused or failed call costs nothing.
    await hold.settle(delivered ? creditsForCost(usd) : 0, { provider: t.platform === "instagram" ? "apify_instagram" : "apify_facebook" })
      .catch((e) => console.warn(`[social-research] settle failed: ${String(e).slice(0, 200)}`));
  }
}

// A post is an announcement of its day (hours, a holiday, a price): two recent posts can disagree (live 2026-11-01: May's
// 13:00-00:00 and June's 13:00-01:00). Its facts always wait for a person (meta.reviewOnly, sink/outreach-research);
// the profile is current by definition and follows the ordinary auto-approve rule.
function docOf(url: string, title: string | null, text: string, collector: string, tenantRef: string, publishedAt: string | null = null,
  reviewOnly = false): RawDoc {
  return {
    uri: url, canonicalUrl: url, contentHash: createHash("sha256").update(text, "utf8").digest("hex"), mime: "text/plain", title,
    author: null, contentType: "social_profile", text, raw: null, fetchedAt: new Date().toISOString(), publishedAt, collector, tenantRef,
    provenance: { ...COLLECTED_PROVENANCE }, meta: reviewOnly ? { reviewOnly: true } : {},
  };
}

/** The profile's emails (fields first, then the bio), each declared by the business on its own profile. Own = on the
 *  domain of the website the profile links, when that is not itself a platform. */
export function profileEmails(p: SocialProfile): FoundEmail[] {
  const site = hostOf(p.website && /^https?:\/\//i.test(p.website) ? p.website : p.website ? `https://${p.website}` : null);
  const siteHost = site && !isPlatformHost(site) ? site : null;
  const text = [...p.contactEmails, p.bio ?? ""].join("\n");
  return pageEmailsOf({ html: null, text, url: p.url }, siteHost).map((f) => ({ ...f, mailto: true }));
}

/** A post's date as ISO, or null when it has none or it does not parse. */
const isoOf = (v: string | null): string | null => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? new Date(t).toISOString() : null; };

export function profileDocs(p: SocialProfile, tenantRef: string, now = Date.now()): { docs: RawDoc[]; quarantined: number } {
  const collector = `social/${p.layer}`;
  // An undated post is kept: its date is unknown, not old. Dated ones carry it to the evidence (source_date).
  const fresh = (at: string | null) => !at || now - Date.parse(at) <= MAX_POST_AGE_DAYS * 86_400_000;
  const candidates = [
    docOf(p.url, p.name, [p.name, p.bio, p.website, p.phone].filter(Boolean).join("\n"), collector, tenantRef),
    ...p.posts.map((x) => ({ ...x, at: isoOf(x.at) }))
      .filter((x) => x.text.length >= MIN_POST_CHARS && /^https:\/\//.test(x.url) && fresh(x.at))
      .map((x) => docOf(x.url, p.name, x.text, collector, tenantRef, x.at, true)),
  ].filter((d) => d.text.trim().length > 0);
  const docs = candidates.filter((d) => screenForInjection(d.text).clean);
  return { docs, quarantined: candidates.length - docs.length };
}

/** Walk the ladder for one profile. A layer that is not configured, or fails, is recorded and the next one tried. */
export async function socialResearch(call: ProviderCall, grant: Grant, t: SocialTarget, tenantRef: string): Promise<SocialOutcome> {
  const layers: LayerResult[] = [];
  let costUsd = 0;
  const done = (profile: SocialProfile | null, emails: FoundEmail[]): SocialOutcome => {
    const { docs, quarantined } = profile ? profileDocs(profile, tenantRef) : { docs: [], quarantined: 0 };
    return { target: t, profile, emails, docs, quarantined, layers, costUsd };
  };

  if (t.platform === "instagram") {
    try {
      const p = await metaDiscovery(call, t);
      layers.push({ layer: "meta_discovery", result: p ? "found" : "empty" });
      if (p) return done(p, profileEmails(p));
    } catch (e) {
      layers.push({ layer: "meta_discovery", result: kind(e) === "unconfigured" ? "skipped" : "error", detail: String(e instanceof Error ? e.message : e).slice(0, 160) });
    }
  }

  try {
    const emails = await serperSnippets(call, t);
    costUsd += SERPER_USD;
    layers.push({ layer: "serper", result: emails.length ? "found" : "empty" });
    if (emails.length) return done(null, emails);
  } catch (e) {
    layers.push({ layer: "serper", result: kind(e) === "unconfigured" ? "skipped" : "error", detail: String(e instanceof Error ? e.message : e).slice(0, 160) });
  }

  const layer: SocialLayer = t.platform === "instagram" ? "apify_instagram" : "apify_facebook";
  try {
    const r = await apify(call, grant, t);
    if (r === "no_credits") { layers.push({ layer, result: "skipped", detail: "no_credits" }); return done(null, []); }
    costUsd += r.costUsd;
    layers.push({ layer, result: r.profile ? "found" : "empty" });
    return done(r.profile, r.profile ? profileEmails(r.profile) : []);
  } catch (e) {
    layers.push({ layer, result: kind(e) === "unconfigured" ? "skipped" : "error", detail: String(e instanceof Error ? e.message : e).slice(0, 160) });
    return done(null, []);
  }
}
