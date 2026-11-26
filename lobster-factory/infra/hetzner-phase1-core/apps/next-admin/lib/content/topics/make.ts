// The server side of a topic's making (plan §3.2 generating -> drafted): the article as a WordPress draft and the social
// posts as one social draft, both for the topic's own organization, each with its rule checks. Runs inside runForOrg, so
// every AI call bills that organization as the named actor, and publishes with orgIdentity, so the WordPress write
// passes the same organization check a customer's own request does (plan I7). A part already made (kept on the row by
// an earlier failed attempt) is not made again: a retry after the social step failed does not write a second article.
// Auto publish (gated in tick.ts publishReviewed, always "now") changes those same drafts in steps (publish-steps.ts,
// N5a): the YouTube draft (its own post since N5a) is scheduled first; once YouTube's public link is back the WordPress
// draft (its video file swapped for that link first, N5b) is published through the calendar's core; then the other channels' draft gets the live article's link and is
// scheduled a moment ahead as an editor would -- a brand that requires social review gets it submitted instead. Only
// staff set a site to auto publish (sites/[id] route), so acting as editor here is that staff decision, not the
// starting person's role. YouTube's privacy is the site's youtubePrivacy, carried on the YouTube target's format.
import type { SupabaseClient } from "@supabase/supabase-js";
import { grantFor, runForOrg } from "@/lib/entitlements/grant";
import { EntitlementRequired, type Grant } from "@/lib/entitlements/can";
import { PRODUCTS } from "@/lib/portal/products";
import { orgIdentity } from "@/lib/tenant-guard";
import { loadSiteBrand, type SiteBrand } from "@/lib/content/brand-voice-store";
import { autoPublishes, forbiddenTerms, renderBrandVoice, renderSiteVoice, requiredBlocks, siteCover, siteIntroCards, siteIntroStyles, siteIntroTransition, siteLanguage, siteTextChain, youtubeFormat, type SiteContentDefaults } from "@/lib/content/brand-voice";
import { ARTICLE_CALLER, type ArticleCaller } from "@/lib/content/article/generate-core";
import { subscriptionOrgAllowed } from "@/lib/content/text-road-guard";
import { isAiTextModel } from "@/lib/ai/text-model-options";
import { introPlanFor } from "@/public/editor-shared/intro-styles.js";
import { orgDesign } from "@/lib/content/video/opener-designs";
import { updateWpPost } from "@/lib/content/publish/wp-post-core";
import { runContentPipeline, type PipelineFailure } from "@/lib/content/pipeline";
import { extractH1, parseArticleMeta } from "@/lib/content/article/meta";
import { makeContentImage } from "@/lib/content/image/make-image";
import { storeCoverOn } from "@/lib/content/cover/store";
import { SITE_COVER_SIZE, baseRatioFor, coverSizeFor, coverSizesFor, draftCoverSize, extraBaseRatios, isSiteSize, sizeKey, type CoverSize } from "@/lib/content/cover/sizes";
import type { AspectRatio, TarotModel } from "@/lib/tarot/image-gen";
import { isR2Configured } from "@/lib/storage/r2";
import { accountPlatforms, addImage, addVideo, getPost, listAccounts, savePost, type MediaInput } from "@/lib/social/store";
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
import { BRIDGE_LIVE_REFUSAL, embedVideoInPost, swapEmbeddedVideo } from "@/lib/content/video/embed-in-post";
import { releaseTopicVideo } from "./video-release";
import { ARTICLE_VIDEO_DEFAULTS, articleVideoVoice, parseVoiceModel } from "@/lib/content/video/defaults";
import { TOPIC_ARTICLE_IMAGES, TOPIC_COVER_IMAGES } from "./cost";
import { ARTICLE_IMAGE_RATIO, articleImagesOff, articleStylePrompt, scheduleImageModel, imagePlaceholders, placeholderScene } from "@/lib/content/image/article-image";
import { DEFAULT_TOPIC_CAP_TWD, reserveStep, settleStep, spentSince, stepUpperTwd, topicBudget, type TopicBudget } from "./budget";
import { usdToNtd } from "@/lib/ai/cost-calculator";
import { MakeError, NOW_FORMATS, brandDay, personAsked, waitsForVideo, type Made, type Published, type PublishRun, type TickDeps, type VideoArtifact, type VideoPoll } from "./tick";
import { publishSteps, type LinkInCommentPost, type PublishLog, type YoutubeLook } from "./publish-steps";
import { youtubeDraftMissing } from "./lanes";
import { linkInCommentChannel, linkInCommentTexts, withLinkInComment, type LinkInCommentChannel } from "@/lib/social/link-in-comment";
import { commentsOverLimit, hashtagsOverLimit, overLimit, youtubeParts } from "@/lib/social/limits";

/** N5b: the article was published by a person before 發布 reached it; its video is still the file (artifacts.publish.article.note). */
export const ARTICLE_LIVE_NOTE = "文章已先被手動發布，影片仍是原檔，沒有換成 YouTube 連結";
/** K30: the same, for an article that never held the file: it went live without YouTube's player. */
export const ARTICLE_LIVE_NO_PLAYER_NOTE = "文章已先被手動發布，沒有放進 YouTube 播放器";

