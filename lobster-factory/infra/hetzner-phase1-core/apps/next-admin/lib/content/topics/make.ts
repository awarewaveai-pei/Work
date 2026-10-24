// The server side of a topic's making (plan §3.2 generating -> drafted): the article as a WordPress draft and the social
// posts as one social draft, both for the topic's own organization, each with its rule checks. Runs inside runForOrg, so
// every AI call bills that organization as the named actor, and publishes with orgIdentity, so the WordPress write
// passes the same organization check a customer's own request does (plan I7). A part already made (kept on the row by
// an earlier failed attempt) is not made again: a retry after the social step failed does not write a second article.
// Auto publish (gated in tick.ts publishReviewed, always "now") changes those same drafts: the WordPress draft to
// publish through the calendar's core, then the social draft gets the live article's link and is scheduled a moment
// ahead as an editor would -- a brand that requires social review gets it submitted instead. Only staff set a site to
// auto publish (sites/[id] route), so acting as editor here is that staff decision, not the starting person's role.
import type { SupabaseClient } from "@supabase/supabase-js";
import { grantFor, runForOrg } from "@/lib/entitlements/grant";
import { orgIdentity } from "@/lib/tenant-guard";
import { loadSiteBrand, type SiteBrand } from "@/lib/content/brand-voice-store";
import { autoPublishes, forbiddenTerms, renderBrandVoice, renderSiteVoice, type SiteContentDefaults } from "@/lib/content/brand-voice";
import { updateWpPost } from "@/lib/content/publish/wp-post-core";
import { runContentPipeline, type PipelineFailure } from "@/lib/content/pipeline";
import { parseArticleMeta } from "@/lib/content/article/meta";
import { getPost, listAccounts, savePost } from "@/lib/social/store";
import { applyAction } from "@/lib/social/actions";
import { requiresReview } from "@/lib/social/review";
import { textsForAccounts, writerKeysFor, writeSocialPosts } from "@/lib/social/write-posts";
import { claudeWriter } from "@/lib/social/write-posts-claude";
import { articleChecks, reviewOf, socialChecks, type ReviewCheck } from "./review";
import { claimTopic, dueApproved, inStatus, move, startTopic, type Topic } from "./store";
import { MakeError, NOW_FORMATS, type Made, type Published, type TickDeps } from "./tick";

/** What content_topics.artifacts holds: one entry per made part; `published` / `sent` once auto publish put it out. */
export interface TopicArtifacts {
  article?: {
    wp_post_id: number | null; wp_edit_url: string | null; seo_score: number | null; summary: string; source: string; checks: ReviewCheck[];
    published?: { status: string; link: string; at: string };
  };
  /** post_id null = no channel the writer can write for (the checks say so). */
  social?: { post_id: string | null; checks: ReviewCheck[]; sent?: { state: string; scheduled_at: string | null; at: string } };
}

/** The social post is due this far ahead (state.ts schedule needs a future time; the sender looks 10 min ahead). */
export const SOCIAL_NOW_LEAD_MS = 2 * 60_000;

/** The article generator's input: the topic, and the site's stored defaults the article tool's form starts from. */
export function articleInput(t: Pick<Topic, "keyword" | "title" | "angle">, d: SiteContentDefaults): Record<string, unknown> {
  const details = [renderBrandVoice(d.marketing, d.brandVoiceInstructions), t.angle ? `切入角度：${t.angle}` : ""].filter(Boolean).join("\n\n");
  return {
    keyword: t.keyword, title: t.title, language: d.language, targetCountry: d.targetCountry, tone: d.tone,
    articleType: d.articleType, readability: d.readability, pointOfView: d.pointOfView, details, generateMeta: true,
  };
}

/** Why this topic cannot be made now (no site, an inactive one, another organization's); null = it can. */
async function siteFor(sb: SupabaseClient, t: Topic): Promise<SiteBrand | string> {
  if (!t.site_id) return "題目沒有指定網站";
  const site = await loadSiteBrand(sb, t.site_id);
  if (!site) return "題目的網站不存在或已停用";
  if (site.organizationId !== t.organization_id) return "題目的網站不屬於這個客戶";
  return site;
}

