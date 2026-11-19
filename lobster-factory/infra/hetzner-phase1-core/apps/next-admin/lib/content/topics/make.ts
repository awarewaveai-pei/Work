// The server side of a topic's making (plan §3.2 generating -> drafted): the article as a WordPress draft and the social
// posts as one social draft, both for the topic's own organization, each with its rule checks. Runs inside runForOrg, so
// every AI call bills that organization as the named actor, and publishes with orgIdentity, so the WordPress write
// passes the same organization check a customer's own request does (plan I7). A part already made (kept on the row by
// an earlier failed attempt) is not made again: a retry after the social step failed does not write a second article.
// Auto publish (gated in tick.ts publishReviewed, always "now") changes those same drafts in steps (publish-steps.ts,
// N5a): the YouTube draft (its own post since N5a) is scheduled first; once YouTube's public link is back the WordPress
// draft is published through the calendar's core; then the other channels' draft gets the live article's link and is
// scheduled a moment ahead as an editor would -- a brand that requires social review gets it submitted instead. Only
// staff set a site to auto publish (sites/[id] route), so acting as editor here is that staff decision, not the
// starting person's role. YouTube's privacy is the site's youtubePrivacy, carried on the YouTube target's format.
import type { SupabaseClient } from "@supabase/supabase-js";
import { grantFor, runForOrg } from "@/lib/entitlements/grant";
import { EntitlementRequired, type Grant } from "@/lib/entitlements/can";
import { orgIdentity } from "@/lib/tenant-guard";
import { loadSiteBrand, type SiteBrand } from "@/lib/content/brand-voice-store";
import { autoPublishes, forbiddenTerms, renderBrandVoice, renderSiteVoice, requiredBlocks, siteLanguage, youtubeFormat, type SiteContentDefaults } from "@/lib/content/brand-voice";
import { updateWpPost } from "@/lib/content/publish/wp-post-core";
import { runContentPipeline, type PipelineFailure } from "@/lib/content/pipeline";
import { parseArticleMeta } from "@/lib/content/article/meta";
import { makeContentImage } from "@/lib/content/image/make-image";
import { isR2Configured } from "@/lib/storage/r2";
import { addVideo, getPost, listAccounts, savePost } from "@/lib/social/store";
import { applyAction } from "@/lib/social/actions";
import { requiresReview } from "@/lib/social/review";
import { textsForAccounts, writerKeysFor, writeSocialPosts } from "@/lib/social/write-posts";
import { inLanguage } from "@/lib/social/post-language";
import { claudeWriter } from "@/lib/social/write-posts-claude";
import { articleChecks, reviewOf, socialChecks, uncheckedRequired, type ReviewCheck } from "./review";
import { claimTopic, dueApproved, inStatus, move, orgTimeZone, startTopic, type Topic } from "./store";
import { startVideoJob } from "@/lib/content/video/start";
import { ensureTopicProject, updateTopicProject } from "@/lib/content/video/topic-project";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { finalizeVideoJob } from "@/lib/content/video/finalize";
import { embedVideoInPost } from "@/lib/content/video/embed-in-post";
import { releaseTopicVideo } from "./video-release";
import { ARTICLE_VIDEO_DEFAULTS, articleVideoVoice, parseVoiceModel } from "@/lib/content/video/defaults";
import { TOPIC_ARTICLE_IMAGES } from "./cost";
import { DEFAULT_TOPIC_CAP_TWD, reserveStep, settleStep, spentSince, stepUpperTwd, topicBudget, type TopicBudget } from "./budget";
import { usdToNtd } from "@/lib/ai/cost-calculator";
import { MakeError, NOW_FORMATS, brandDay, personAsked, waitsForVideo, type Made, type Published, type PublishRun, type TickDeps, type VideoArtifact, type VideoPoll } from "./tick";
import { publishSteps, type PublishLog, type YoutubeLook } from "./publish-steps";

