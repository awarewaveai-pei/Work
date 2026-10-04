// lookups v1 `factcheck`: has someone already checked this? Two databases, always in this order: the ClaimReview
// mirror (claimreview.ts) and Cofacts 真的假的 (its public GraphQL API, ported from the engine's
// platform/net/cofacts.py, worktree commit 988a52e29). A database that failed is 無法檢查 with why (R2); 查不到 only
// when it answered with nothing (R3). Cofacts articles nobody has replied to come back with `replies: []` -- the
// engine decides how to count them.

import {
  FOUND,
  NOT_FOUND,
  UNCHECKABLE,
  type ClaimReviewHit,
  type CofactsHit,
  type DbAnswer,
  type FactcheckAnswerItem,
} from "@/lib/collect/lookups/contract";
import { lookupClaimReview, type ClaimReviewStore } from "@/lib/collect/lookups/claimreview";
import type { LookupFetch } from "@/lib/collect/lookups/describe";
import { FACTCHECK } from "@/lib/collect/lookups/lists";

const NOTHING_CLOSE = "資料庫裡沒有相近的查核";
const NO_MIRROR = "還沒有下載查核資料";
const COFACTS_DOWN = `${FACTCHECK.cofacts.name} 這次沒有回應`;
const CLAIMREVIEW_DOWN = `${FACTCHECK.claimreview.name}這次沒有回應`;

/** The reply types as Cofacts' own site words them. */
const REPLY_TYPES: Record<string, string> = {
  RUMOR: "含有不實訊息",
  NOT_RUMOR: "含有正確訊息",
  OPINIONATED: "含有個人意見",
  NOT_ARTICLE: "不在查證範圍",
};

const QUERY = `query CollectLookup($text: String!, $match: String!, $first: Int!) {
  ListArticles(filter: {moreLikeThis: {like: $text, minimumShouldMatch: $match}}, orderBy: [{_score: DESC}], first: $first) {
    edges { node { id createdAt articleReplies(statuses: [NORMAL]) { replyType createdAt reply { id text reference } } } }
  }
}`;

export interface FactcheckDeps {
  fetch: LookupFetch;
  claimreview: ClaimReviewStore | null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function day(value: unknown): string {
  const date = text(value, 40).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function answer<Db extends string, Hit>(db: Db, attribution: string, hits: Hit[] | null, why: string): DbAnswer<Db, Hit> {
  if (hits === null) return { db, state: UNCHECKABLE, why, attribution, hits: [] };
  if (!hits.length) return { db, state: NOT_FOUND, why: NOTHING_CLOSE, attribution, hits: [] };
  return { db, state: FOUND, attribution, hits };
}

async function claimreview(textToCheck: string, deps: FactcheckDeps): Promise<DbAnswer<"claimreview", ClaimReviewHit>> {
  const { attribution } = FACTCHECK.claimreview;
  try {
    const found = await lookupClaimReview(textToCheck, deps.claimreview);
    if (found.kind === "hits") return answer("claimreview", attribution, found.hits, "");
    return answer("claimreview", attribution, null, found.kind === "no_mirror" ? NO_MIRROR : CLAIMREVIEW_DOWN);
  } catch {
    return answer("claimreview", attribution, null, CLAIMREVIEW_DOWN);
  }
}

/** Articles like the text, most alike first (Cofacts' own moreLikeThis), at most FACTCHECK.maxHits; null = no answer. */
async function cofactsArticles(textToCheck: string, deps: FactcheckDeps): Promise<CofactsHit[] | null> {
  let body: unknown;
  try {
    const res = await deps.fetch(FACTCHECK.cofacts.apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        query: QUERY,
        variables: { text: textToCheck, match: FACTCHECK.cofacts.minimumShouldMatch, first: FACTCHECK.maxHits },
      }),
    });
    if (!res.ok) return null;
    body = await res.json();
  } catch {
    return null;
  }
  const listed = isObject(body) && isObject(body.data) ? body.data.ListArticles : null;
  if (!isObject(body) || body.errors || !isObject(listed) || !Array.isArray(listed.edges)) return null;
  const articles: CofactsHit[] = [];
  for (const edge of listed.edges) {
    const node = isObject(edge) ? edge.node : null;
    if (!isObject(node) || typeof node.id !== "string" || !node.id) continue;
    const replies: CofactsHit["replies"] = [];
    for (const item of Array.isArray(node.articleReplies) ? node.articleReplies : []) {
      const reply = isObject(item) && isObject(item.reply) ? item.reply : null;
      if (!reply || !text(reply.text, 1)) continue;
      const type = isObject(item) ? item.replyType : null;
      replies.push({
        judged_as: (typeof type === "string" && REPLY_TYPES[type]) || text(type, 40),
        text: text(reply.text, 1200),
        reference: text(reply.reference, 600),
        date: isObject(item) ? day(item.createdAt) : "",
      });
    }
    articles.push({ article_id: node.id, url: `${FACTCHECK.cofacts.site}/article/${node.id}`, date: day(node.createdAt), replies });
  }
  return articles.slice(0, FACTCHECK.maxHits);
}

async function cofacts(textToCheck: string, deps: FactcheckDeps): Promise<DbAnswer<"cofacts", CofactsHit>> {
  return answer("cofacts", FACTCHECK.cofacts.attribution, await cofactsArticles(textToCheck, deps), COFACTS_DOWN);
}

/** One answer item per text, same order (R1); both databases asked at once. Nothing here throws. */
export async function factcheck(texts: string[], deps: FactcheckDeps): Promise<FactcheckAnswerItem[]> {
  return Promise.all(
    texts.map(async (t): Promise<FactcheckAnswerItem> => {
      const [first, second] = await Promise.all([claimreview(t, deps), cofacts(t, deps)]);
      return { text: t, dbs: [first, second] };
    }),
  );
}
