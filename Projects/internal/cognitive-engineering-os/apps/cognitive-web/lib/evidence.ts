// What GATHER, VERIFY and COMPUTE hand to the other blocks (GET /projects/{id}/evidence; the counting happens once, in
// ai_lego/platform/evidence.py). Pages show these lines; they never recount origins themselves.
import { apiFetch } from "./api";

export type Cell = { state: "查到" | "查不到" | "無法檢查"; value?: string; why?: string };
export type OriginCard = {
  card: string; version: number; source_id: string; url: string; title: string; aside: string;
  found_by: { by: string; provider?: string; lang?: string; query?: string; angle?: string };
  cells: Record<string, Cell>; lists?: Array<{ list: string; category: string; maintainer: string; version: string }>;
  snapshot?: { sha256: string; fetched_at: string }; mine: Record<string, { value: string; reason: string }>;
};
export type Origin = {
  origin_id: string; cards: OriginCard[]; how: string; pending: boolean; aside: boolean; counts: boolean;
  mark: { mark: string; reason: string; applies?: string } | null; wrong_in_review?: string[];
};
export type CheckedClaim = {
  claim_id: string; version: number; text: string; sentence: string; law: boolean; state: string;
  support: string[]; oppose: string[]; stale: number; few: boolean; verdict: { verdict: string; reason: string; earlier: boolean } | null;
  usable: boolean;   // evidence.usable_as_fact: the one rule for standing as a fact (THINK's 有來源, DECIDE's 帶進來)
};
export type CalcInput = { name: string; value: number; unit?: string; cards?: string[]; own?: boolean };
export type Calc = {
  run_id: string; version: number; at: string; question?: string; label: string; algorithm: { id: string; version: string; name: string };
  formula?: string; inputs: CalcInput[]; result: { range?: { low: number; high: number; unit?: string } } & Record<string, unknown>;
  flip?: { input: string; at: number } | null; thin_inputs: string[]; adopt: { adopt: string; reason?: string } | null;
};
export type Evidence = { origins: Origin[]; changed_marks: Array<{ origin: string; cards: string[]; mark: string }>; claims: CheckedClaim[]; calcs: Calc[]; min_origins: number };

export const NONE: Evidence = { origins: [], changed_marks: [], claims: [], calcs: [], min_origins: 2 };
export const caseEvidence = (projectId: string) => apiFetch<Evidence>(`/projects/${encodeURIComponent(projectId)}/evidence`);

/** How many independent origins that count stand behind these cards (the server decided which count). */
export function originsBehind(evidence: Evidence, cards: string[]): number {
  const wanted = new Set(cards);
  return evidence.origins.filter((origin) => origin.counts && origin.cards.some((card) => wanted.has(card.card))).length;
}

/** The words the engine writes (ai_lego/core/domain/evidence_words.py); a test compares them. */
export const CHECKABLE = "可以查的事實";
export const NOT_SEARCHED = "還沒查";
export const NOT_TRUSTED = "不採信";

/** A linked fact (MAP's, or one brought onto the judgment card) with the count the server gives now; an unlinked one as it is. */
export function live<T extends { cards?: string[]; sources?: number; self_said?: boolean }>(item: T, evidence: Evidence): T {
  return item.cards?.length ? { ...item, sources: originsBehind(evidence, item.cards), self_said: false } : item;
}

/** Was anything actually checked: a checkable claim the system has looked for (not just sentences listed). */
export const somethingChecked = (evidence: Evidence) => evidence.claims.some((claim) => claim.sentence === CHECKABLE && claim.state !== NOT_SEARCHED);

/** What a page calls an origin: its first card's title, or its address. */
export function originName(origin: Origin): string {
  const first = origin.cards[0];
  if (!first) return "（沒有網頁）";
  const where = (() => { try { return new URL(first.url).hostname; } catch { return first.url; } })();
  const more = origin.cards.length > 1 ? `（同一組 ${origin.cards.length} 頁）` : "";
  return `${first.title || where || "（沒有標題）"}${where && first.title ? `｜${where}` : ""}${more}`;
}

/** One line a page shows for a checked claim: its state, the origins either way, the person's verdict. */
export function claimLine(claim: CheckedClaim, min = 2): string {
  const sides = claim.sentence === CHECKABLE ? `：${claim.support.length} 個出處支持、${claim.oppose.length} 個反對` : "";
  const few = claim.few && claim.sentence === CHECKABLE ? `（出處不到 ${min} 個）` : "";
  const verdict = claim.verdict ? `；你判定「${claim.verdict.verdict}」${claim.verdict.earlier ? "（判的是改之前的主張）" : ""}` : "；你還沒判定";
  return `${claim.state}${sides}${few}${verdict}`;
}

/** One line a page shows for a calculation: label, method, the range, the person's 採用／不採用. */
export function calcLine(calc: Calc, min = 2): string {
  const range = calc.result?.range;
  const span = range ? `${range.low}～${range.high}${range.unit ? ` ${range.unit}` : ""}` : "沒有範圍";
  const thin = calc.thin_inputs.length ? `；${calc.thin_inputs.join("、")}的出處不到 ${min} 個` : "";
  const adopt = calc.adopt ? `；你${calc.adopt.adopt}` : "；你還沒決定採不採用";
  return `${calc.label}（${calc.algorithm.name}）：${span}${thin}${adopt}`;
}
