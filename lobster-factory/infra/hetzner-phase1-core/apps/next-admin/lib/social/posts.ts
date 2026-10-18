// Post payloads for POST /api/social/posts and PUT /api/social/posts/[id]: what may be sent, and the body limits.
import { BadRequest, uuid } from "./http";
import { commentsOverLimit, overLimit } from "./limits";
import { accountPlatforms, type AutoMode, type CommentInput, type MediaInput, type PostChildren, type PostFields, type TargetInput } from "./store";
import { commentTakesMedia, composeText, ComposeError } from "./compose";
import { parseRepeat, RepeatError } from "./repeat-rule";

const TEXT_FIELDS = ["first_comment", "link_url", "notes", "source_url"] as const;
const AUTO_MODES: readonly AutoMode[] = ["brand", "none", "own"];
const MAX_TARGETS = 100;   // more channels than one brand has
const MAX_MEDIA = 20;      // the largest carousel a platform takes
const MAX_COMMENTS = 50;   // 0105 social_post_comments.position 0..49
const MAX_TAGS = 50;
const DELAYS: readonly number[] = [0, 1, 5, 60];   // 0105 delay_minutes check

/** children: null = unchanged (0105 social_save_post p_comments / p_tags) */
export interface PostPayload { fields: PostFields; targets: TargetInput[] | null; media: MediaInput[] | null; children: { comments: CommentInput[] | null; tags: string[] | null } }

/** Only known fields, with their types; absent = unchanged (the database treats a missing key the same way). */
export function parsePostPayload(body: Record<string, unknown>): PostPayload {
  const raw = (body.fields ?? {}) as Record<string, unknown>;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new BadRequest("fields must be an object");
  const fields: PostFields = {};
  if ("body" in raw) {
    if (typeof raw.body !== "string") throw new BadRequest("fields.body must be a string");
    fields.body = raw.body;
  }
  for (const k of TEXT_FIELDS) {
    if (!(k in raw)) continue;
    if (raw[k] !== null && typeof raw[k] !== "string") throw new BadRequest(`fields.${k} must be a string or null`);
    fields[k] = raw[k] as string | null;
  }
  for (const k of ["link_url", "source_url"] as const) {
    const v = fields[k];
    if (!v) continue;
    let ok = false;
    try { ok = /^https?:$/.test(new URL(v).protocol) && new URL(v).hostname.includes("."); } catch { ok = false; }
    if (!ok) throw new BadRequest(`fields.${k} must be a full web address (https://…)`);
  }
  if ("link_utm" in raw) {
    if (typeof raw.link_utm !== "boolean") throw new BadRequest("fields.link_utm must be a boolean");
    fields.link_utm = raw.link_utm;
  }
  // 0105: null = not a series (stopping one with children already made is store.ts stopRepeat)
  if ("repeat" in raw) {
    try {
      fields.repeat = raw.repeat === null ? null : parseRepeat(raw.repeat);
    } catch (e) {
      if (e instanceof RepeatError) throw new BadRequest(`fields.repeat: ${e.message}`);
      throw e;
    }
  }
  if ("auto_mode" in raw) {
    if (!AUTO_MODES.includes(raw.auto_mode as AutoMode)) throw new BadRequest(`fields.auto_mode must be one of ${AUTO_MODES.join(", ")}`);
    fields.auto_mode = raw.auto_mode as AutoMode;
  }
  let targets: TargetInput[] | null = null;
  if (body.targets !== undefined) {
    if (!Array.isArray(body.targets) || body.targets.length > MAX_TARGETS) throw new BadRequest(`targets must be an array of at most ${MAX_TARGETS}`);
    targets = body.targets.map((t, i) => {
      const r = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
      if (r.custom_body !== undefined && r.custom_body !== null && typeof r.custom_body !== "string") throw new BadRequest(`targets[${i}].custom_body must be a string`);
      if (r.format !== undefined && typeof r.format !== "string") throw new BadRequest(`targets[${i}].format must be a string`);
      return { account_id: uuid(r.account_id, `targets[${i}].account_id`), custom_body: (r.custom_body as string | null) ?? null, format: (r.format as string) ?? "post" };
    });
    if (new Set(targets.map((t) => t.account_id)).size !== targets.length) throw new BadRequest("an account appears twice in targets");
  }
  let media: MediaInput[] | null = null;
  if (body.media !== undefined) {
    if (!Array.isArray(body.media) || body.media.length > MAX_MEDIA) throw new BadRequest(`media must be an array of at most ${MAX_MEDIA}`);
    media = body.media.map((m, i) => {
      const r = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
      if (r.alt_text !== undefined && r.alt_text !== null && typeof r.alt_text !== "string") throw new BadRequest(`media[${i}].alt_text must be a string`);
      return { media_id: uuid(r.media_id, `media[${i}].media_id`), position: i, alt_text: (r.alt_text as string | null) ?? null };
    });
    if (new Set(media.map((m) => m.media_id)).size !== media.length) throw new BadRequest("a media item appears twice");
  }
  // 0105: the comments replace the post's set in this order; first_comment is their old one-comment form, so not both
  let comments: CommentInput[] | null = null;
  if (body.comments !== undefined && body.comments !== null) {
    if ("first_comment" in fields) throw new BadRequest("send comments or fields.first_comment, not both");
    if (!Array.isArray(body.comments) || body.comments.length > MAX_COMMENTS) throw new BadRequest(`comments must be an array of at most ${MAX_COMMENTS}`);
    comments = body.comments.map((c, i) => {
      const r = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      if (typeof r.body !== "string" || r.body.length > 10000) throw new BadRequest(`comments[${i}].body must be a string of at most 10000`);
      const delay = r.delay_minutes ?? 0;
      if (!DELAYS.includes(delay as number)) throw new BadRequest(`comments[${i}].delay_minutes must be one of ${DELAYS.join(", ")}`);
      const media_id = r.media_id == null ? null : uuid(r.media_id, `comments[${i}].media_id`);
      if (!r.body.trim() && !media_id) throw new BadRequest(`comments[${i}] has no text and no image`);
      return { body: r.body, delay_minutes: delay as CommentInput["delay_minutes"], media_id };
    });
  }
  let tags: string[] | null = null;
  if (body.tags !== undefined && body.tags !== null) {
    if (!Array.isArray(body.tags) || body.tags.length > MAX_TAGS) throw new BadRequest(`tags must be an array of at most ${MAX_TAGS}`);
    tags = [...new Set(body.tags.map((t, i) => uuid(t, `tags[${i}]`)))];
  }
  return { fields, targets, media, children: { comments, tags } satisfies PostChildren };
}

