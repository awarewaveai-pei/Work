// LEARN 回顧校準 as the page holds it: the review's shape (ai_lego/core/domain/kinds/learn.py) and the small rules the page
// applies. The lists are copies of the engine's (test_block_learn.WebParityTests compares them). Nothing here scores,
// grades or ranks: a number is never computed from a belief.
import type { Doc, Notice } from "./blocks";
import type { Check, Review } from "./decide";

export const DECISIONS = ["維持判斷", "出新版判斷", "換方法再做一輪", "還沒決定"] as const;
export const PREDICTION_RESULT = ["對上了", "部分對上", "沒對上", "還不知道"] as const;
export const DONE_WHEN = ["做到了", "部分做到", "還沒", "不確定"] as const;
export const DAILY_ABOUT = ["信念", "情緒", "決定"] as const;
export const NEXT_BLOCKS = ["GATHER", "MAP", "THINK", "VERIFY", "COMPUTE", "DECIDE", "ACT", "LEARN", "TEACH", "COLLAB", "EXPRESS"] as const;

// 回顧的四個檢查題（Farrell 的講稿）
export const REVIEW_CHECKS: Array<{ key: string; question: string; example: string }> = [
  { key: "measured_right", question: "我量的是對的東西嗎？", example: "例：「至少殺了很多塔利班」；可是殺得越多，對手招到越多本地人；交火次數一輪比一輪多" },
  { key: "paper_vs_strength", question: "紙上的數字等於實力嗎？", example: "例：帳面 30 萬軍警對 6 至 8 萬塔利班，幾個月內被橫掃" },
  { key: "accumulating", question: "做的人一直換，有沒有累積？", example: "例：每六個月換一個旅，各做各的；當地夥伴只是等下一個人來" },
  { key: "opponent_learns", question: "對手在學，我有沒有跟著改？", example: "例：對手從正面強攻改成土製炸彈，每月攻擊從約 350 起升到近 700 起" },
];
// 信任校準五個面向：信任不是喜歡系統，也不是因為它講得流暢
export const TRUST: Array<{ key: string; name: string; question: string }> = [
  { key: "reliability", name: "可靠性", question: "AI 做相近的事，做對、漏掉、修正和失敗的紀錄是什麼？不要因為一次精彩的輸出就擴大信任。" },
  { key: "predictability", name: "可預測性", question: "它適用的範圍、資料條件、常見的失敗方式是什麼？現在還在可用的範圍內嗎？" },
  { key: "usefulness", name: "實際用處", question: "它實際幫了哪個思考步驟？是「省時間」，還是「真的改善了判斷」？" },
  { key: "context", name: "脈絡完整性", question: "哪些輸入、地方知識、關係訊號、時間條件，它沒看見？你要補，或拒絕下結論。" },
  { key: "bias_dependence", name: "偏誤與依賴", question: "資料偏誤、框架限制、過度順從有沒有出現？要不要主動要反例、換框架，或改用自己的判斷？" },
];

export type Wrong = { source: string; why?: string; cards?: string[] };   // cards: the GATHER cards of the origin picked
export type Calibration = {
  judgment_version: number; outcome: string; prediction_result?: string; prediction_note?: string; missed?: string; review_checks?: Record<string, string>;
  step_done?: string; direction?: string; process?: string; luck?: string; decision?: string; other_method?: string; updated_conditions?: string;
  done_when_met?: string; trust?: Record<string, string>; delegate_note?: string; next_blocks?: string[]; wrong_sources?: Wrong[];
};
export type Move = { item: string; seen: string };
export type Compare = { side_by_side: string; done_well?: string[]; practice?: string };
export type OpenCase = Extract<Notice, { type: "suggest_case" }>;   // GOVERN's (block_hooks/govern.py)

export type AiRow = { from: string; author: string; said: string; took: string };
const cut = (text: string, length = 160): string => (text.length > length ? `${text.slice(0, length)}…` : text);

