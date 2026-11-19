// Weekly member newsletter (N10, NEXT-PHASE-PLAN-20261119 §8 batch 3, O3): once a week, the topics each site published in
// the last brand week (Monday-Sunday, organizations.default_timezone) become ONE email in that site's own FluentCRM, as a
// DRAFT. A person reads it and presses send in FluentCRM; nothing here sends or schedules (createNewsletter, fluentcrm.ts).
// Invariants:
//  M1 draft only: every campaign goes through createNewsletter, which sends the constant draft status and fails on any
//     other answer; a non-draft answer here is thrown (recorded + incident), never reported as ready;
//  M2 one draft per site per brand week: the week is claimed in the DB (wp_sites.member_newsletter_week, 0172) BEFORE the
//     bridge call; a firing that loses the claim does nothing; a failed call after the claim waits for next week;
//  M3 a week with nothing published claims nothing and calls nothing;
//  M4 a site without a bridge, without FluentCRM, or whose bridge does not answer is skipped with the reason in the summary
//     -- not a failure, so the sweep raises no incident and the weekly schedule does not retry it; a skip after the claim
//     (anything but "no FluentCRM") raises one notice for that site and week, since that week is not tried again;
//     a week whose firing never ran at all is not caught up (the next firing takes the next last week);
//  M5 a draft made = one business notice (Telegram) per site and week: 「會員信草稿已備好」, never an error.
// Everything outside the decisions is injected (MemberNewsletterDeps), so tests need no DB and no bridge.
import type { SupabaseClient } from "@supabase/supabase-js";
import { requiredBlocks, type SiteContentDefaults } from "@/lib/content/brand-voice";
import { orgTimeZone } from "@/lib/content/topics/store";
import { bridgeClientForSite, type BridgeResult } from "@/lib/payments/woo";
import { addDays, instantAt, weekday, zoned } from "@/lib/social/time";
import { raiseNotice, type Notice } from "@/lib/schedules/stop-notice";
import { createNewsletter, type BridgeNewsletterResponse, type BridgeNewsletterSpec } from "./fluentcrm";
import { EMAIL_FRAME_OPEN, EMAIL_H1, EMAIL_LINK, EMAIL_P, escapeHtml, safeUrl } from "./newsletter-html";

export const MEMBER_NEWSLETTER_JOB = "member_newsletter";
/** At most this many topics in one email (a week of the daily cap is far below it). */
export const MAX_NEWSLETTER_ITEMS = 30;

export interface NewsletterSite { id: string; name: string; url: string; defaults: SiteContentDefaults | undefined }
export interface NewsletterItem { title: string; summary: string; link: string; isVideo: boolean; publishedAt: string }

export interface MemberNewsletterDeps {
  /** The organization's active WordPress sites. */
  sites(): Promise<NewsletterSite[]>;
  timeZone(): Promise<string | null>;
  /** The site's topics published in [from, to), oldest first. */
  published(siteId: string, from: string, to: string): Promise<NewsletterItem[]>;
  /** The bridge client id of the site ("" = the default one), null = the site has no bridge. */
  bridgeFor(siteUrl: string): string | null;
  /** Takes the site's week (its Monday); false = another firing already took it (M2). */
  claimWeek(siteId: string, monday: string): Promise<boolean>;
  createDraft(spec: BridgeNewsletterSpec, clientId: string): Promise<BridgeResult<BridgeNewsletterResponse>>;
  notify(n: Notice): Promise<void>;
}

/** The last full brand week before `now`: its Monday, and the instants of its Monday 00:00 and the next Monday 00:00. */
export function lastBrandWeek(now: Date, timeZone: string | null): { monday: string; sunday: string; from: string; to: string } {
  const tz = timeZone ?? "UTC";
  const today = zoned(now, tz).date;
  const thisMonday = addDays(today, 1 - weekday(today));
  const monday = addDays(thisMonday, -7);
  return { monday, sunday: addDays(monday, 6), from: instantAt(monday, "00:00", tz), to: instantAt(thisMonday, "00:00", tz) };
}

interface PublishedArts {
  article?: { summary?: string; published?: { link?: string; at?: string } };
  publish?: { youtube?: { url?: string; sent_at?: string }; article?: { url?: string; sent_at?: string } };
}