async function makeArticle(t: Topic, site: SiteBrand): Promise<NonNullable<TopicArtifacts["article"]>> {
  const a = await runContentPipeline(articleInput(t, site.defaults), { stages: ["article"] });
  if (!a.ok) throw new Error(`文章生成失敗：${(a as PipelineFailure).error}`);   // strict:false: !ok does not narrow
  const markdown = a.markdown ?? "";
  const meta = parseArticleMeta(markdown);
  const p = await runContentPipeline({
    markdown, focusKeyword: meta?.focusKeyword || t.keyword, seoTitle: meta?.seoTitle, metaDescription: meta?.metaDesc,
    categories: meta?.categories, tags: meta?.tags, slug: meta?.slug, siteId: t.site_id, publishStatus: "draft",
    request: orgIdentity(t.organization_id),
  }, { stages: ["quality", "publish"] });
  if (!p.ok) throw new Error(`WordPress 草稿失敗（${(p as PipelineFailure).failedStage}）：${(p as PipelineFailure).error}`);
  const report = p.qualityReport ?? null;
  return {
    wp_post_id: p.publish?.post_id ?? null, wp_edit_url: p.publish?.edit_url ?? null, seo_score: report?.score ?? null,
    summary: meta?.metaDesc || t.title,
    // what the social writer reads (it uses the first 3000 characters), kept so a retry can write posts without the article
    source: markdown.replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "").trim().slice(0, 3000),
    checks: articleChecks(markdown, report, forbiddenTerms(site.defaults)),
  };
}