/** What the AI said in this case, and whether the person took it (系統把這些並排: AI 當時提了什麼、你採納還是拒絕). Only what
 *  the records hold: an AI offer the person dropped leaves its decision, never its words. */
export function whatTheAiSaid(input: {
  checks: Array<Doc<Check>>; reviews: Array<Doc<Review>>;
  mirrors: Array<Doc<{ summary: string }>>; senseReviews: Array<Doc<{ mirror: string; version: number; decision: string }>>;
  thinkCards: Array<Doc<{ claim?: string }>>; thinkReactions: Array<Doc<{ card: string; reaction?: string; picked?: boolean }>>; mapReviews: Array<Doc<{ decision: string }>>;
}): AiRow[] {
  const rows: AiRow[] = [];
  for (const check of input.checks) {
    const answer = input.reviews.filter((review) => review.content.check === check.doc_id).at(-1);
    const parts = [
      ...(check.content.reversibility?.length ? [`不能反悔：${check.content.reversibility.join("、")}`] : []), ...(check.content.gaps?.length ? [`還空著：${check.content.gaps.join("、")}`] : []),
      ...(check.content.contradictions?.length ? [`前後矛盾：${check.content.contradictions.join("、")}`] : []), ...(check.content.question ? [`問：${check.content.question}`] : []),
    ];
    rows.push({ from: "判斷：AI 的檢查", author: check.author, said: cut(parts.join("；") || "沒有指出什麼"), took: answer ? `你確認了 ${answer.content.irreversible?.length ?? 0} 個不能反悔的地方${answer.content.hold ? `，選了「${answer.content.hold}」` : ""}` : "還沒回應" });
  }
  for (const mirror of input.mirrors) {
    const decision = input.senseReviews.filter((review) => review.content.mirror === mirror.doc_id && review.content.version === mirror.version).at(-1)?.content.decision;
    rows.push({ from: "外化：AI 當鏡子", author: mirror.author, said: cut(mirror.content.summary), took: decision ? `你${decision === "改寫" ? "改寫了" : `${decision}了`}` : "還沒回應" });
  }
  const kept = new Set(input.mirrors.map((mirror) => mirror.doc_id));
  const dropped = input.senseReviews.filter((review) => review.content.decision === "刪掉" && !kept.has(review.content.mirror)).length;
  if (dropped) rows.push({ from: "外化：AI 當鏡子", author: "ai", said: "（你刪掉的整理，內容不留）", took: `你刪掉了 ${dropped} 份` });
  const reactionOf = new Map(input.thinkReactions.map((reaction) => [reaction.content.card, reaction.content]));   // your reaction is your own record (think.reaction)
  for (const card of input.thinkCards) {
    const mine = reactionOf.get(card.doc_id);
    rows.push({ from: "共思考：AI 的卡", author: card.author, said: cut(card.content.claim ?? ""), took: mine?.picked ? "你選了帶走" : mine?.reaction ? `你的反應：${mine.reaction}` : "還沒回應" });
  }
  const used = input.mapReviews.filter((review) => review.content.decision === "採用").length;
  const unused = input.mapReviews.length - used;
  if (input.mapReviews.length) rows.push({ from: "拆解：AI 的建議", author: "ai", said: `共 ${input.mapReviews.length} 條建議`, took: `你採用 ${used} 條、不採用 ${unused} 條` });
  return rows;
}

const dayOf = (iso: string): string => iso.slice(0, 10);
/** The Monday (YYYY-MM-DD) of the ISO week a calendar day is in -- the engine counts the weekly sprints by the same week. */
export function weekStart(day: string): string {
  const moment = new Date(`${dayOf(day)}T00:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() - ((moment.getUTCDay() + 6) % 7));
  return moment.toISOString().slice(0, 10);
}
/** How many of the person's sprints (their days, YYYY-MM-DD) fall in the same week as ``today``. */
export const sprintsThisWeek = (days: string[], today: string): number => days.filter((day) => weekStart(day) === weekStart(today)).length;
/** The weekly sprint choices: not set, or the 2 to 3 the card names. */
export const SPRINTS = [0, 2, 3] as const;
