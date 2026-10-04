// Collect lookups v1 — the shape of a request and an answer. The one copy of the contract is
// Projects/internal/cognitive-engineering-os/specs/wire/lookup.v1.json (frozen); collect-lookups.test.ts holds this
// file to its examples. A lookup that failed is a cell, never a failed request (R2); the whole request fails only on
// 401 (the route) and on the 400s parseLookupRequest returns.

export const FOUND = "查到";
export const NOT_FOUND = "查不到";
export const UNCHECKABLE = "無法檢查";

/** {state, value?, why?}: 查到 carries a non-empty value; 查不到 and 無法檢查 carry a non-empty why. */
export type Cell = { state: typeof FOUND; value: string; why?: string } | { state: typeof NOT_FOUND | typeof UNCHECKABLE; why: string };

export const found = (value: string, why?: string): Cell => (why ? { state: FOUND, value, why } : { state: FOUND, value });
export const notFound = (why: string): Cell => ({ state: NOT_FOUND, why });
export const unchecked = (why: string): Cell => ({ state: UNCHECKABLE, why });

export const MAX_DESCRIBE_ITEMS = 25;
export const MAX_FACTCHECK_ITEMS = 1;
export const MAX_TEXT_CHARS = 4000;

export interface DescribeAnswerItem {
  url: string;
  site: string;
  registered: Cell;
  country: Cell;
  first_archived: Cell;
}

export interface ClaimReviewHit {
  claim: string;
  url: string;
  publisher: string;
  publisher_url: string;
  judged_as: string;
  date: string;
  claimant: string;
}

export interface CofactsHit {
  article_id: string;
  url: string;
  date: string;
  replies: Array<{ judged_as: string; text: string; reference: string; date: string }>;
}

/** A database's answer: 查到 alone (with at least one hit), or 查不到 / 無法檢查 with why. */
export type DbAnswer<Db extends string, Hit> =
  | { db: Db; state: typeof FOUND; attribution: string; hits: Hit[] }
  | { db: Db; state: typeof NOT_FOUND | typeof UNCHECKABLE; why: string; attribution: string; hits: Hit[] };

export interface FactcheckAnswerItem {
  text: string;
  dbs: [DbAnswer<"claimreview", ClaimReviewHit>, DbAnswer<"cofacts", CofactsHit>];
}

export type LookupRequest =
  | { kind: "describe"; projectId: string; urls: string[] }
  | { kind: "factcheck"; projectId: string; texts: string[] };

export type LookupAnswer = { kind: "describe"; items: DescribeAnswerItem[] } | { kind: "factcheck"; items: FactcheckAnswerItem[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isWebUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** R2's 400s: unknown kind, too many items, a URL that is not http(s), text too long (and a body that is not a request). */
export function parseLookupRequest(body: unknown): { ok: true; value: LookupRequest } | { ok: false; error: string } {
  if (!isPlainObject(body)) return { ok: false, error: "body_not_object" };
  const { kind, items } = body;
  // project_id is for the log only (R4); a missing one is not a reason to refuse the lookups.
  const projectId = typeof body.project_id === "string" ? body.project_id.slice(0, 80) : "";
  if (kind !== "describe" && kind !== "factcheck") return { ok: false, error: "unknown_kind" };
  if (!Array.isArray(items)) return { ok: false, error: "items_not_a_list" };
  if (kind === "describe") {
    if (items.length > MAX_DESCRIBE_ITEMS) return { ok: false, error: `too_many_items:${MAX_DESCRIBE_ITEMS}` };
    const urls: string[] = [];
    for (const item of items) {
      if (!isPlainObject(item) || !isWebUrl(item.url)) return { ok: false, error: "url_not_http" };
      urls.push(item.url);
    }
    return { ok: true, value: { kind, projectId, urls } };
  }
  if (items.length > MAX_FACTCHECK_ITEMS) return { ok: false, error: `too_many_items:${MAX_FACTCHECK_ITEMS}` };
  const texts: string[] = [];
  for (const item of items) {
    if (!isPlainObject(item) || typeof item.text !== "string") return { ok: false, error: "text_not_a_string" };
    // Characters as the engine counts them (Python code points), not UTF-16 units.
    if (Array.from(item.text).length > MAX_TEXT_CHARS) return { ok: false, error: `text_too_long:${MAX_TEXT_CHARS}` };
    texts.push(item.text);
  }
  return { ok: true, value: { kind, projectId, texts } };
}