async function makeSocial(t: Topic, site: SiteBrand, article: TopicArtifacts["article"], actor: string): Promise<NonNullable<TopicArtifacts["social"]>> {
  const accounts = (await listAccounts(t.organization_id, { hydrateProfile: false })).filter((a) => a.status === "connected");
  const keys = writerKeysFor(accounts.map((a) => a.platform));
  const forbidden = forbiddenTerms(site.defaults);
  if (!keys.length) {
    return { post_id: null, checks: socialChecks({ texts: [], channels: accounts.length, problems: accounts.length ? ["已連接的頻道都不支援自動撰寫"] : [] }, forbidden) };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const { ask } = await claudeWriter(await grantFor("content.syndicate"), apiKey, "lib/content/topics/make", null);
  const source = article?.source || [t.title, t.angle ?? ""].filter(Boolean).join("\n\n");
  // No link yet: the article is still a draft. The post gets its link when the article is published.
  const w = await writeSocialPosts({ article: source, keys, mediaType: "text", voice: renderSiteVoice(site.defaults) }, ask);
  const custom = textsForAccounts(w, accounts);
  const saved = await savePost(t.organization_id, null, null, { body: article?.summary || t.title, notes: `自動內容管線：題目「${t.title}」` },
    accounts.map((a) => ({ account_id: a.id, custom_body: custom[a.id] ?? null })), null, actor);
  const texts = Object.values(custom);
  const problems = [...w.tooLong.map((x) => `${x.key} 太長（${x.length}/${x.limit}）`), ...w.missing.map((k) => `${k} 沒有寫出來`)];
  if (!problems.length && texts.length < accounts.length) problems.push(`${accounts.length - texts.length} 個頻道沒有專屬貼文`);
  return { post_id: saved.id, checks: socialChecks({ texts, channels: accounts.length, problems }, forbidden) };
}

async function makeDrafts(sb: SupabaseClient, t: Topic, actor: string): Promise<Made> {
  const site = await siteFor(sb, t);
  if (typeof site === "string") throw new Error(site);
  const artifacts: TopicArtifacts = { ...(t.artifacts as TopicArtifacts) };
  try {
    if (t.formats.includes("article") && !artifacts.article) artifacts.article = await makeArticle(t, site);
    if (t.formats.includes("social") && !artifacts.social) artifacts.social = await makeSocial(t, site, artifacts.article, actor);
  } catch (e) {
    throw new MakeError(e instanceof Error ? e.message : String(e), artifacts as Record<string, unknown>);
  }
  const checks = [...(artifacts.article?.checks ?? []), ...(artifacts.social?.checks ?? [])];
  return { artifacts: artifacts as Record<string, unknown>, review: reviewOf(checks, new Date()) };
}

/** The topic's social draft: the article's link, then scheduled (or submitted, when the brand requires social review). */
async function sendSocial(t: Topic, postId: string, link: string | undefined, now: Date, actor: string): Promise<NonNullable<NonNullable<TopicArtifacts["social"]>["sent"]>> {
  let post = await getPost(t.organization_id, postId);
  // a person already scheduled, submitted or deleted it: theirs, left as it is
  if (post.state !== "draft") return { state: post.state, scheduled_at: post.scheduled_at, at: now.toISOString() };
  if (link && !post.link_url) {
    const saved = await savePost(t.organization_id, post.id, post.version, { link_url: link }, null, null, actor);
    post = { ...post, link_url: link, version: saved.version };
  }
  const review = await requiresReview(t.organization_id);
  const scheduledAt = new Date(now.getTime() + SOCIAL_NOW_LEAD_MS).toISOString();
  const done = await applyAction(t.organization_id, post, review ? "submit" : "schedule", "editor", review ? {} : { scheduledAt },
    actor, { source: "content_pipeline", topic_id: t.id });
  return { state: done.state, scheduled_at: review ? null : scheduledAt, at: now.toISOString() };
}

async function publishDrafts(sb: SupabaseClient, t: Topic, actor: string): Promise<Published> {
  const site = await siteFor(sb, t);
  if (typeof site === "string") throw new Error(site);
  // the gate in tick.ts read the setting a moment ago; read again at the write, so a switch back to human review wins
  if (!autoPublishes(site.defaults)) throw new Error("網站已改成人工審核，沒有發布（草稿都在）");
  const now = new Date();
  const artifacts: TopicArtifacts = { ...(t.artifacts as TopicArtifacts) };
  try {
    const a = artifacts.article;
    if (t.formats.includes("article") && !a?.published) {
      if (!a?.wp_post_id || !t.site_id) throw new Error("沒有 WordPress 草稿編號，無法發布");
      const r = await updateWpPost(orgIdentity(t.organization_id), t.site_id, a.wp_post_id, { status: "publish" });
      if (!r.ok) throw new Error(`WordPress 發布失敗：${(r as Extract<typeof r, { ok: false }>).error}`);   // strict:false
      artifacts.article = { ...a, published: { status: r.post.status, link: r.post.link, at: now.toISOString() } };
    }
    const s = artifacts.social;
    if (s?.post_id && !s.sent) artifacts.social = { ...s, sent: await sendSocial(t, s.post_id, artifacts.article?.published?.link, now, actor) };
  } catch (e) {
    throw new MakeError(e instanceof Error ? e.message : String(e), artifacts as Record<string, unknown>);
  }
  return { artifacts: artifacts as Record<string, unknown> };
}

/** The real store and makers behind tickTopics, bound to one organization and the actor the work is done as. */
export function topicDeps(sb: SupabaseClient, organizationId: string, actor: string): TickDeps {
  const own = (t: Topic) => {
    if (t.organization_id !== organizationId) throw new Error("topic of another organization");
  };
  return {
    now: () => new Date(),
    due: (now) => dueApproved(sb, organizationId, now, NOW_FORMATS),
    inStatus: (statuses) => inStatus(sb, organizationId, statuses),
    blocker: async (t) => { own(t); const s = await siteFor(sb, t); return typeof s === "string" ? s : null; },
    start: (t, day, cap) => startTopic(sb, t, day, cap),
    move: (t, to, patch) => move(sb, t, to, patch),
    claim: (t) => { own(t); return claimTopic(sb, t); },
    make: (t) => { own(t); return runForOrg(organizationId, actor, () => makeDrafts(sb, t, actor)); },
    autoPublishes: async (t) => { own(t); const s = await siteFor(sb, t); return typeof s !== "string" && autoPublishes(s.defaults); },
    publish: (t) => { own(t); return publishDrafts(sb, t, actor); },
  };
}
