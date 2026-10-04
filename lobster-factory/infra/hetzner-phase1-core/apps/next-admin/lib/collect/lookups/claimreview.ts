// The fact-checks the world's fact-checkers publish as ClaimReview (Data Commons feed, CC BY 4.0), mirrored in Supabase
// (migration 0095) so a lookup never leaves collect. Ported from the engine's platform/net/claimreview.py (worktree
// commit 988a52e29); the matching is that file's: the index only proposes candidates, a review counts when
// FACTCHECK.claimreview.minOverlap of the REVIEWED CLAIM's 3-character pieces are in the text, closest first.
//
// Traps:
// - The feed is ~200 MB of JSON. It is read as a stream, one feed element at a time, and written in batches; holding it
//   (the Python version peaked ~820 MB) is not an option inside next-admin.
// - A refresh writes a new generation beside the old one; the switch is one database function that refuses an
//   incomplete generation, and old rows go in short batches (prune). A failed refresh leaves the old mirror answering.
// - normalise() and pieces() must stay the same function for the stored claims and the looked-up text.

import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { ClaimReviewHit } from "@/lib/collect/lookups/contract";
import type { LookupFetch } from "@/lib/collect/lookups/describe";
import { FACTCHECK } from "@/lib/collect/lookups/lists";
import COMMON_PIECE_LIST from "@/lib/collect/lookups/claimreview-common-pieces.json";

/** Pieces of the looked-up text sent to the index (spread across it), and how many candidates it may return. */
const MAX_QUERY_PIECES = 96;
const MAX_CANDIDATES = 1000;
/**
 * A piece in at least this share of the claims (" th", "the", "ion": 1,669 of 253,728 distinct pieces in the
 * 2026-10-04 feed) is left out of the candidate query: with them an English text matched 67k of 99k reviews and read
 * the whole table (1.9 s); without them 14k (0.23 s). Measured on 2,000 real claims set inside a longer text, the
 * candidate step then misses 0.75% instead of 5.75% (common pieces drowned the ranking), reworded claims 0.4% instead
 * of 0.15%; 155 claims made only of common pieces can no longer be found. The match itself (minOverlap) is unchanged.
 * Regenerate claimreview-common-pieces.json: lib/collect/__tests__/collect-lookups-live.test.ts COLLECT_LOOKUPS_COMMON_FROM.
 */
export const COMMON_PIECE_SHARE = 0.01;
const COMMON_PIECES: ReadonlySet<string> = new Set(COMMON_PIECE_LIST as string[]);
const INSERT_BATCH = 500;
/** The hourly heartbeat asks; a refresh starts when the last success is this old (23 h keeps the daily slot)... */
export const REFRESH_EVERY_HOURS = 23;
/** ...and the last attempt this old: a failed refresh is retried the next hour, not the next day. */
export const RETRY_AFTER_HOURS = 1;

const CJK = "⺀-〿぀-鿿가-힯豈-﫿";
const SPACE_IN_CJK = new RegExp(`(?<=[${CJK}])\\s+(?=[${CJK}])`, "g");
const NUL = new RegExp(String.fromCharCode(0), "g");

/** = the engine's evidence_words.normalise_quote + casefold: NFKC, no space between two CJK characters, other
 *  whitespace collapsed, lower case. */
export function normalise(text: string): string {
  return text.normalize("NFKC").replace(SPACE_IN_CJK, "").split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

/** Every distinct run of three characters (code points, as Postgres substr and Python count them). */
export function pieces(norm: string): Set<string> {
  const chars = Array.from(norm);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= chars.length; i++) {
    const piece = chars[i] + chars[i + 1] + chars[i + 2];
    if (piece.trim()) out.add(piece);
  }
  return out;
}

/** The share of a reviewed claim's pieces that are in the text. */
export function share(claimNorm: string, wanted: Set<string>): number {
  const theirs = pieces(claimNorm);
  if (!theirs.size) return 0;
  let inText = 0;
  for (const piece of theirs) if (wanted.has(piece)) inText++;
  return inText / theirs.size;
}