/** What content_topics.artifacts holds: one entry per made part; `published` / `sent` once auto publish put it out. */
export interface TopicArtifacts {
  article?: {
    wp_post_id: number | null; wp_edit_url: string | null; seo_score: number | null; summary: string; source: string; checks: ReviewCheck[];
    /** N1b: the site's must-carry paragraphs this article's checks looked for (absent on articles made before N1b). */
    required?: string[];
    /** K10: the cover's scene, short title and subtitle from the meta block; image_url = the draft's featured image (K25:
     *  the cover layout on base_url's picture, or that picture alone when the layout failed; null = none). Absent on
     *  articles made before K10; base_url absent on those made before K25. sizes (K29) = the social drafts' other sizes
     *  (cover/sizes.ts sizeKey -> that cover, null = its layout failed, and the picture it was laid on); present (maybe
     *  empty) only when the topic had social drafts to give it to -- absent = made before K29: they get image_url. */
    cover?: { scene?: string; title?: string; subtitle?: string; image_url: string | null; base_url?: string | null;
      sizes?: CoverSizes };
    /** K27: the title the WordPress draft was saved under (its SEO title, else its H1); the cover's alt text on the social
     *  drafts. Absent on articles made before K27: the topic's title stands in. */
    title?: string;
    /** title = the title WordPress published it under (K23: the Facebook / Instagram link comment names it) */
    published?: { status: string; link: string; at: string; title?: string };
  };
  /** post_id = the draft of every channel but YouTube (null = none, or no channel the writer can write for: the checks
   *  say so); youtube_post_id = the YouTube channels' own draft (N5a; absent on a topic made before, whose post_id draft
   *  may hold YouTube too and goes out as before). link_in_comment = Facebook's and Instagram's own drafts (K23, only
   *  for a topic with an article): the link goes in their first comment; absent = made before, post_id holds them too. */
  social?: { post_id: string | null; youtube_post_id?: string | null; link_in_comment?: LinkInCommentPost[]; checks: ReviewCheck[]; sent?: { state: string; scheduled_at: string | null; at: string };
    /** K27, a topic without a video: the article's cover uploaded once (media_id) and the drafts already handled (done:
     *  given it, or left as they were because they had media of their own). Absent = not tried yet. K29: media_id = the
     *  website-size cover's upload; media_ids = each other size's (sizeKey -> upload), absent when there was none. */
    cover_media?: { media_id: string | null; done: string[]; media_ids?: Record<string, string> } };
  /** The topic's video job; url once it finished, then when it went into the article and onto each social draft. */
  video?: VideoArtifact & { embedded_at?: string; media_id?: string; youtube_media_id?: string };
  /** N5a: each publish step, recorded before and after its outside write (publish-steps.ts). */
  publish?: PublishLog;
  /** N2: when this topic's spending cap began, the cap and the spend last read (budget.ts; the ledger is the source). */
  budget?: TopicBudget;
}

/** K29: an article's cover in the social sizes other than the website's (sizeKey -> the cover and its picture). */
export type CoverSizes = Record<string, { image_url: string | null; base_url: string }>;

/** Checks the topic's cap before one paid step and reserves the step's most (budget.ts reserveStep); `exact` (the name "settle" is kept for wallet holds: lib/ai/__tests__/settle-through-ledger.test.ts) swaps a
 *  reservation for the call's exact cost once known (0 = the call failed: whatever it was billed is in the ledger, which
 *  every check reads). A reservation not settled stays counted (its ledger row may lag). */
type Guard = ((upperTwd: number, step: string) => Promise<void>) & { exact(reservedTwd: number, actualTwd: number): void };

/** The social post is due this far ahead (state.ts schedule needs a future time; the sender looks 10 min ahead). */
export const SOCIAL_NOW_LEAD_MS = 2 * 60_000;

export { TOPIC_ARTICLE_IMAGES };   // defined in cost.ts (the price counts the same images)

/** Each image placeholder becomes a stored image or is removed; nothing unresolved reaches WordPress. The picture is drawn
 *  from the placeholder's scene (K10), else its alt text (a draft before K10, a model that wrote none); the image keeps
 *  only the alt text. At most `max` are made (the count the topic's cap reserved, N2): placeholders past it are removed,
 *  never paid for. */
