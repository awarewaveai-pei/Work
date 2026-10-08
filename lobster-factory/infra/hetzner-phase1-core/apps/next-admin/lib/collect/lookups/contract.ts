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

/** Under the engine's 45 s (lookup.v1.json engine_timeout_seconds): what is not done by then is 無法檢查. */
export const LOOKUP_DEADLINE_MS = 38_000;
export const TOO_SLOW = "這一項這次查太久，沒有查完";

/** One deadline for a whole request: `inTime(work, onLate)` answers `onLate` for work still running at the deadline. */
export function deadline(ms: number): { inTime: <T>(work: Promise<T>, onLate: T) => Promise<T>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), ms);
  });
  return {
    async inTime<T>(work: Promise<T>, onLate: T): Promise<T> {
      const first = await Promise.race([work, late]);
      return first === "late" ? onLate : (first as T);
    },
    clear: () => clearTimeout(timer),
  };
}

/** Why an outside call failed, from what failed (collect's fetcher sets `kind` and `status`), never a guess. */
export function whyFailed(e: unknown, who: string): string {
  const kind = e && typeof e === "object" && "kind" in e ? (e as { kind: unknown }).kind : null;
  const status = e && typeof e === "object" && "status" in e ? Number((e as { status: unknown }).status) : NaN;
  if (kind === "http" && Number.isFinite(status)) return `${who}回了錯誤（HTTP ${status}）`;
  if (kind === "blocked") return `找資料的服務的安全規則不讓它連到${who}`;
  if (kind === "budget") return "這次的查詢額度用完了";
  // collect's own per-host politeness (net/rate-limit.ts): too many lookups queued for one host to wait for
  if (String(e).includes("rate_limit_wait_too_long")) return `這次要問${who}的太多，排不到`;
  return `${who}這次沒有回應`;
}

export const whyStatus = (status: number, who: string): string => `${who}回了錯誤（HTTP ${status}）`;

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
  /** The item's own licence (the feed's sdLicense, at most 200 characters); "" when the feed has none. */
  license: string;
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

/** The fact-check databases collect answers; absent `dbs` = these, in this order. */
export const DBS = ["claimreview", "cofacts"] as const;
export type Db = (typeof DBS)[number];

export interface FactcheckAnswerItem {
  text: string;
  /** Only the databases asked for, in the order the request named them (lookup.v1 `dbs`: "in that order"). */
  dbs: Array<DbAnswer<"claimreview", ClaimReviewHit> | DbAnswer<"cofacts", CofactsHit>>;
}

export type LookupRequest =
  | { kind: "describe"; projectId: string; urls: string[] }
  | { kind: "factcheck"; projectId: string; texts: string[]; dbs: Db[] };

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

/** R2's 400s: unknown kind, too many items, a URL that is not http(s), text too long, dbs that are not a subset of DBS
 *  (and a body that is not a request). */
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
  // Optional `dbs` (v1, added 2026-10-04): which databases may see the words -- someone outside Taiwan's text is never
  // sent to Cofacts. Absent = every database; present = a non-empty subset of DBS, each once, answered in the request's
  // order (an index-based consumer reads dbs[i] as the i-th it asked for; Codex VERIFY r5 F4).
  let dbs: Db[] = [...DBS];
  if (body.dbs !== undefined) {
    const asked = body.dbs;
    if (!Array.isArray(asked) || !asked.length || new Set(asked).size !== asked.length || !asked.every((d) => (DBS as readonly unknown[]).includes(d))) {
      return { ok: false, error: "dbs_not_a_subset" };
    }
    dbs = asked as Db[];
  }
  const texts: string[] = [];
  for (const item of items) {
    if (!isPlainObject(item) || typeof item.text !== "string") return { ok: false, error: "text_not_a_string" };
    // Characters as the engine counts them (Python code points), not UTF-16 units.
    if (Array.from(item.text).length > MAX_TEXT_CHARS) return { ok: false, error: `text_too_long:${MAX_TEXT_CHARS}` };
    texts.push(item.text);
  }
  return { ok: true, value: { kind, projectId, texts, dbs } };
}