/** Up to MAX_QUERY_PIECES of the text's pieces that are not common, evenly spread over their sorted order. */
export function queryPieces(wanted: Set<string>): string[] {
  const ordered = [...wanted].filter((piece) => !COMMON_PIECES.has(piece)).sort();
  const step = Math.max(1, Math.floor(ordered.length / MAX_QUERY_PIECES));
  return ordered.filter((_, i) => i % step === 0).slice(0, MAX_QUERY_PIECES);
}

/** Trimmed, cut to `limit` characters, no lone surrogate or NUL (Postgres refuses both, failing a whole batch). */
function text(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  const clean = value.trim().toWellFormed().replace(NUL, "");
  return clean.length <= limit ? clean : Array.from(clean).slice(0, limit).join("");
}

function host(url: unknown): string {
  if (typeof url !== "string") return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every usable ClaimReview in one feed element: a reviewed claim and the review's link at least. */
export function reviewsOf(element: unknown): ClaimReviewHit[] {
  if (!isObject(element) || !Array.isArray(element.item)) return [];
  const out: ClaimReviewHit[] = [];
  for (const item of element.item) {
    if (!isObject(item) || item["@type"] !== "ClaimReview") continue;
    const claim = text(item.claimReviewed, 2000);
    const url = text(item.url, 2048);
    if (!claim || !/^https?:\/\//.test(url)) continue;
    const author = isObject(item.author) ? item.author : {};
    const rating = isObject(item.reviewRating) ? item.reviewRating : {};
    const reviewed = isObject(item.itemReviewed) ? item.itemReviewed : {};
    const claimant = isObject(reviewed.author) ? reviewed.author : {};
    const date = text(item.datePublished, 40).slice(0, 10) || text(element.dateCreated, 40).slice(0, 10);
    // schema.org sdLicense is a URL or a CreativeWork; the item's own, not the compilation's (none in today's feed head)
    const license = isObject(item.sdLicense) ? text(item.sdLicense.url, 200) || text(item.sdLicense.name, 200) : text(item.sdLicense, 200);
    out.push({
      claim,
      url,
      publisher: text(author.name, 300) || host(author.url) || host(url),
      publisher_url: text(author.url, 2048),
      judged_as: text(rating.alternateName, 500),
      date: DATE.test(date) ? date : "",
      claimant: text(claimant.name, 300),
      license,
    });
  }
  return out;
}

/**
 * Reads the feed as a stream and hands over each element of its top-level `dataFeedElement` array, parsed, one at a
 * time (only the element being read is held). Throws when the JSON ends early: a cut feed is not a smaller feed.
 */
export async function scanFeed(
  body: ReadableStream<Uint8Array>,
  onElement: (element: unknown) => Promise<void> | void,
): Promise<{ dateModified: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let i = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let tokenStart = -1; // a string at depth 1 being read (a key, or dateModified's value)
  let elementStart = -1; // a feed element being read
  let pendingKey = "";
  let key = ""; // the depth-1 key whose value is being read
  let inFeed = false;
  let dateModified = "";
  for (;;) {
    const { done, value } = await reader.read();
    // A character split across two chunks is completed by the next one ({stream: true}); the last call flushes.
    buf += done ? decoder.decode() : decoder.decode(value, { stream: true });
    for (; i < buf.length; i++) {
      const c = buf.charCodeAt(i);
      if (inString) {
        if (escaped) escaped = false;
        else if (c === 92) escaped = true; // backslash
        else if (c === 34) {
          inString = false;
          if (tokenStart >= 0) {
            const parsed = JSON.parse(buf.slice(tokenStart, i + 1)) as string;
            if (key === "dateModified") dateModified = parsed;
            pendingKey = parsed;
            tokenStart = -1;
          }
        }
        continue;
      }
      if (c === 34) {
        inString = true;
        if (depth === 1) tokenStart = i;
      } else if (c === 123 || c === 91) {
        // { or [
        if (depth === 1 && c === 91 && key === "dataFeedElement") inFeed = true;
        if (inFeed && depth === 2 && c === 123) elementStart = i;
        depth++;
      } else if (c === 125 || c === 93) {
        // } or ]
        depth--;
        if (inFeed && depth === 2 && c === 125 && elementStart >= 0) {
          await onElement(JSON.parse(buf.slice(elementStart, i + 1)));
          elementStart = -1;
        }
        if (inFeed && depth === 1) inFeed = false;
      } else if (depth === 1 && c === 58) key = pendingKey; // :
      else if (depth === 1 && c === 44) key = ""; // ,
    }
    const keep = Math.min(...[elementStart, tokenStart, buf.length].filter((n) => n >= 0));
    buf = buf.slice(keep);
    i -= keep;
    if (elementStart >= 0) elementStart -= keep;
    if (tokenStart >= 0) tokenStart -= keep;
    if (done) break;
  }
  if (depth !== 0 || inString) throw new Error("claimreview_feed_truncated");
  return { dateModified };
}

export type ClaimReviewRow = ClaimReviewHit & { norm: string };
export type Candidates = { kind: "no_mirror" } | { kind: "error"; error: string } | { kind: "rows"; rows: ClaimReviewRow[] };

/** Where the mirror lives (Supabase in production, a fake in tests). Policy (which feed is good enough) is not here. */
export interface ClaimReviewStore {
  candidates(pieces: string[], limit: number): Promise<Candidates>;
  /** How many reviews the mirror answering now holds; null = no mirror yet. */
  currentReviews(): Promise<number | null>;
  /** True for one caller when a refresh is due (last success >= successHours ago, last attempt >= retryHours ago). */
  beginRefresh(successHours: number, retryHours: number): Promise<boolean>;
  insert(generation: number, rows: ClaimReviewRow[]): Promise<void>;
  /** Points the mirror at `generation`, only if it holds exactly `reviews` rows. Deletes nothing (prune does). */
  finish(generation: number, info: { reviews: number; publishers: number; feedModified: string }): Promise<void>;
  /** Records why a refresh failed; the mirror answering now is untouched. */
  fail(error: string): Promise<void>;
  /** Deletes at most `batch` rows of any generation but the current one; how many it deleted. */
  prune(batch: number): Promise<number>;
}

export function supabaseClaimReviewStore(): ClaimReviewStore | null {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data as unknown;
  };
  const mirror = () => sb.from("collect_claimreview_mirror").select("current_generation, reviews").eq("id", 1).maybeSingle();
  return {
    async candidates(wanted, limit) {
      const current = await mirror();
      if (current.error) return { kind: "error", error: current.error.message };
      if (!current.data || current.data.current_generation === null) return { kind: "no_mirror" };
      const { data, error } = await sb.rpc("collect_claimreview_candidates", { p_pieces: wanted, p_limit: limit });
      if (error || !Array.isArray(data)) return { kind: "error", error: error?.message ?? "not_a_list" };
      return { kind: "rows", rows: data as ClaimReviewRow[] };
    },
    async currentReviews() {
      const current = await mirror();
      if (current.error) throw new Error(`collect_claimreview_mirror: ${current.error.message}`);
      return current.data && current.data.current_generation !== null ? Number(current.data.reviews) : null;
    },
    async beginRefresh(successHours, retryHours) {
      return (await rpc("collect_claimreview_begin_refresh", { p_success_hours: successHours, p_retry_hours: retryHours })) === true;
    },
    async insert(generation, rows) {
      const { error } = await sb.from("collect_claimreview_reviews").insert(rows.map((row) => ({ generation, ...row })));
      if (error) throw new Error(`collect_claimreview_reviews insert: ${error.message}`);
    },
    async finish(generation, info) {
      await rpc("collect_claimreview_finish_refresh", {
        p_generation: generation,
        p_reviews: info.reviews,
        p_publishers: info.publishers,
        p_feed_modified: info.feedModified,
      });
    },
    async fail(error) {
      await rpc("collect_claimreview_fail_refresh", { p_error: error });
    },
    async prune(batch) {
      return Number(await rpc("collect_claimreview_prune", { p_batch: batch }));
    },
  };
}

export type ClaimReviewAnswer =
  | { kind: "no_store" }
  | { kind: "nothing_to_compare" }
  | { kind: "no_mirror" }
  | { kind: "error"; error: string }
  | { kind: "hits"; hits: ClaimReviewHit[] };

/** The reviews whose claim is mostly inside `text`, closest first, at most FACTCHECK.maxHits. */
export async function lookupClaimReview(textToCheck: string, store: ClaimReviewStore | null): Promise<ClaimReviewAnswer> {
  if (!store) return { kind: "no_store" };
  const wanted = pieces(normalise(textToCheck));
  // Nothing of three characters to compare: there is no way to look, which is not "looked and found none".
  if (!wanted.size) return { kind: "nothing_to_compare" };
  const found = await store.candidates(queryPieces(wanted), MAX_CANDIDATES);
  if (found.kind !== "rows") return found;
  const hits = found.rows
    .map((row) => ({ share: share(row.norm, wanted), row }))
    .filter((scored) => scored.share >= FACTCHECK.claimreview.minOverlap)
    .sort((a, b) => b.share - a.share)
    .slice(0, FACTCHECK.maxHits)
    .map(({ row }) => ({
      claim: row.claim,
      url: row.url,
      publisher: row.publisher ?? "",
      publisher_url: row.publisher_url ?? "",
      judged_as: row.judged_as ?? "",
      date: row.date ?? "",
      claimant: row.claimant ?? "",
      license: row.license ?? "",
    }));
  return { kind: "hits", hits };
}

/** A new feed below this share of the mirror answering now is refused: a cut or broken feed is not a smaller world. */
export const MIN_SHARE_OF_CURRENT = 0.8;
/** Rows per prune call: one short statement each (Supabase's statement timeout is 8 s on a small database). */
export const PRUNE_BATCH = 5000;

/** Delete every row of a generation that is not current, a batch at a time; never throws. */
async function pruneAll(store: ClaimReviewStore, log: (msg: string) => void): Promise<void> {
  try {
    for (let i = 0; i < 2000; i++) if ((await store.prune(PRUNE_BATCH)) === 0) return;
  } catch (e) {
    log(`claimreview prune stopped, the next refresh continues it: ${String(e).slice(0, 200)}`);
  }
}

/** Download the feed (streamed) and replace the mirror; the old one stays if anything fails. */
export async function refreshClaimReview(deps: {
  fetch: LookupFetch;
  store: ClaimReviewStore;
  log: (msg: string) => void;
  now?: () => number;
}): Promise<{ ok: true; reviews: number; publishers: number } | { ok: false; error: string }> {
  const generation = (deps.now ?? Date.now)();
  const publishers = new Set<string>();
  let batch: ClaimReviewRow[] = [];
  let reviews = 0;
  // What an earlier refresh left (a restart mid-download, a failed refresh) goes before this one writes anything.
  await pruneAll(deps.store, deps.log);
  try {
    const res = await deps.fetch(FACTCHECK.claimreview.feedUrl, { stream: true, headers: { accept: "application/json" } });
    if (!res.ok || !res.body) throw new Error(`claimreview_feed_http_${res.status}`);
    const { dateModified } = await scanFeed(res.body, async (element) => {
      for (const review of reviewsOf(element)) {
        batch.push({ ...review, norm: normalise(review.claim) });
        publishers.add(host(review.publisher_url) || review.publisher);
        reviews++;
        if (batch.length >= INSERT_BATCH) {
          const full = batch;
          batch = [];
          await deps.store.insert(generation, full);
        }
      }
    });
    if (batch.length) await deps.store.insert(generation, batch);
    const current = await deps.store.currentReviews();
    if (reviews < 1 || (current !== null && reviews < current * MIN_SHARE_OF_CURRENT)) {
      throw new Error(`claimreview_feed_too_small: ${reviews} reviews, the mirror holds ${current ?? 0}`);
    }
    await deps.store.finish(generation, { reviews, publishers: publishers.size, feedModified: text(dateModified, 40) });
    deps.log(`claimreview mirror refreshed: ${reviews} reviews, ${publishers.size} publishers`);
    await pruneAll(deps.store, deps.log);
    return { ok: true, reviews, publishers: publishers.size };
  } catch (e) {
    const error = String(e).slice(0, 300);
    await deps.store.fail(error).catch((failed) => deps.log(`claimreview could not record the failure: ${String(failed).slice(0, 200)}`));
    await pruneAll(deps.store, deps.log);
    deps.log(`claimreview refresh failed, the old mirror stays: ${error}`);
    return { ok: false, error };
  }
}