/** What content_topics.artifacts holds: one entry per made part; `published` / `sent` once auto publish put it out. */
export interface TopicArtifacts {
  article?: {
    wp_post_id: number | null; wp_edit_url: string | null; seo_score: number | null; summary: string; source: string; checks: ReviewCheck[];
    /** N1b: the site's must-carry paragraphs this article's checks looked for (absent on articles made before N1b). */
    required?: string[];
    published?: { status: string; link: string; at: string };
  };
  /** post_id = the draft of every channel but YouTube (null = none, or no channel the writer can write for: the checks
   *  say so); youtube_post_id = the YouTube channels' own draft (N5a; absent on a topic made before, whose post_id draft
   *  may hold YouTube too and goes out as before). */
  social?: { post_id: string | null; youtube_post_id?: string | null; checks: ReviewCheck[]; sent?: { state: string; scheduled_at: string | null; at: string } };
  /** The topic's video job; url once it finished, then when it went into the article and onto each social draft. */
  video?: VideoArtifact & { embedded_at?: string; media_id?: string; youtube_media_id?: string };
  /** N5a: each publish step, recorded before and after its outside write (publish-steps.ts). */
  publish?: PublishLog;
  /** N2: when this topic's spending cap began, the cap and the spend last read (budget.ts; the ledger is the source). */
  budget?: TopicBudget;
}

/** Checks the topic's cap before one paid step and reserves the step's most (budget.ts reserveStep); `exact` (the name "settle" is kept for wallet holds: lib/ai/__tests__/settle-through-ledger.test.ts) swaps a
 *  reservation for the call's exact cost once known (0 = the call failed: whatever it was billed is in the ledger, which
 *  every check reads). A reservation not settled stays counted (its ledger row may lag). */
type Guard = ((upperTwd: number, step: string) => Promise<void>) & { exact(reservedTwd: number, actualTwd: number): void };

/** The social post is due this far ahead (state.ts schedule needs a future time; the sender looks 10 min ahead). */
export const SOCIAL_NOW_LEAD_MS = 2 * 60_000;

export { TOPIC_ARTICLE_IMAGES };   // defined in cost.ts (the price counts the same images)
const IMAGE_PLACEHOLDER = /!\[([^\]]*)\]\(IMAGE_PLACEHOLDER_\d+\)/g;

/** Each image placeholder becomes a stored image (alt text = its prompt) or is removed; nothing unresolved reaches WordPress.
 *  At most `max` are made (the count the topic's cap reserved, N2): placeholders past it are removed, never paid for. */
export async function fillArticleImages(markdown: string, make: (prompt: string) => Promise<string | null>, max = TOPIC_ARTICLE_IMAGES): Promise<{ markdown: string; images: string[] }> {
  const urls: Array<string | null> = [];
  for (const m of markdown.matchAll(IMAGE_PLACEHOLDER)) {
    // one at a time: Replicate's low-balance burst limit is 1
    urls.push(urls.length < max ? await make(m[1].trim()).catch(() => null) : null);
  }
  const images: string[] = [];
  let i = 0;
  const filled = markdown.replace(IMAGE_PLACEHOLDER, (_all, alt: string) => {
    const url = urls[i++];
    if (!url) return "";
    images.push(url);
    return `![${alt}](${url})`;
  });
  return { markdown: filled, images };
}

/** Images are an add-on: an organization without content.image still gets its article, without images (null). */
export async function optionalImageGrant(ask: () => Promise<Grant> = () => grantFor("content.image")): Promise<Grant | null> {
  return ask().catch((e) => { if (e instanceof EntitlementRequired) return null; throw e; });
}

/** The article generator's input: the topic, and the site's stored defaults the article tool's form starts from.
 *  images = how many placeholders to ask for (0 when the organization has no content.image). */