/** One published topic as the email shows it: YouTube's link first, else the article's; null = nothing to link to. */
export function newsletterItem(t: { title: string; artifacts: Record<string, unknown> | null; updated_at: string }): NewsletterItem | null {
  const a = (t.artifacts ?? {}) as PublishedArts;
  const youtube = a.publish?.youtube?.url;
  const link = youtube || a.article?.published?.link || a.publish?.article?.url;
  if (!link || !/^https?:\/\//i.test(link)) return null;
  const summary = (a.article?.summary ?? "").trim();
  return {
    title: t.title,
    summary: summary && summary !== t.title.trim() ? summary : "",
    link,
    isVideo: !!youtube,
    publishedAt: a.article?.published?.at ?? a.publish?.article?.sent_at ?? a.publish?.youtube?.sent_at ?? t.updated_at,
  };
}

/** Compared as instants: the DB writes "+00:00" with microseconds, the artifacts "Z" with milliseconds. */
const inWeek = (at: string, week: { from: string; to: string }) => {
  const t = Date.parse(at);
  return t >= Date.parse(week.from) && t < Date.parse(week.to);
};

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** The email: the week's topics (title, summary, link) then the site's must-carry paragraphs. Simple inline-styled HTML. */
export function weeklyNewsletter(site: NewsletterSite, week: { monday: string; sunday: string }, items: NewsletterItem[]): BridgeNewsletterSpec {
  const range = `${md(week.monday)}–${md(week.sunday)}`;
  const subject = `${site.name} 本週新內容（${range}）`;
  const parts = [EMAIL_FRAME_OPEN, `<h1 style="${EMAIL_H1}">${escapeHtml(subject)}</h1>`];
  for (const it of items) {
    parts.push(`<h2 style="font-size:19px;line-height:1.35;margin:24px 0 8px;color:#111827;font-weight:700;"><a href="${safeUrl(it.link)}" style="color:#111827;text-decoration:none;">${escapeHtml(it.title)}</a></h2>`);
    if (it.summary) parts.push(`<p style="${EMAIL_P}">${escapeHtml(it.summary)}</p>`);
    parts.push(`<p style="${EMAIL_P}"><a href="${safeUrl(it.link)}" style="${EMAIL_LINK}">${it.isVideo ? "觀看影片 →" : "閱讀文章 →"}</a></p>`);
  }
  for (const block of requiredBlocks(site.defaults)) {
    parts.push(`<p style="${EMAIL_P}">${escapeHtml(block).replace(/\r?\n/g, "<br />")}</p>`);
  }
  parts.push("</div>");
  return {
    title: `每週會員信 ${site.name} ${week.monday}`,
    subject,
    // whole characters: a cut surrogate pair makes PHP json_decode fail and the plugin refuse the whole body
    preview: Array.from(items.map((i) => i.title).join("、")).slice(0, 120).join(""),
    body_html: parts.join("\n"),
  };
}

/** Why a bridge answer means "skip this week" (M4); null = not a skip (M1: a non-draft answer is thrown by the caller). */
function skipReason(r: { error: string; blockedMode?: string }): string | null {
  if (r.error.startsWith("unexpected_non_draft_status")) return null;
  if (r.blockedMode !== undefined) return `系統模式 ${r.blockedMode} 擋下變更`;
  if (r.error === "fluentcrm_not_active") return "沒裝 FluentCRM";
  if (r.error.startsWith("bridge_") || r.error === "rest_no_route") return `Bridge 不通（${r.error}）`;
  return `FluentCRM 沒建成草稿（${r.error}）`;
}

export function newsletterReadyNotice(site: NewsletterSite, monday: string, items: NewsletterItem[], editUrl: string | undefined): Notice {
  const videos = items.filter((i) => i.isVideo).length;
  const count = videos === items.length ? `${videos} 支影片` : `${items.length} 則內容（其中 ${videos} 支影片）`;
  const title = `會員信草稿已備好：〈${site.name}〉，${count}，到 FluentCRM 看過再寄`;
  return {
    jobKey: MEMBER_NEWSLETTER_JOB,
    fingerprint: `${MEMBER_NEWSLETTER_JOB}:${site.id}:${monday}`,
    title: title.slice(0, 200),
    message: `${title}\n系統不會自己寄出。${editUrl ? `\n草稿：${editUrl}` : ""}`,
    raw: { site_id: site.id, week: monday, items: items.length, videos },
    signalType: "business",
  };
}

/** The week is already claimed when the bridge call fails, so it is not tried again: say so once (per site and week). */
export function newsletterFailedNotice(site: NewsletterSite, monday: string, why: string): Notice {
  const title = `會員信草稿沒建成：〈${site.name}〉${monday} 那週，${why}`;
  return {
    jobKey: MEMBER_NEWSLETTER_JOB,
    fingerprint: `${MEMBER_NEWSLETTER_JOB}:${site.id}:${monday}:failed`,
    title: title.slice(0, 200),
    message: `${title}\n這週不會再自動試。請到 FluentCRM 確認有沒有草稿；需要的話手動建一封。`,
    raw: { site_id: site.id, week: monday, why },
  };
}

/** Every active site of the organization, each at most once per brand week. Returns one summary line per site; throws
 *  (after the other sites) only when FluentCRM answered with a status other than draft (M1). */
export async function runMemberNewsletter(deps: MemberNewsletterDeps, now: Date): Promise<string> {
  const sites = await deps.sites();
  if (!sites.length) return "skipped: 沒有 WordPress 網站";
  const week = lastBrandWeek(now, await deps.timeZone());
  const lines: string[] = [];
  const violations: string[] = [];
  for (const site of sites) {
    const head = `site=${site.id} week=${week.monday}`;
    const clientId = deps.bridgeFor(site.url);
    if (clientId === null) { lines.push(`${head} skipped: 沒有接 Bridge`); continue; }
    const items = (await deps.published(site.id, week.from, week.to))
      .filter((i) => inWeek(i.publishedAt, week)).slice(0, MAX_NEWSLETTER_ITEMS);
    if (!items.length) { lines.push(`${head} none published`); continue; }   // M3
    if (!(await deps.claimWeek(site.id, week.monday))) { lines.push(`${head} already made`); continue; }   // M2
    const r = await deps.createDraft(weeklyNewsletter(site, week, items), clientId);
    if (!r.ok) {
      const failed = r as { ok: false; error: string; blockedMode?: string };   // tsconfig strict:false: !r.ok does not narrow
      const why = skipReason(failed);
      if (why === null) { violations.push(`${head} ${failed.error}`); continue; }
      lines.push(`${head} skipped: ${why}`);
      // the week is claimed and a weekly schedule has no same-week retry: a person must hear of it (M4), except a site
      // that simply has no FluentCRM
      if (failed.error !== "fluentcrm_not_active") {
        await deps.notify(newsletterFailedNotice(site, week.monday, why))
          .catch((e) => console.error(`[member_newsletter] ${head} notice not raised: ${String(e)}`));
      }
      continue;
    }
    await deps.notify(newsletterReadyNotice(site, week.monday, items, r.value.edit_url))
      .catch((e) => console.error(`[member_newsletter] ${head} notice not raised: ${String(e)}`));
    lines.push(`${head} draft=${r.value.campaign_id} items=${items.length}`);
  }
  if (violations.length) throw new Error(`member_newsletter:non_draft:${violations.join("; ")} | ${lines.join("; ")}`);
  return lines.join("; ");
}

const fail = (what: string, e: { message: string }): never => { throw new Error(`member_newsletter:${what}:${e.message}`); };

export function memberNewsletterDeps(sb: SupabaseClient, organizationId: string): MemberNewsletterDeps {
  return {
    async sites() {
      const { data, error } = await sb.from("wp_sites").select("id, name, url, content_defaults").eq("organization_id", organizationId).eq("active", true).order("id");
      if (error) fail("sites", error);
      return ((data ?? []) as Array<{ id: string; name: string; url: string; content_defaults: SiteContentDefaults | null }>)
        .map((s) => ({ id: s.id, name: s.name, url: s.url, defaults: s.content_defaults ?? undefined }));
    },
    timeZone: () => orgTimeZone(sb, organizationId),
    async published(siteId, from) {
      // updated_at is at or after the publish time, so it narrows the read; the caller keeps the week by the publish time
      const { data, error } = await sb.from("content_topics").select("title, artifacts, updated_at")
        .eq("organization_id", organizationId).eq("site_id", siteId).eq("status", "published").gte("updated_at", from)
        .order("updated_at", { ascending: true }).limit(200);
      if (error) fail("published", error);
      return ((data ?? []) as Array<{ title: string; artifacts: Record<string, unknown> | null; updated_at: string }>)
        .map(newsletterItem).filter((i): i is NewsletterItem => i !== null)
        .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
    },
    bridgeFor: (siteUrl) => bridgeClientForSite(siteUrl),
    async claimWeek(siteId, monday) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) throw new Error(`member_newsletter:bad_week:${monday}`);   // goes into the or() string below
      const { data, error } = await sb.from("wp_sites").update({ member_newsletter_week: monday }).eq("id", siteId).eq("organization_id", organizationId)
        .or(`member_newsletter_week.is.null,member_newsletter_week.lt.${monday}`).select("id");
      if (error) fail("claim", error);
      return (data ?? []).length === 1;
    },
    createDraft: (spec, clientId) => createNewsletter(spec, { clientId }),
    notify: (n) => raiseNotice(sb, organizationId, n),
  };
}
