// Post payloads for POST /api/social/posts and PUT /api/social/posts/[id]: what may be sent, and the body limits.
import { BadRequest, uuid } from "./http";
import { overLimit } from "./limits";
import { accountPlatforms, type MediaInput, type PostFields, type TargetInput } from "./store";

const TEXT_FIELDS = ["first_comment", "link_url", "notes", "source_url"] as const;
const MAX_TARGETS = 100;   // more channels than one brand has
const MAX_MEDIA = 20;      // the largest carousel a platform takes

export interface PostPayload { fields: PostFields; targets: TargetInput[] | null; media: MediaInput[] | null }

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
  if ("link_utm" in raw) {
    if (typeof raw.link_utm !== "boolean") throw new BadRequest("fields.link_utm must be a boolean");
    fields.link_utm = raw.link_utm;
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
  return { fields, targets, media };
}

/** 400 when a target's text is longer than its platform takes, or the account is not this brand's. */
export async function assertWithinLimits(brandId: string, body: string, targets: TargetInput[]): Promise<void> {
  const platforms = await accountPlatforms(brandId, targets.map((t) => t.account_id));
  const missing = targets.filter((t) => !platforms.has(t.account_id)).map((t) => t.account_id);
  if (missing.length) throw new BadRequest("an account in targets is not this brand's", { accounts: missing });
  const problems = overLimit(body, targets.map((t) => ({ accountId: t.account_id, platform: platforms.get(t.account_id) as string, customBody: t.custom_body })));
  if (problems.length) throw new BadRequest("text longer than the platform allows", { overLimit: problems });
}