export async function fillArticleImages(markdown: string, make: (scene: string) => Promise<string | null>, max = TOPIC_ARTICLE_IMAGES): Promise<{ markdown: string; images: string[] }> {
  const urls: Array<string | null> = [];
  for (const m of markdown.matchAll(imagePlaceholders())) {
    // one at a time: Replicate's low-balance burst limit is 1
    urls.push(urls.length < max ? await make(placeholderScene(m) || m[1].trim()).catch(() => null) : null);
  }
  const images: string[] = [];
  let i = 0;
  const filled = markdown.replace(imagePlaceholders(), (_all, alt: string) => {
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
 *  images = how many placeholders to ask for (0 when the organization has no content.image). The site's text road (K7)
 *  rides along only when set: a site without one gets exactly the input it got before (API only, default model). */
export function articleInput(t: Pick<Topic, "keyword" | "title" | "angle">, d: SiteContentDefaults, images = 0): Record<string, unknown> {
  // the model name only tells the writer images are wanted; makeArticle draws them on the same scheduleImageModel
  const details = [renderBrandVoice(d.marketing, d.brandVoiceInstructions), t.angle ? `切入角度：${t.angle}` : "", requiredBlocks(d).length ? `文末逐字附上以下段落，一字不改，每段自成一段：\n${requiredBlocks(d).join("\n\n")}` : ""].filter(Boolean).join("\n\n");
  const chain = siteTextChain(d);
  return {
    keyword: t.keyword, title: t.title, language: siteLanguage(d), targetCountry: d.targetCountry, tone: d.tone,
    articleType: d.articleType, readability: d.readability, pointOfView: d.pointOfView, details, generateMeta: true,
    media: images > 0 ? { aiImages: scheduleImageModel(d), imageCount: images, imageSize: ARTICLE_IMAGE_RATIO } : { aiImages: "none" },
    ...(isAiTextModel(d.textApiModel) ? { model: d.textApiModel } : {}),
    ...(chain !== "api" ? { chain, ...(typeof d.textClaudeModel === "string" ? { claudeModel: d.textClaudeModel } : {}),
      ...(typeof d.textCodexModel === "string" ? { codexModel: d.textCodexModel } : {}) } : {}),
  };
}

const COST_ROUTES = ["content/article-generate", "content/fetchRealSources"];

/** The article generator's text and what its call was billed. generate-core appends [COST_JSON] lines after the text
 *  (the search's, then the model's: content/fetchRealSources, content/article-generate; a subscription answer is usd 0)
 *  -- they are for the browser's cost display and must never reach WordPress (before K7 they did: they became the
 *  draft's last paragraph). The trailing run of such lines is cut off; only the last model line and the last search
 *  line in it are counted, so a cost line the model wrote into its own text is never billed.
 *  billedTwd null = no model cost line (the call wrote none): the reservation then stands. */
export function splitArticleCost(raw: string): { markdown: string; billedTwd: number | null } {
  const lines = raw.trimEnd().split("\n");
  let model: number | null = null, search: number | null = null;
  while (lines.length) {
    const line = lines[lines.length - 1].trim();
    if (!line.startsWith("[COST_JSON]")) break;
    let c: { usd?: unknown; route?: unknown };
    try { c = JSON.parse(line.slice("[COST_JSON]".length)); } catch { break; }
    if (!COST_ROUTES.includes(String(c.route))) break;
    const n = Number(c.usd);
    if (Number.isFinite(n) && n >= 0) {
      if (c.route === "content/article-generate") model ??= n; else search ??= n;
    }
    lines.pop();
  }
  return { markdown: lines.join("\n").trimEnd(), billedTwd: model === null ? null : usdToNtd(model + (search ?? 0)) };
}

/** K7: all of a scheduled article's subscription segments together get at most this long, then the API writes it. */
export const SCHEDULE_SUB_BUDGET_MS = 120_000;
/** What the API article needs after the subscriptions gave up, kept out of a tick's remaining time (PLAN I5): a tick
 *  with less left than this tries no subscription at all. */
export const API_ARTICLE_RESERVE_MS = 90_000;

/** How long the subscription segments may take: the cap, or what the tick has left beyond the API's reserve, whichever is
 *  less (`deadline` = when the tick's budget ends; none = a person's start, run after the response). 0 = try none. */
export function subBudgetMs(deadline: number | undefined, now: number): number {
  if (deadline === undefined) return SCHEDULE_SUB_BUDGET_MS;
  return Math.max(0, Math.min(SCHEDULE_SUB_BUDGET_MS, deadline - now - API_ARTICLE_RESERVE_MS));
}

/** Why this topic cannot be made now (no site, an inactive one, another organization's); null = it can. */
async function siteFor(sb: SupabaseClient, t: Topic): Promise<SiteBrand | string> {
  if (!t.site_id) return "題目沒有指定網站";
  const site = await loadSiteBrand(sb, t.site_id);
  if (!site) return "題目的網站不存在或已停用";
  if (site.organizationId !== t.organization_id) return "題目的網站不屬於這個客戶";
  return site;
}

/** Who makes the topic (K7, PLAN I1/I2): "schedule" = the content_pipeline job, whose subscription segments run on the
 *  host's worker; "person" = someone pressed start, so they run on the owner lane, which generate-core gives only the
 *  owner herself (anyone else gets the API alone). */
export type TopicMaker = "schedule" | "person";

async function makeArticle(t: Topic, site: SiteBrand, guard: Guard, maker: TopicMaker, deadline?: number): Promise<NonNullable<TopicArtifacts["article"]>> {
  // no R2 = nowhere to keep an image WordPress can fetch, so none is paid for
  // a site whose schedule images are "None（不生成）" gets none either (K10); K26: the schedule's own source first
  const imageModel = scheduleImageModel(site.defaults);
  const imageGrant = isR2Configured() && !articleImagesOff(imageModel) ? await optionalImageGrant() : null;
  const imageCount = imageGrant ? TOPIC_ARTICLE_IMAGES : 0;
  // The subscriptions run only for the operator's own organization (I1: never for a customer's site, whoever made the
  // road), and only with time left for the API after them (I5); otherwise the site's road is read as API only.
  const budgetMs = subBudgetMs(deadline, Date.now());
  const subs = siteTextChain(site.defaults) !== "api" && budgetMs > 0 && await subscriptionOrgAllowed(t.organization_id);
  const defaults: SiteContentDefaults = subs ? site.defaults : { ...site.defaults, textChain: undefined, textClaudeModel: undefined, textCodexModel: undefined };
  // _jobId: the article call's ai_call_logs row carries the topic id (generate-core prepareArticleGeneration)
  const caller: ArticleCaller = { ...(maker === "schedule" ? { lane: "schedule" as const } : {}), subBudgetMs: budgetMs };
  const input = { ...articleInput(t, defaults, imageCount), _jobId: t.id, ...(subs ? { [ARTICLE_CALLER]: caller } : {}) };
  // K10: the images on the site's model and style, body + cover reserved together
  const coverCount = imageGrant ? TOPIC_COVER_IMAGES : 0;
  // K29: the sizes its social drafts take the cover in; a base picture more only for a picture area the website's lacks
  const socialSizes = coverCount ? await socialCoverSizes(t) : [];
  const road = { textChain: defaults.textChain, textApiModel: defaults.textApiModel, imageModel };
  const upper = stepUpperTwd.article(imageCount + coverCount + extraBaseRatios(socialSizes).length, road);
  await guard(upper, "文章");
  const a = await runContentPipeline(input, { stages: ["article"] });
  if (!a.ok) throw new Error(`文章生成失敗：${(a as PipelineFailure).error}`);   // strict:false: !ok does not narrow
  // the cost lines are cut off here: every step after this one gets the article text alone
  const { markdown: article, billedTwd } = splitArticleCost(a.markdown ?? "");
  // a road with subscriptions: the article call's own cost replaces its reservation (a subscription answer = 0, the API
  // fallback = what it was billed); the images part stays until they are made. An API-only site keeps the estimate, as before.
  if (subs && billedTwd !== null) guard.exact(upper, billedTwd + (upper - stepUpperTwd.article(0, road)));
  const imageStyle = articleStylePrompt(site.defaults.imageStyle);
  const draw = async (scene: string, aspectRatio: AspectRatio = ARTICLE_IMAGE_RATIO) => {
    if (!imageGrant) return null;
    const img = await makeContentImage({ model: imageModel as TarotModel, prompt: scene || t.title,
      aspectRatio, seed: null, imageStyle, purpose: "article",
      costLog: { route: "content/topics", tool: "content", jobId: t.id } }, imageGrant);
    // WordPress takes only http(s) images: an unstored (data URL) image would vanish at publish
    return img.ok && (img as { stored: boolean }).stored ? (img as { imageUrl: string }).imageUrl : null;
  };
  const { markdown, images } = await fillArticleImages(article, (scene) => draw(scene), imageCount);
  const meta = parseArticleMeta(markdown);
  // the cover: its own picture from its own scene, at the website size's picture area = 16:9 (before K10 the first body
  // image stood in for it)
  const cover = meta?.cover;
  const scene = cover?.scene || meta?.seoTitle || t.title, coverTitle = cover?.title || meta?.seoTitle || t.title;
  const baseUrl = coverCount ? await draw(scene, baseRatioFor(SITE_COVER_SIZE)).catch(() => null) : null;
  const laid = coverCount ? await layCover(baseUrl, images[0] ?? null, coverTitle, cover?.subtitle, siteCover(site.defaults)) : null;
  const channel = laid?.base && socialSizes.length
    ? await layChannelCovers(socialSizes.filter((x) => !isSiteSize(x)), laid.base, (ratio) => draw(scene, ratio), coverTitle, cover?.subtitle, siteCover(site.defaults))
    : null;
  const p = await runContentPipeline({
    markdown, focusKeyword: meta?.focusKeyword || t.keyword, seoTitle: meta?.seoTitle, metaDescription: meta?.metaDesc,
    categories: meta?.categories, tags: meta?.tags, slug: meta?.slug, siteId: t.site_id, publishStatus: "draft", featuredImageUrl: laid?.url ?? undefined,
    request: orgIdentity(t.organization_id),
  }, { stages: ["quality", "publish"] });
  if (!p.ok) throw new Error(`WordPress 草稿失敗（${(p as PipelineFailure).failedStage}）：${(p as PipelineFailure).error}`);
  const report = p.qualityReport ?? null;
  return {
    wp_post_id: p.publish?.post_id ?? null, wp_edit_url: p.publish?.edit_url ?? null, seo_score: report?.score ?? null,
    summary: meta?.metaDesc || t.title,
    title: meta?.seoTitle?.trim() || extractH1(markdown) || t.title,   // as wordpress-core names the draft
    // what the social writer reads (it uses the first 3000 characters), kept so a retry can write posts without the article
    source: markdown.replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "").trim().slice(0, 3000),
    checks: [...articleChecks(markdown, report, forbiddenTerms(site.defaults), requiredBlocks(site.defaults)), ...(laid?.note ? [laid.note] : []), ...(channel?.notes ?? [])],
    required: requiredBlocks(site.defaults),
    ...(laid ? { cover: { ...cover, image_url: laid.url, base_url: laid.base, ...(channel ? { sizes: channel.sizes } : {}) } } : {}),
  };
}

/** K25: the article's featured image = the one cover layout (lib/content/cover) on the cover picture, or on the first
 *  body image when the cover picture was not made. Never fails the article: a layout that fails leaves the plain picture,
 *  no picture at all leaves none, and each says so as a passing check (a note on the topic, not a reason to hold it). */
export async function layCover(coverUrl: string | null, firstBodyUrl: string | null, title: string, subtitle: string | undefined,
  settings: ReturnType<typeof siteCover>): Promise<{ url: string | null; base: string | null; note?: ReviewCheck }> {
  const note = (detail: string): ReviewCheck => ({ name: "cover", pass: true, detail });
  const base = coverUrl ?? firstBodyUrl;
  if (!base) return { url: null, base: null, note: note("沒有精選圖片：封面底圖和內文圖都沒有生成") };
  const fallback = coverUrl ? undefined : "封面底圖改用內文第一張";
  try {
    const url = await storeCoverOn(base, { title, ...(subtitle ? { subtitle } : {}) }, settings);
    return { url, base, ...(fallback ? { note: note(fallback) } : {}) };
  } catch (e) {
    const why = `封面未套版（${e instanceof Error ? e.message : String(e)}），精選圖片用沒有字的底圖`;
    return { url: base, base, note: note(fallback ? `${fallback}；${why}` : why) };
  }
}

/** K29: the sizes this topic's social drafts take its cover in, from the channels makeSocial will write for, grouped as
 *  it groups them (draftGroups). None for a topic with a video (the video goes on its drafts) or without social posts;
 *  YouTube's draft never takes a picture. */
async function socialCoverSizes(t: Topic): Promise<CoverSize[]> {
  if (waitsForVideo(t) || !t.formats.includes("social")) return [];
  const accounts = (await listAccounts(t.organization_id, { hydrateProfile: false }))
    .filter((a) => a.status === "connected" && topicTargets(t.formats, a.platform));
  const g = draftGroups(accounts, true);
  return coverSizesFor([g.other, g.facebook, g.instagram].map((x) => x.map((a) => a.platform)));
}

/** K29: the cover in each social size besides the website's, on the base picture its picture area needs -- drawn once
 *  per ratio (drawBase), shared by every size on it; a size on the website's ratio uses the website's base. A base not
 *  drawn: the website's base, cover-fitted in; a layout that fails: null (that size's drafts get the website's cover).
 *  Each fallback is a passing check. */
export async function layChannelCovers(sizes: readonly CoverSize[], siteBase: string, drawBase: (ratio: AspectRatio) => Promise<string | null>,
  title: string, subtitle: string | undefined, settings: ReturnType<typeof siteCover>): Promise<{ sizes: CoverSizes; notes: ReviewCheck[] }> {
  const notes: ReviewCheck[] = [];
  const note = (detail: string) => { notes.push({ name: "cover", pass: true, detail }); };
  const bases = new Map<AspectRatio, string>();
  for (const ratio of extraBaseRatios(sizes)) {
    const url = await drawBase(ratio).catch(() => null);
    if (url) bases.set(ratio, url);
    else note(`社群封面（${sizes.filter((x) => baseRatioFor(x) === ratio).map(sizeKey).join("、")}）的 ${ratio} 底圖沒有生成，改用網站封面的底圖裁進去`);
  }
  const out: CoverSizes = {};
  for (const size of sizes) {
    const base = bases.get(baseRatioFor(size)) ?? siteBase;
    try {
      out[sizeKey(size)] = { image_url: await storeCoverOn(base, { title, ...(subtitle ? { subtitle } : {}) }, settings, size), base_url: base };
    } catch (e) {
      out[sizeKey(size)] = { image_url: null, base_url: base };
      note(`社群封面 ${sizeKey(size)} 未套版（${e instanceof Error ? e.message : String(e)}），這個尺寸的頻道附網站封面`);
    }
  }
  return { sizes: out, notes };
}

/** YouTube channels for every topic with a video (K30: they need its video); the other channels only for social. */
export const topicTargets = (formats: readonly string[], platform: string) =>
  platform === "youtube" ? formats.includes("video") : formats.includes("social");

/** K30: a video goes out only on YouTube (the article carries YouTube's player, never the file): a brand with no YouTube
 *  channel connected stops the topic (failed, the schedule's stop notice), nothing made or sent; 重試 goes on from here. */
export const NO_YOUTUBE_TEXT = "這個網站沒有連 YouTube 頻道，請到社群連上 YouTube 後按重試";
async function youtubeChannels(orgId: string) {
  const yt = (await listAccounts(orgId, { hydrateProfile: false })).filter((a) => a.status === "connected" && a.platform === "youtube");
  if (!yt.length) throw new Error(NO_YOUTUBE_TEXT);
  return yt;
}

/** K30b: every paid feature a topic's making asks, the one list both starts check: the article (makeArticle), the
 *  social and YouTube texts (makeSocial), the video's script (startTopicVideo). content.image is an add-on, never a
 *  reason to stop (optionalImageGrant). */
export function topicFeatures(formats: readonly string[]): string[] {
  const keys: string[] = [];
  if (formats.includes("article")) keys.push("content.article");
  if (formats.includes("social") || formats.includes("video")) keys.push("content.syndicate");
  if (formats.includes("video")) keys.push("video.script");
  return keys;
}

/** K30b: the first of the topic's features the organization cannot use now, as the topic's note; null = it can use all.
 *  Asked exactly as the making asks them (runForOrg + grantFor, so the same verdict, shadow included): a verdict only,
 *  no usage row (only a paid seam's Grant.recordUse writes one). */
async function missingFeature(organizationId: string, actor: string, formats: readonly string[]): Promise<string | null> {
  return runForOrg(organizationId, actor, async () => {
    for (const key of topicFeatures(formats)) {
      try { await grantFor(key); } catch (e) {
        // a lookup that failed is not a refusal: thrown, so the button answers 500 and the schedule retries next firing
        if (!(e instanceof EntitlementRequired) || e.code === "infrastructure_error") throw e;
        const name = PRODUCTS.flatMap((p) => p.features).find((f) => f.feature_key === key)?.name ?? key;
        return `這個帳號沒有「${name}」權限（${key}），題目沒有開始，也沒有花錢；開通後再核准`;
      }
    }
    return null;
  });
}

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
  // YouTube is its own draft (N5a): it goes out first and the article waits for its link; Facebook and Instagram each
  // their own when an article's link will come (K23: the link goes in the post's comment, which is the whole post's);
  // every other channel shares one
  const fields = { body: socialBody(article?.summary, t.title, w.language), notes: `自動內容管線：題目「${t.title}」` };
  const groups = draftGroups(accounts, t.formats.includes("article"));
  const made: string[] = [];
  const draft = async (group: typeof accounts, format?: string) => {
    if (!group.length) return null;
    const id = (await savePost(t.organization_id, null, null, fields,
      group.map((a) => ({ account_id: a.id, custom_body: custom[a.id] ?? null, ...(format ? { format } : {}) })), null, actor)).id;
    made.push(id);
    return id;
  };
  let postId: string | null, youtubePostId: string | null;
  const linkInComment: LinkInCommentPost[] = [];
  try {
    postId = await draft(groups.other);
    for (const channel of ["facebook", "instagram"] as const) {
      const id = await draft(groups[channel]);
      if (id) linkInComment.push({ post_id: id, channel });
    }
    youtubePostId = await draft(groups.youtube, youtubeFormat(site.defaults));
  } catch (e) {
    // the topic records none of the drafts (this throws): those made go to the trash, or a retry would leave them behind
    for (const id of made) {
      await getPost(t.organization_id, id)
        .then((p) => applyAction(t.organization_id, p, "delete", "editor", {}, actor, { source: "content_pipeline", topic_id: t.id }))
        .catch((d) => console.error(`[content/topics] ${t.id} social draft ${id} left behind: ${d instanceof Error ? d.message : d}`));
    }
    throw e;
  }
  const texts = Object.values(custom);
  const problems = [...w.tooLong.map((x) => `${x.key} 太長（${x.length}/${x.limit}）`), ...w.missing.map((k) => `${k} 沒有寫出來`),
    ...w.wrongLanguage.map((k) => `${k} 不是${w.language}，沒有採用`)];
  if (!problems.length && texts.length < accounts.length) problems.push(`${accounts.length - texts.length} 個頻道沒有專屬貼文`);
  return { post_id: postId, ...(youtubePostId ? { youtube_post_id: youtubePostId } : {}), ...(linkInComment.length ? { link_in_comment: linkInComment } : {}),
    checks: socialChecks({ texts, channels: accounts.length, problems }, forbidden) };
}

/** K30: a video topic made before every video went to YouTube has no YouTube draft. It gets one here, before its first
 *  publish step (publishDrafts) or on 重試 (makeDrafts): no AI call and nothing spent -- the article's title as the video's
 *  title and its summary as the description, text the article's own checks already passed -- and the video when there is
 *  one (the upload its other drafts got, else a new one); publish-steps then sends YouTube first and the article gets
 *  YouTube's player. No channel: throws NO_YOUTUBE_TEXT. `step` saves the row once the draft exists, before its video
 *  goes on (a rerun writes no second one). Returns whether anything changed. */
export async function ensureYoutubeDraft(t: Topic, site: SiteBrand, artifacts: TopicArtifacts, actor: string, step: () => Promise<void>): Promise<boolean> {
  const s = artifacts.social;
  if (!youtubeDraftMissing({ formats: t.formats, artifacts: artifacts as Record<string, unknown> })) return false;
  // made before N5a with YouTube inside the one shared draft: it goes out there, as before (a second draft = posted twice)
  if (s?.post_id) {
    const shared = await getPost(t.organization_id, s.post_id);
    if ([...(await accountPlatforms(t.organization_id, shared.targets.map((x) => x.account_id))).values()].includes("youtube")) return false;
  }
  const accounts = await youtubeChannels(t.organization_id);
  const title = artifacts.article?.title || t.title;
  const text = `${title}\n\n${artifacts.article?.summary ?? ""}`.trim();
  const problem = youtubeParts(text).problem;
  if (problem) throw new Error(`YouTube 草稿沒有建：${problem}（什麼都沒發）`);
  const base = s ?? { post_id: null, checks: [] };
  const id = (await savePost(t.organization_id, null, null, { body: text, notes: `自動內容管線：題目「${t.title}」` },
    accounts.map((a) => ({ account_id: a.id, custom_body: null, format: youtubeFormat(site.defaults) })), null, actor)).id;
  artifacts.social = { ...base, youtube_post_id: id };
  await step();
  const url = artifacts.video?.url;
  if (url) {
    const video = { ...artifacts.video!, url };
    artifacts.video = video;
    await attachToDrafts(t.organization_id, [{ postId: id, done: () => video.youtube_media_id, record: (m) => { video.youtube_media_id = m; } }],
      () => video.media_id ?? base.link_in_comment?.find((p) => p.media_id)?.media_id,
      async () => (await addVideo(t.organization_id, url, `topic-${t.id}.mp4`, actor)).id, (mediaId) => ({ media_id: mediaId, position: 0 }), actor, step);
  }
  return true;
}

/** Which draft each channel goes in (makeSocial): YouTube its own; Facebook and Instagram their own only when the topic
 *  has an article (its link is what goes in their comment), otherwise with the rest. */
export function draftGroups<A extends { platform: string }>(accounts: A[], withArticle: boolean): Record<"other" | "youtube" | LinkInCommentChannel, A[]> {
  const g: Record<"other" | "youtube" | LinkInCommentChannel, A[]> = { other: [], youtube: [], facebook: [], instagram: [] };
  for (const a of accounts) {
    const channel = withArticle ? linkInCommentChannel(a.platform) : null;
    g[a.platform === "youtube" ? "youtube" : channel ?? "other"].push(a);
  }
  return g;
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

async function makeDrafts(sb: SupabaseClient, t: Topic, actor: string, capTwd: number, maker: TopicMaker, deadline?: number): Promise<Made> {
  const site = await siteFor(sb, t);
  if (typeof site === "string") throw new Error(site);
  const artifacts: TopicArtifacts = { ...(t.artifacts as TopicArtifacts) };
  const guard = capGuard(t, artifacts, capTwd, (startedAt) => spentSince(sb, t.id, startedAt));
  const spentAtStart = artifacts.budget!.spentTwd;
  try {
    if (waitsForVideo(t)) await youtubeChannels(t.organization_id);   // K30: before anything is paid for
    if (t.formats.includes("article") && !artifacts.article) artifacts.article = await makeArticle(t, site, guard, maker, deadline);
    if ((t.formats.includes("social") || t.formats.includes("video")) && !artifacts.social) artifacts.social = await makeSocial(t, site, artifacts.article, actor, guard);
    // a topic made before K30, or a retry after its YouTube channel was connected: the draft its first making left out
    await ensureYoutubeDraft(t, site, artifacts, actor, async () => {});
    // K27: the cover is laid in makeArticle, the social drafts made after it; here both exist (also on a retry, and for a
    // topic made before K27 that runs this step again)
    await attachTopicCover(t, artifacts, actor);
  } catch (e) {
    // a failed attempt keeps none of its own reservations (budget.ts header): what it was billed is in the ledger, which
    // the retry's first check reads, so a refusal or a WordPress failure does not hold back money never spent
    artifacts.budget = { ...artifacts.budget!, spentTwd: spentAtStart };
    throw new MakeError(e instanceof Error ? e.message : String(e), artifacts as Record<string, unknown>);
  }
  const checks = [...(artifacts.article?.checks ?? []), ...(artifacts.social?.checks ?? [])];
  return { artifacts: artifacts as Record<string, unknown>, review: reviewOf(checks, new Date()) };
}

/** The topic's social draft: the article's link, then scheduled (or submitted, when the brand requires social review).
 *  linkInComment (K23, Facebook's / Instagram's own draft): no link_url (composeText would put the address in the
 *  text); the channel's ending goes under the text and its comment first, written on the draft before it goes out. */
async function sendSocial(t: Topic, postId: string, link: string | undefined, now: Date, actor: string, language: string,
  linkInComment?: { channel: LinkInCommentChannel; title: string | undefined }): Promise<NonNullable<NonNullable<TopicArtifacts["social"]>["sent"]>> {
  let post = await getPost(t.organization_id, postId);
  // a person already scheduled, submitted or deleted it: theirs, left as it is
  if (post.state !== "draft") return { state: post.state, scheduled_at: post.scheduled_at, at: now.toISOString() };
  if (linkInComment) {
    if (link) {
      // the title WordPress published it under; an article published before K23 recorded none: the topic's title
      const { ending, comment } = linkInCommentTexts(linkInComment.channel, language, linkInComment.title || t.title, link, post.link_utm);
      const next = withLinkInComment(post, ending, comment);
      if (next) {
        // checked before the write, as the editor's save checks (posts.ts): too long is refused, never cut
        const platforms = await accountPlatforms(t.organization_id, post.targets.map((x) => x.account_id));
        const targets = (next.targets ?? post.targets).map((x) => ({ accountId: x.account_id, platform: platforms.get(x.account_id) ?? "", customBody: x.custom_body }));
        const commentBodies = (next.comments ?? post.comments).map((c) => c.body);
        const long = [...overLimit(next.body, targets), ...commentsOverLimit(commentBodies, targets),
          ...hashtagsOverLimit(targets.map((x) => ({ accountId: x.accountId, platform: x.platform, text: x.customBody ?? next.body })), commentBodies)];
        if (long.length) throw new Error(`${linkInComment.channel === "facebook" ? "Facebook" : "Instagram"} 貼文加上文章連結的結尾或留言後超過字數或主題標籤上限，沒有排程（草稿還在，請到社群草稿縮短）`);
        const saved = await savePost(t.organization_id, post.id, post.version, { body: next.body }, next.targets, null, actor,
          next.comments ? { comments: next.comments } : {});
        post = { ...post, version: saved.version };
      }
    }
  } else if (link && !post.link_url) {
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
    // C: made before the title-spacing check (its stored checks have none) = never checked, so not out by itself; a
    // person's press is the check (they saw the title)
    if (!personAsked(t.artifacts) && !(a.checks ?? []).some((c) => c.name === "title_spacing"))
      throw new MakeError("這篇文章做好時還沒有「標題空格」檢查，沒有自動發布；看過標題後按「發布」（草稿還在）", t.artifacts);
  }
  // K30: an older video topic gets its YouTube draft before its first step goes out (ensureYoutubeDraft)
  const log = (t.artifacts as TopicArtifacts).publish ?? {};
  if (!log.youtube && !log.article && youtubeDraftMissing(t)) {
    const artifacts: TopicArtifacts = { ...(t.artifacts as TopicArtifacts) };
    const step = async () => { if (!(await save(artifacts as Record<string, unknown>))) throw new Error("另一次排程接手了這個題目"); };
    try {
      const changed = await ensureYoutubeDraft(t, site, artifacts, actor, step);
      if (changed) { await step(); t = { ...t, artifacts: artifacts as Record<string, unknown> }; }
    } catch (e) {
      throw new MakeError(e instanceof Error ? e.message : String(e), artifacts as Record<string, unknown>);
    }
  }
  return publishSteps(t, {
    now: () => new Date(),
    sendPost: (postId, link, now, linkInComment) => sendSocial(t, postId, link, now, actor, siteLanguage(site.defaults), linkInComment),
    lookYoutube: (postId) => lookYoutube(t.organization_id, postId),
    publishArticle: async (wpPostId, youtubeUrl) => {
      if (!t.site_id) throw new Error("沒有 WordPress 草稿編號，無法發布");
      let note: string | undefined;
      const video = (t.artifacts as TopicArtifacts).video;
      // K30: YouTube's player goes into the article now that YouTube is live (the article never held the file); an
      // article made before K30 has the file embedded: it is swapped for the player (N5b)
      if (youtubeUrl && video?.url && !video.embedded_at) {
        const e = await embedVideoInPost(orgIdentity(t.organization_id), { siteId: t.site_id, postId: wpPostId, videoUrl: youtubeUrl, once: true });
        if ("blockedMode" in e) throw new Error(`系統模式（${e.blockedMode}）不允許改網站，文章沒有發布`);
        const f = e as { ok: boolean; error?: string };   // strict:false
        // a person already published it (the bridge edits no live post): out as it is, the topic says so, the next steps go on
        if (!f.ok && f.error === BRIDGE_LIVE_REFUSAL) note = ARTICLE_LIVE_NO_PLAYER_NOTE;
        else if (!f.ok) throw new Error(`YouTube 影片沒插進文章，沒有發布：${f.error}`);
      } else if (youtubeUrl && video?.url && video.embedded_at) {
        const s = await swapEmbeddedVideo(orgIdentity(t.organization_id), { siteId: t.site_id, postId: wpPostId, fromUrl: video.url, to: { youtubeUrl } });
        if ("blockedMode" in s) throw new Error(`系統模式（${s.blockedMode}）不允許改網站，文章沒有發布`);
        // no video file in the article any more (a person removed it), or a person already published it (live: it is
        // out as it is, the next steps go on): said in the log; anything else stops before the article goes live
        const f = s as { ok: boolean; error?: string; notFound?: true; live?: true };   // strict:false
        if (!f.ok && !f.notFound && !f.live) throw new Error(`文章的影片沒換成 YouTube 連結，沒有發布：${f.error}`);
        if (!f.ok) console.warn(`[content/topics] ${t.id} article ${wpPostId}: ${f.live ? ARTICLE_LIVE_NOTE : f.error}`);
        // a live article is left as it is (swapEmbeddedVideo never edits one): the topic says so, or nobody would know
        if (!f.ok && f.live) note = ARTICLE_LIVE_NOTE;
      }
      const r = await updateWpPost(orgIdentity(t.organization_id), t.site_id, wpPostId, { status: "publish" });
      if (!r.ok) throw new Error(`WordPress 發布失敗：${(r as Extract<typeof r, { ok: false }>).error}`);   // strict:false
      return { status: r.post.status, link: r.post.link, ...(r.post.title ? { title: r.post.title } : {}), ...(note ? { note } : {}) };
    },
  }, save, fresh);
}

/** A video job row older than this with nothing submitted is a prepare that died (a prepare takes under ~100s). */
export const STALE_PREPARE_MS = 15 * 60 * 1000;

/** Card R2: how many videos the site's topics started before this one (its intro style is that count's turn,
 *  introStyleFor); a failed count = 0 (the intro is decoration, never a reason to stop the video). */
export async function siteVideosMade(sb: SupabaseClient, t: Pick<Topic, "id" | "site_id">): Promise<number> {
  if (!t.site_id) return 0;
  const { count, error } = await sb.from("content_topics").select("id", { count: "exact", head: true })
    .eq("site_id", t.site_id).not("artifacts->video", "is", null).neq("id", t.id);
  if (error) console.warn(`[content/topics] ${t.id} video count for the intro failed: ${error.message}`);
  return error ? 0 : count ?? 0;
}

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
  const styles = siteIntroStyles(site.defaults);
  const plan = styles.length ? introPlanFor(styles, siteIntroCards(site.defaults), await siteVideosMade(sb, t)) : null;
  const introStyle = plan?.style ?? null;
  // card R3: a banner card's picture, of this topic's organization only; gone (deleted) = null -> no intro, a note
  let introCard: string | null | undefined, introCardProblem: string | undefined;
  if (plan?.card) {
    try { introCard = (await orgDesign(sb, t.organization_id, plan.card))?.url ?? null; }
    catch (e) { introCard = null; introCardProblem = `橫幅字卡讀取失敗（${e instanceof Error ? e.message : String(e)}），這一輪沒有加片頭`; }
  }
  const started = await startVideoJob(t.organization_id, {
    ...script,
    sceneCount: d.sceneCount, customScenes: d.customScenes, brollScenes: d.sceneCount - d.customScenes,
    imageModel: d.imageModel, outputFormats: [...d.formats], ...parseVoiceModel(articleVideoVoice(siteLanguage(site.defaults))),
    costJobId: t.id, introStyle, introTransition: siteIntroTransition(site.defaults), ...(introCard !== undefined ? { introCard, introCardProblem } : {}),
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

/** One draft a topic's media goes on: done = what it recorded (absent = not handled yet); record(mediaId, ours): ours =
 *  the upload went on it, otherwise it already had media (an earlier attempt's, or a person's own) and keeps it. */
type MediaDraft = { postId: string | null | undefined; done: () => string | undefined; record: (mediaId: string, ours: boolean) => void };

/** The topic's video (attachTopicVideo) or cover (attachTopicCover) onto its social drafts: one upload serves them all,
 *  each draft records its own and is saved (step) before the next. Scheduled, submitted or deleted by a person: theirs,
 *  left as it is; media already there (an earlier attempt's, or a person's own): kept, never replaced -- so a rerun adds
 *  nothing twice. */
async function attachToDrafts(orgId: string, drafts: MediaDraft[], uploaded: () => string | null | undefined, upload: () => Promise<string>,
  media: (mediaId: string) => MediaInput, actor: string, step: () => Promise<void>): Promise<void> {
  for (const d of drafts) {
    if (!d.postId || d.done()) continue;
    const post = await getPost(orgId, d.postId);
    if (post.state === "draft" && !post.media.length) {
      const mediaId = uploaded() || await upload();
      await savePost(orgId, post.id, post.version, {}, null, [media(mediaId)], actor);
      d.record(mediaId, true);
    } else if (post.media.length) d.record(post.media[0].media_id, false);
    if (d.done()) await step();
  }
}

/** K27: a topic with an article and no video gets the article's laid-out cover (K25, artifacts.article.cover.image_url) on
 *  its social drafts -- the other channels' and Facebook's / Instagram's own (K23); never YouTube's, which takes a video
 *  only. Alt text = the article's title. No cover, or the upload fails: nothing attached, and a check says the posts have
 *  no picture -- failing only while an Instagram draft is left without one (Postiz refuses an Instagram post without
 *  media: instagram.provider.ts checkValidity "Should have at least one media"), so it waits for a person instead of
 *  failing at send. Never fails the topic. Recorded on artifacts.social.cover_media; the row is saved when the step ends.
 *  K29: each draft gets the cover in its channels' size (cover/sizes.ts draftCoverSize), one upload per size; a size
 *  whose cover is missing gets the website's; a topic made before K29 (no cover.sizes) gets the website's on every draft.
 *  Channels given a size not their own are named in a passing check. */
export async function attachTopicCover(t: Pick<Topic, "id" | "organization_id" | "title" | "formats">, artifacts: TopicArtifacts, actor: string): Promise<void> {
  const a = artifacts.article, s = artifacts.social;
  if (!a || !s || waitsForVideo(t)) return;
  const ids = [s.post_id, ...(s.link_in_comment ?? []).map((p) => p.post_id)].filter((id): id is string => !!id);
  if (!ids.length) return;
  const SITE = sizeKey(SITE_COVER_SIZE);
  const prev = s.cover_media;
  const uploads: Record<string, string> = { ...(prev?.media_ids ?? {}), ...(prev?.media_id ? { [SITE]: prev.media_id } : {}) };
  const done = [...(prev?.done ?? [])], given = new Set<string>();
  const url = a.cover?.image_url ?? null;
  const alt = a.title || t.title;
  const off = new Map<string, string>();   // draft -> its channels given a size not their own
  let problem = url ? null : "文章沒有封面";
  if (url) {
    try {
      const bySize = new Map<string, { url: string; ids: string[] }>();
      for (const postId of ids.filter((id) => !done.includes(id))) {
        const c = a.cover?.sizes ? await draftCover(t.organization_id, postId, url, a.cover.sizes) : { key: SITE, url, off: [] };
        if (c.off.length) off.set(postId, `${c.off.join("、")} 用了 ${c.key.replace("x", "×")} 的封面`);
        bySize.set(c.key, { url: c.url, ids: [...(bySize.get(c.key)?.ids ?? []), postId] });
      }
      for (const [key, group] of bySize) {
        await attachToDrafts(t.organization_id,
          group.ids.map((postId) => ({ postId, done: () => (done.includes(postId) ? postId : undefined),
            record: (mediaId: string, ours: boolean) => { done.push(postId); if (ours) { uploads[key] = mediaId; given.add(postId); } } })),
          () => uploads[key], async () => String((await addImage(t.organization_id, group.url, `topic-${t.id}-cover${key === SITE ? "" : `-${key}`}.webp`, actor)).id),
          (mediaId) => ({ media_id: mediaId, position: 0, alt_text: alt }), actor, async () => {});
      }
    } catch (e) {
      problem = `封面沒有附上（${e instanceof Error ? e.message : String(e)}）`;
    }
  }
  const instagram = (s.link_in_comment ?? []).some((p) => p.channel === "instagram" && !done.includes(p.post_id));
  const checks = s.checks.filter((c) => c.name !== "social_image");
  if (problem) checks.push({ name: "social_image", pass: !instagram,
    detail: `社群貼文沒有圖：${problem}${instagram ? "；Instagram 沒有圖發不出去，請到社群草稿加一張圖" : ""}` });
  // only drafts given the cover in this run (one handled before already has its line; a person's own media is theirs)
  const sizeLines = [...off].filter(([id]) => given.has(id)).map(([, line]) => line);
  if (sizeLines.length) checks.push({ name: "cover", pass: true, detail: `封面不是這些頻道自己的尺寸：${sizeLines.join("；")}` });
  const { [SITE]: siteUpload, ...others } = uploads;
  artifacts.social = { ...s, cover_media: { media_id: siteUpload ?? null, done, ...(Object.keys(others).length ? { media_ids: others } : {}) }, checks };
}

/** K29: the cover a draft gets -- its channels' size (draftCoverSize); that size's cover missing (its layout failed) =
 *  the website's, and then every channel not on the website's size is off its own. */
async function draftCover(orgId: string, postId: string, siteUrl: string, sizes: CoverSizes): Promise<{ key: string; url: string; off: string[] }> {
  const post = await getPost(orgId, postId);
  const platforms = [...(await accountPlatforms(orgId, post.targets.map((x) => x.account_id))).values()];
  const { size, mismatched } = draftCoverSize(platforms);
  const key = sizeKey(size);
  const own = isSiteSize(size) ? siteUrl : sizes[key]?.image_url;
  if (own) return { key, url: own, off: mismatched };
  return { key: sizeKey(SITE_COVER_SIZE), url: siteUrl, off: platforms.filter((p) => !isSiteSize(coverSizeFor(p))) };
}

/** The finished video onto the social drafts (K30: not into the article -- it gets YouTube's player at publish), each once: every step is saved on the row as it
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
    // K30: the file never goes into the article: YouTube's player does, once YouTube is live (publishDrafts)
    await releaseTopicVideo(sb, t, url, actor);
    const s = artifacts.social;
    // each social draft (the other channels', YouTube's own since N5a, Facebook's and Instagram's since K23) gets the
    // video once; one upload serves them all. The first two record it on the video, the K23 ones on their own entry.
    const linkPosts = [...(s?.link_in_comment ?? [])];
    const drafts: Array<{ postId: string | null | undefined; done: () => string | undefined; record: (mediaId: string) => void }> = [
      { postId: s?.post_id, done: () => video.media_id, record: (m) => { video.media_id = m; } },
      { postId: s?.youtube_post_id, done: () => video.youtube_media_id, record: (m) => { video.youtube_media_id = m; } },
      ...linkPosts.map((p, i) => ({ postId: p.post_id, done: () => linkPosts[i].media_id, record: (m: string) => {
        linkPosts[i] = { ...linkPosts[i], media_id: m };
        artifacts.social = { ...artifacts.social!, link_in_comment: [...linkPosts] };
      } })),
    ];
    const uploaded = () => video.media_id ?? video.youtube_media_id ?? linkPosts.find((p) => p.media_id)?.media_id;
    await attachToDrafts(t.organization_id, drafts, uploaded, async () => (await addVideo(t.organization_id, url, `topic-${t.id}.mp4`, actor)).id,
      (mediaId) => ({ media_id: mediaId, position: 0 }), actor, step);
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
/** opts.maker (K7): "schedule" only from the content_pipeline job (lib/schedules/jobs.ts); absent = a person pressed start. */
export function topicDeps(sb: SupabaseClient, organizationId: string, actor: string, opts: { capTwd: number | null; maker?: TopicMaker }): TickDeps {
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
      const missing = await missingFeature(organizationId, actor, t.formats);   // K30b: before anything is paid for
      if (missing) return missing;
      if (waitsForVideo(t)) return youtubeChannels(t.organization_id).then(() => null, (e: Error) => e.message);   // K30
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
    make: (t, deadline) => { own(t); return runForOrg(organizationId, actor, () => makeDrafts(sb, t, actor, capTwd, opts.maker ?? "person", deadline)); },
    autoPublishes: async (t) => { own(t); const s = await siteFor(sb, t); return typeof s !== "string" && autoPublishes(s.defaults); },
    publish: (t, save, fresh) => { own(t); return publishDrafts(sb, t, actor, save, fresh); },
    startVideo: (t, record) => { own(t); return runForOrg(organizationId, actor, () => startTopicVideo(sb, t, record, capTwd)); },
    pollVideo: (t, jobId) => { own(t); return pollTopicVideo(t, jobId); },
    attachVideo: (t, url, save) => { own(t); return attachTopicVideo(t, url, actor, save); },
  };
}