export function articleInput(t: Pick<Topic, "keyword" | "title" | "angle">, d: SiteContentDefaults, images = 0): Record<string, unknown> {
  const details = [renderBrandVoice(d.marketing, d.brandVoiceInstructions), t.angle ? `切入角度：${t.angle}` : "", requiredBlocks(d).length ? `文末逐字附上以下段落，一字不改，每段自成一段：\n${requiredBlocks(d).join("\n\n")}` : ""].filter(Boolean).join("\n\n");
  return {
    keyword: t.keyword, title: t.title, language: siteLanguage(d), targetCountry: d.targetCountry, tone: d.tone,
    articleType: d.articleType, readability: d.readability, pointOfView: d.pointOfView, details, generateMeta: true,
    media: images > 0 ? { aiImages: "flux-schnell", imageCount: images, imageSize: "16:9" } : { aiImages: "none" },
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

async function makeArticle(t: Topic, site: SiteBrand, guard: Guard): Promise<NonNullable<TopicArtifacts["article"]>> {
  // no R2 = nowhere to keep an image WordPress can fetch, so none is paid for
  const imageGrant = isR2Configured() ? await optionalImageGrant() : null;
  const imageCount = imageGrant ? TOPIC_ARTICLE_IMAGES : 0;
  // _jobId: the article call's ai_call_logs row carries the topic id (generate-core prepareArticleGeneration)
  const input = { ...articleInput(t, site.defaults, imageCount), _jobId: t.id };
  await guard(stepUpperTwd.article(imageCount), "文章");
  const a = await runContentPipeline(input, { stages: ["article"] });
  if (!a.ok) throw new Error(`文章生成失敗：${(a as PipelineFailure).error}`);   // strict:false: !ok does not narrow
  const { markdown, images } = await fillArticleImages(a.markdown ?? "", async (prompt) => {
    if (!imageGrant) return null;
    const img = await makeContentImage({ model: "flux-schnell", prompt: prompt || t.title, aspectRatio: "16:9", seed: null,
      costLog: { route: "content/topics", tool: "content", jobId: t.id } }, imageGrant);
    // WordPress takes only http(s) images: an unstored (data URL) image would vanish at publish
    return img.ok && (img as { stored: boolean }).stored ? (img as { imageUrl: string }).imageUrl : null;
  }, imageCount);
  const meta = parseArticleMeta(markdown);
  const p = await runContentPipeline({
    markdown, focusKeyword: meta?.focusKeyword || t.keyword, seoTitle: meta?.seoTitle, metaDescription: meta?.metaDesc,
    categories: meta?.categories, tags: meta?.tags, slug: meta?.slug, siteId: t.site_id, publishStatus: "draft", featuredImageUrl: images[0],
    request: orgIdentity(t.organization_id),
  }, { stages: ["quality", "publish"] });
  if (!p.ok) throw new Error(`WordPress 草稿失敗（${(p as PipelineFailure).failedStage}）：${(p as PipelineFailure).error}`);
  const report = p.qualityReport ?? null;
  return {
    wp_post_id: p.publish?.post_id ?? null, wp_edit_url: p.publish?.edit_url ?? null, seo_score: report?.score ?? null,
    summary: meta?.metaDesc || t.title,
    // what the social writer reads (it uses the first 3000 characters), kept so a retry can write posts without the article
    source: markdown.replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "").trim().slice(0, 3000),
    checks: articleChecks(markdown, report, forbiddenTerms(site.defaults), requiredBlocks(site.defaults)),
    required: requiredBlocks(site.defaults),
  };
}

/** YouTube channels only for a topic that chose youtube (they need its video); the other channels only for social. */
export const topicTargets = (formats: readonly string[], platform: string) =>
  platform === "youtube" ? formats.includes("youtube") : formats.includes("social");

/** The social draft's shared text: the article's summary (its meta description), or the title when the summary is not in
 *  the posts' language (2026-10-29 a Chinese article's summary came back in English and went into the draft as it was). */
export const socialBody = (summary: string | undefined, title: string, language: string) =>
  summary && inLanguage(summary, language) ? summary : title;

async function makeSocial(t: Topic, site: SiteBrand, article: TopicArtifacts["article"], actor: string, guard: Guard): Promise<NonNullable<TopicArtifacts["social"]>> {
  const accounts = (await listAccounts(t.organization_id, { hydrateProfile: false }))
    .filter((a) => a.status === "connected" && topicTargets(t.formats, a.platform));
  const keys = writerKeysFor(accounts.map((a) => a.platform));
  const forbidden = forbiddenTerms(site.defaults);
  if (!keys.length) {
    return { post_id: null, checks: socialChecks({ texts: [], channels: accounts.length, problems: accounts.length ? ["已連接的頻道都不支援自動撰寫"] : [] }, forbidden) };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const writer = await claudeWriter(await grantFor("content.syndicate"), apiKey, "lib/content/topics/make", null, t.id);
  const ask = async (prompt: string) => {
    const upper = stepUpperTwd.socialCall(prompt), before = writer.spent.usd;
    await guard(upper, "社群文案");
    const answer = await writer.ask(prompt).catch((e) => { guard.exact(upper, 0); throw e; });   // a failed call gives it back
    guard.exact(upper, usdToNtd(writer.spent.usd - before));
    return answer;
  };
  const source = article?.source || [t.title, t.angle ?? ""].filter(Boolean).join("\n\n");
  // No link yet: the article is still a draft. The post gets its link when the article is published.
  // a topic with a video gets posts written for one (the video is attached to this draft once it is rendered)
  const mediaType = waitsForVideo(t) ? "video" : "text";
  const w = await writeSocialPosts({ article: source, keys, mediaType, voice: renderSiteVoice(site.defaults), siteLanguage: siteLanguage(site.defaults) }, ask);
  const custom = textsForAccounts(w, accounts);
  // YouTube is its own draft (N5a): it goes out first and the article waits for its link; every other channel shares one
  const fields = { body: socialBody(article?.summary, t.title, w.language), notes: `自動內容管線：題目「${t.title}」` };
  const draft = async (group: typeof accounts, format?: string) => group.length
    ? (await savePost(t.organization_id, null, null, fields,
      group.map((a) => ({ account_id: a.id, custom_body: custom[a.id] ?? null, ...(format ? { format } : {}) })), null, actor)).id
    : null;
  const postId = await draft(accounts.filter((a) => a.platform !== "youtube"));
  const youtubePostId = await draft(accounts.filter((a) => a.platform === "youtube"), youtubeFormat(site.defaults)).catch(async (e) => {
    // the topic records neither draft (this throws): the first one goes to the trash, or a retry would leave it behind
    if (postId) {
      await getPost(t.organization_id, postId)
        .then((p) => applyAction(t.organization_id, p, "delete", "editor", {}, actor, { source: "content_pipeline", topic_id: t.id }))
        .catch((d) => console.error(`[content/topics] ${t.id} social draft ${postId} left behind: ${d instanceof Error ? d.message : d}`));
    }
    throw e;
  });
  const texts = Object.values(custom);
  const problems = [...w.tooLong.map((x) => `${x.key} 太長（${x.length}/${x.limit}）`), ...w.missing.map((k) => `${k} 沒有寫出來`),
    ...w.wrongLanguage.map((k) => `${k} 不是${w.language}，沒有採用`)];
  if (!problems.length && texts.length < accounts.length) problems.push(`${accounts.length - texts.length} 個頻道沒有專屬貼文`);
  return { post_id: postId, ...(youtubePostId ? { youtube_post_id: youtubePostId } : {}), checks: socialChecks({ texts, channels: accounts.length, problems }, forbidden) };
}

/** The topic's cap guard: each check reads the ledger (budget.ts) and records the spend on `artifacts.budget`. */
export function capGuard(t: Pick<Topic, "id">, artifacts: TopicArtifacts, capTwd: number,
  readSpent: (startedAt: string) => Promise<number>): Guard {
  artifacts.budget = topicBudget(artifacts.budget, capTwd);
  const guard = async (upperTwd: number, step: string) => {
    const b = artifacts.budget!;
    artifacts.budget = await reserveStep(b, upperTwd, step, () => readSpent(b.startedAt));
  };
  return Object.assign(guard, { exact: (reservedTwd: number, actualTwd: number) => { artifacts.budget = settleStep(artifacts.budget!, reservedTwd, actualTwd); } });
}

async function makeDrafts(sb: SupabaseClient, t: Topic, actor: string, capTwd: number): Promise<Made> {
  const site = await siteFor(sb, t);
  if (typeof site === "string") throw new Error(site);
  const artifacts: TopicArtifacts = { ...(t.artifacts as TopicArtifacts) };
  const guard = capGuard(t, artifacts, capTwd, (startedAt) => spentSince(sb, t.id, startedAt));
  const spentAtStart = artifacts.budget!.spentTwd;
  try {
    if (t.formats.includes("article") && !artifacts.article) artifacts.article = await makeArticle(t, site, guard);
    if ((t.formats.includes("social") || t.formats.includes("youtube")) && !artifacts.social) artifacts.social = await makeSocial(t, site, artifacts.article, actor, guard);
  } catch (e) {
    // a failed attempt keeps none of its own reservations (budget.ts header): what it was billed is in the ledger, which
    // the retry's first check reads, so a refusal or a WordPress failure does not hold back money never spent
    artifacts.budget = { ...artifacts.budget!, spentTwd: spentAtStart };
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

/** The YouTube draft as publish-steps reads it: every target's release_url back = live (the first link); a failed
 *  target or a deleted post = it will not come. */
export async function lookYoutube(orgId: string, postId: string): Promise<YoutubeLook> {
  const post = await getPost(orgId, postId);
  if (post.state === "deleted") return { state: "error", error: "YouTube 貼文被刪除了" };
  const failed = post.targets.find((x) => x.state === "error");
  if (failed) return { state: "error", error: failed.error || "Postiz 沒有說原因" };
  const urls = post.targets.map((x) => x.release_url);
  return urls.length && urls.every((u): u is string => !!u) ? { state: "live", url: urls[0] } : { state: "waiting" };
}

async function publishDrafts(sb: SupabaseClient, t: Topic, actor: string, save: (a: Record<string, unknown>) => Promise<boolean>, fresh: boolean): Promise<PublishRun> {
  const site = await siteFor(sb, t);
  // nothing went out in this run: the failed row keeps what earlier runs recorded (a MakeError carries it)
  if (typeof site === "string") throw new MakeError(site, t.artifacts);
  // N6: out only when the site publishes by itself or a person pressed 發布 for this run (tick.ts requestPublish). The
  // gate in tick.ts read the setting a moment ago; read again at every step's run, so a switch back to human review wins
  // over auto publish (never over a person's press).
  if (!autoPublishes(site.defaults) && !personAsked(t.artifacts)) throw new MakeError("網站是人工審核，沒有人按「發布」，沒有往下發布（還沒發的都還是草稿）", t.artifacts);
  // N1b: paragraphs the site asks for now but this article was never checked for (added after it was made) stop it here,
  // before any step -- YouTube included -- goes out
  const a = (t.artifacts as TopicArtifacts).article;
  if (t.formats.includes("article") && !a?.published && !a?.wp_post_id) throw new MakeError("沒有 WordPress 草稿編號，沒有發布（YouTube 與其他貼文也都沒發）", t.artifacts);
  if (t.formats.includes("article") && a && !a.published) {
    const unchecked = uncheckedRequired(a.required, requiredBlocks(site.defaults));
    if (unchecked.length) throw new MakeError(`網站後來新增了必附段落，這篇沒有檢查過（${unchecked.join("、")}），沒有發布（草稿還在）`, t.artifacts);
  }
  return publishSteps(t, {
    now: () => new Date(),
    sendPost: (postId, link, now) => sendSocial(t, postId, link, now, actor),
    lookYoutube: (postId) => lookYoutube(t.organization_id, postId),
    publishArticle: async (wpPostId) => {
      if (!t.site_id) throw new Error("沒有 WordPress 草稿編號，無法發布");
      const r = await updateWpPost(orgIdentity(t.organization_id), t.site_id, wpPostId, { status: "publish" });
      if (!r.ok) throw new Error(`WordPress 發布失敗：${(r as Extract<typeof r, { ok: false }>).error}`);   // strict:false
      return { status: r.post.status, link: r.post.link };
    },
  }, save, fresh);
}

/** A video job row older than this with nothing submitted is a prepare that died (a prepare takes under ~100s). */
export const STALE_PREPARE_MS = 15 * 60 * 1000;

/** The topic's video, with the article page's default settings (lib/content/video/defaults.ts) and the site's voice. */
async function startTopicVideo(sb: SupabaseClient, t: Topic, record: (jobId: string) => Promise<boolean>, capTwd: number): Promise<void> {
  const site = await siteFor(sb, t);
  if (typeof site === "string") throw new Error(site);
  await grantFor("video.script");   // what /api/video/generate's withFeature asks before its job row
  const a = t.artifacts as TopicArtifacts;
  const d = ARTICLE_VIDEO_DEFAULTS;
  const script = { topic: t.title, articleTitle: t.title, articleContent: a.article?.source || t.angle || undefined,
    language: siteLanguage(site.defaults), brandVoice: renderSiteVoice(site.defaults), sceneCount: d.sceneCount };
  // before the job row: a topic over its cap fails here with nothing started (a pre-N2 topic counts from TOPIC_BUDGET_EPOCH).
  // Nothing of this check is kept on the row: the script's cost reaches the ledger, which the next check reads.
  await capGuard(t, { ...a }, capTwd, (startedAt) => spentSince(sb, t.id, startedAt))(stepUpperTwd.video(), "影片");
  const started = await startVideoJob(t.organization_id, {
    ...script,
    sceneCount: d.sceneCount, customScenes: d.customScenes, brollScenes: d.sceneCount - d.customScenes,
    imageModel: d.imageModel, outputFormats: [...d.formats], ...parseVoiceModel(articleVideoVoice(siteLanguage(site.defaults))),
    costJobId: t.id,
  }, { beforePrepare: record, projectFor: () => ensureTopicProject(sb, t, d.formats) });
  const failure = started.ok ? null : (started as Extract<typeof started, { ok: false }>).error;   // strict:false
  if (failure && failure !== "taken") throw new Error(`影片無法開始：${failure}`);
}

export async function pollTopicVideo(t: Topic, jobId: string): Promise<VideoPoll> {
  const { readJob } = await import("@/lib/content/video/job-store");
  const job = await readJob(jobId);   // a failed read throws: the sweep looks again instead of failing the topic
  if (!job) return { state: "error", error: "影片工作不見了（超過一小時或已清除），按重試會重做影片" };
  if (job.organizationId !== t.organization_id) throw new Error("video job of another organization");
  if (job.status === "running" && !job.euJobId && Date.now() - job.createdAt > STALE_PREPARE_MS) {
    return { state: "error", error: "影片準備做到一半中斷了" };
  }
  const r = await finalizeVideoJob(job);
  if (r.status === "running") return { state: "running" };
  if (r.status === "wrong_poller") return { state: "error", error: "影片工作不是這條管線的類型" };
  if (r.status === "error") {
    await updateTopicProject(getSupabaseWriteClient(), t.organization_id, t.id, { last_error: r.error ?? "影片渲染失敗" });
    return { state: "error", error: r.error ?? "影片渲染失敗" };
  }
  const { pickPrimaryOutput } = await import("@/lib/content/blocks/video-pipeline");
  const url = pickPrimaryOutput(r.video?.outputs ?? {});
  return url?.startsWith("https://") ? { state: "done", url } : { state: "error", error: "影片做好了但沒有可用的網址" };
}

/** The finished video into the article draft and onto the social draft, each once: every step is saved on the row as it
 *  is done, and each write also checks the outside state (the article already has the URL, the post already has media),
 *  so a restart between a write and its save does not do it twice. Before either, every time, the video passes the
 *  workbench's review and is approved (video-release.ts, N1): a topic leaves here only with a released video, also when
 *  both steps were done by an earlier attempt. One that does not pass fails the topic, nothing attached. */
export async function attachTopicVideo(t: Topic, url: string, actor: string, save: (a: Record<string, unknown>) => Promise<boolean>): Promise<Published> {
  const prev = t.artifacts as TopicArtifacts;
  const artifacts: TopicArtifacts = { ...prev, video: { ...(prev.video ?? { job_id: "" }), url } };
  const video = artifacts.video!;
  const step = async () => { if (!(await save(artifacts as Record<string, unknown>))) throw new Error("另一次排程接手了這個題目"); };
  const sb = getSupabaseWriteClient();
  try {
    if (prev.video?.url !== url) await step();   // the URL first: a retry attaches it instead of making another video
    const releaseId = await releaseTopicVideo(sb, t, url, actor);
    const a = artifacts.article;
    if (a?.wp_post_id && t.site_id && !video.embedded_at) {
      const r = await embedVideoInPost(orgIdentity(t.organization_id), { siteId: t.site_id, postId: a.wp_post_id, videoUrl: url, releaseId, once: true });
      if ("blockedMode" in r) throw new Error(`系統模式（${r.blockedMode}）不允許改網站，影片沒有嵌入`);
      if (!r.ok) throw new Error(`影片嵌入文章失敗：${(r as Extract<typeof r, { ok: false; status: number }>).error}`);   // strict:false
      video.embedded_at = new Date().toISOString();
      await step();
    }
    const s = artifacts.social;
    // each social draft (the other channels', then YouTube's own since N5a) gets the video once; one upload serves both
    for (const [postId, key] of [[s?.post_id, "media_id"], [s?.youtube_post_id, "youtube_media_id"]] as const) {
      if (!postId || video[key]) continue;
      const post = await getPost(t.organization_id, postId);
      // scheduled, submitted or deleted by a person: theirs, left as it is; media already there: an earlier attempt's
      if (post.state === "draft" && !post.media.length) {
        const mediaId = video.media_id ?? video.youtube_media_id ?? (await addVideo(t.organization_id, url, `topic-${t.id}.mp4`, actor)).id;
        await savePost(t.organization_id, post.id, post.version, {}, null, [{ media_id: mediaId, position: 0 }], actor);
        video[key] = mediaId;
      } else if (post.media.length) video[key] = post.media[0].media_id;
      if (video[key]) await step();
    }
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    await updateTopicProject(sb, t.organization_id, t.id, { last_error: why });   // the project page says why too
    throw new MakeError(why, artifacts as Record<string, unknown>);
  }
  await updateTopicProject(sb, t.organization_id, t.id, { lifecycle_stage: "review", last_error: null });   // V7.1
  return { artifacts: artifacts as Record<string, unknown> };
}

/** The real store and makers behind tickTopics, bound to one organization and the actor the work is done as. */
/** opts.capTwd: the brand's per-topic cap (content_pipeline per_topic_cap_twd, 0168); null = NT$15. Required, so no
 *  caller (the schedule, the 核准並開始 button) can make a topic under the default by leaving it out. */
export function topicDeps(sb: SupabaseClient, organizationId: string, actor: string, opts: { capTwd: number | null }): TickDeps {
  const capTwd = opts.capTwd ?? DEFAULT_TOPIC_CAP_TWD;
  const own = (t: Topic) => {
    if (t.organization_id !== organizationId) throw new Error("topic of another organization");
  };
  let zone: Promise<string | null> | undefined;   // read once per deps, i.e. once per tick (jobs.ts makes one per firing)
  return {
    now: () => new Date(),
    due: (now) => dueApproved(sb, organizationId, now, NOW_FORMATS),
    inStatus: (statuses) => inStatus(sb, organizationId, statuses),
    blocker: async (t) => {
      own(t);
      const s = await siteFor(sb, t);
      if (typeof s === "string") return s;
      if (t.formats.every((f) => f === "youtube")) {   // its video would have nowhere to go
        const yt = (await listAccounts(t.organization_id, { hydrateProfile: false })).some((a) => a.platform === "youtube" && a.status === "connected");
        if (!yt) return "還沒連上 YouTube 頻道（社群工具 › 設定 › 連接 YouTube）";
      }
      return null;
    },
    start: async (t, cap) => {
      own(t);
      zone ??= orgTimeZone(sb, organizationId);
      const tz = await zone;
      return startTopic(sb, t, brandDay(new Date(), tz), cap);   // the day read now, not at the firing's start (midnight)
    },
    move: (t, to, patch) => move(sb, t, to, patch),
    claim: (t, patch) => { own(t); return claimTopic(sb, t, patch); },
    make: (t) => { own(t); return runForOrg(organizationId, actor, () => makeDrafts(sb, t, actor, capTwd)); },
    autoPublishes: async (t) => { own(t); const s = await siteFor(sb, t); return typeof s !== "string" && autoPublishes(s.defaults); },
    publish: (t, save, fresh) => { own(t); return publishDrafts(sb, t, actor, save, fresh); },
    startVideo: (t, record) => { own(t); return runForOrg(organizationId, actor, () => startTopicVideo(sb, t, record, capTwd)); },
    pollVideo: (t, jobId) => { own(t); return pollTopicVideo(t, jobId); },
    attachVideo: (t, url, save) => { own(t); return attachTopicVideo(t, url, actor, save); },
  };
}