/** 400 when a target's text -- as the sender composes it, link and UTM included -- or one of the comments is longer than
 *  its platform takes, or the account is not this brand's. */
export async function assertWithinLimits(brandId: string, body: string, targets: TargetInput[], link: { url: string | null; utm: boolean } = { url: null, utm: false },
  comments: Array<{ body: string; media_id?: string | null }> = []): Promise<void> {
  const platforms = await accountPlatforms(brandId, targets.map((t) => t.account_id));
  const missing = targets.filter((t) => !platforms.has(t.account_id)).map((t) => t.account_id);
  if (missing.length) throw new BadRequest("an account in targets is not this brand's", { accounts: missing });
  const textOf = (t: TargetInput, platform: string) => {
    try {
      return composeText({ body, customBody: t.custom_body ?? null, linkUrl: link.url, linkUtm: link.utm, platform });
    } catch (e) {
      if (e instanceof ComposeError) throw new BadRequest(e.message);
      throw e;
    }
  };
  const problems = overLimit(body, targets.map((t) => { const platform = platforms.get(t.account_id) as string; return { accountId: t.account_id, platform, customBody: textOf(t, platform) }; }));
  if (problems.length) throw new BadRequest("text longer than the platform allows", { overLimit: problems });
  const inComments = commentsOverLimit(comments.map((c) => c.body), targets.map((t) => ({ accountId: t.account_id, platform: platforms.get(t.account_id) as string })));
  if (inComments.length) throw new BadRequest("a comment is longer than the platform allows", { commentOverLimit: inComments });
  const noImage = [...new Set(targets.map((t) => platforms.get(t.account_id) as string))].filter((p) => !commentTakesMedia(p));
  const imageOnly = comments.findIndex((c) => c.media_id && !c.body.trim());
  if (imageOnly >= 0 && noImage.length) throw new BadRequest(`comment ${imageOnly + 1} is an image only, and ${noImage.join(", ")} comments carry no image`, { commentImageOnly: { comment: imageOnly + 1, platforms: noImage } });
}
