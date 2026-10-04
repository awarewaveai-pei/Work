// DECIDE 判斷 as the page holds it: the card's shape (ai_lego/core/domain/kinds/decide.py `decide.judgment`) and the small
// rules the page applies. The lists and the no-change pattern are copies of the engine's: test_block_decide.WebParityTests
// compares them, so a word changed on one side fails there.
import { CHECKABLE, NOT_TRUSTED, live, type CheckedClaim, type Evidence } from "./evidence";
import { blockOf } from "./blocks";

export const INTENSITY = ["弱", "中", "強"] as const;
export const CREDIBILITY = ["高", "中", "低", "還不知道"] as const;   // 可信不可信由你標：系統只給出處數
export const HOLD = ["先等一下", "請人覆核", "我想過了，照做"] as const;
export const UNWINNABLE = ["退出", "止損", "換目標"] as const;
export const ASKED_ANSWER = ["有", "沒有", "不確定"] as const;
// 「什麼會改變結論」答「沒有」：接受，並標「這一版不打算改」
export const NO_CHANGE = /^[\s「『\"'（(]*(沒有|没有|無|无|沒有任何證據|没有任何证据|none|no|nothing)[\s」』\"'）)。.!！]*$/i;
export const wontChange = (text: unknown): boolean => typeof text === "string" && NO_CHANGE.test(text.trim());

export const STOP_QUESTIONS: Array<{ key: string; question: string }> = [
  { key: "unknown", question: "哪些未知資訊，真的可能改變決策？" },
  { key: "value_vs_delay", question: "再蒐集資訊的價值，是否大於延遲行動的成本？" },
  { key: "reversible_enough", question: "目前的不確定性，是否已足以採取可逆行動？" },
  { key: "exit_or_escalate", question: "何時應退出、暫停或升級處理？" },
];
// 下決定前的四個檢查題（Farrell 的講稿）
export const PRE_CHECKS: Array<{ key: string; question: string; example: string }> = [
  { key: "resources", question: "資源是照這件事需要給的，還是照別的上限給的？", example: "例：財政部先設了 10 億英鎊上限；首批 3,300 人、6 架運輸直升機" },
  { key: "warned", question: "有沒有人警告過，卻沒人聽？", example: "例：走過當地的人說去那裡是瘋了；國防大臣說希望一槍不發，頭六個月打了近 50 萬發" },
  { key: "pulled", question: "是不是被合作的對象拉著走？", example: "例：省長施壓，英軍分兵去守北邊縣城，成了吸引攻擊的磁鐵" },
  { key: "deadline", question: "宣布期限，會不會改變所有人的行為？", example: "例：宣布 2014 年撤軍之後：自己忙著撤、顧問沒人聽、對手只要等" },
];
// 系統問你有沒有在影響這個判斷的八項
export const ASKED: Array<{ who: string; hint: string }> = [
  { who: "家庭", hint: "家人怎麼看、希望你怎麼做" },
  { who: "文化", hint: "你所在的文化把什麼當成理所當然" },
  { who: "宗教", hint: "信仰或教團有沒有在影響你" },
  { who: "法律", hint: "有沒有法律或程序把你框住" },
  { who: "你所在的制度", hint: "學校、公司、組織的規矩" },
  { who: "演算法", hint: "你常看的推薦、動態，讓你看到什麼" },
  { who: "帶領者", hint: "帶你走這件事的人" },
  { who: "做研究的人", hint: "跟你做研究、訪談你的人" },
];

// 護欄 as the person reads them (ai_lego/core/domain/kinds/govern.py GUARDRAILS)
export const GUARDRAIL_NAME: Record<string, string> = { require_sources: "要求來源", professional: "建議找專業的人", wait_or_review: "先等一下或請人覆核", group_procedure: "群組程序" };

// claim / claim_version: the VERIFY claim it came from; against: origins opposing it; cards: a MAP fact's source cards (counted live)
export type Fact = { text: string; sources: number; self_said: boolean; credibility?: string; claim?: string; claim_version?: number; against?: number; cards?: string[] };
export type Influence = { kind: "voice" | "single_source" | "ai_think" | "method" | "ai" | "platform" | "facilitator"; text: string };
export type Asked = { who: string; answer: string; note?: string };
export type Judgment = {
  conclusion?: string; problem_definition?: string; facts?: Fact[]; assumptions?: string; norm_context?: string; alternative?: string;
  options?: string[]; criteria?: string; uncertainty?: string; change_condition?: string; next_step?: string; deciders?: string; affected?: string[];
  revision_reason?: string; confidence?: number; stop_answers?: Record<string, string>; pre_checks?: Record<string, string>; intensity_now?: string;
  influences_listed?: Influence[]; influences_asked?: Asked[]; influences_added?: string[];
};
export type Check = { clarity?: string[]; reversibility?: string[]; revisitable?: string; out_of_scope?: string[]; gaps?: string[]; contradictions?: string[]; question?: string };
export type Review = { check: string; version: number; irreversible?: string[]; hold?: string; reviewer?: string; note?: string };

// 判斷卡 11 個必要欄位（「決策者與受影響者」是一格，兩個欄位）
export const CELLS: Array<{ label: string; keys: Array<keyof Judgment> }> = [
  { label: "問題怎麼被定義", keys: ["problem_definition"] },
  { label: "已知事實、來源與可信度", keys: ["facts"] },
  { label: "假設和依據", keys: ["assumptions"] },
  { label: "涉及的規範脈絡", keys: ["norm_context"] },
  { label: "替代假設或反例", keys: ["alternative"] },
  { label: "判準和權衡", keys: ["criteria"] },
  { label: "仍然不確定的地方", keys: ["uncertainty"] },
  { label: "什麼會改變結論", keys: ["change_condition"] },
  { label: "下一步", keys: ["next_step"] },
  { label: "決策者與受影響者", keys: ["deciders", "affected"] },
];

const blank = (value: unknown): boolean => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0) || (typeof value === "string" && !value.trim());

/** The cells still empty (the system's check: 每一格、停止分析的四題，有沒有填). 修訂理由 counts from the second version on. */
export function emptyCells(judgment: Judgment, version: number): string[] {
  const missing = [
    ...(blank(judgment.conclusion) ? ["暫定結論"] : []),
    ...CELLS.filter((cell) => cell.keys.every((key) => blank(judgment[key]))).map((cell) => cell.label),
    ...STOP_QUESTIONS.filter((item) => blank(judgment.stop_answers?.[item.key])).map((item) => `停止分析：${item.question}`),
  ];
  return version > 1 && blank(judgment.revision_reason) ? [...missing, "修訂理由"] : missing;
}

/** Why the card cannot be saved yet, or null. Only what the card makes required (信心、不確定性、什麼會改變它、情緒強度);
 *  the other cells may stay empty in a draft -- the page lists them. A new version needs its reason. */
export function cannotSave(judgment: Judgment, version: number): string | null {
  if (!judgment.intensity_now) return "先選現在的情緒和急迫感多強。";
  if (blank(judgment.uncertainty)) return "「仍然不確定的地方」要寫；真的不知道，就寫「不知道」。";
  if (blank(judgment.change_condition)) return "「什麼會改變結論」要寫；寫「沒有」也可以。";
  if (typeof judgment.confidence !== "number" || !Number.isInteger(judgment.confidence) || judgment.confidence < 0 || judgment.confidence > 100) return "信心要填 0 到 100 的整數。";
  if (version > 1 && blank(judgment.revision_reason)) return "出新的一版，要寫這一版為什麼改。";
  return null;
}

/** The one line under a fact: how many independent sources it has, or that it is the person's own say. */
/** A fact as it stands now (STEP2_SHARED_RULES §3: a stored count is a pointer, never a fact). Only `current` makes one,
 *  so a reader of a count or a label cannot be handed the stored copy -- tsc refuses it. The drift notes are the one
 *  reader of the stored copy, and their job is to say it differs. */
export type CurrentFact = Fact & { readonly asOfNow: true; standing?: string };
/** Why a fact brought from VERIFY no longer carries a count; the DECIDE check reads the same (tests/fixtures/fact_standing.json). */
export const STANDING = { deleted: "查證那一步已經沒有這個主張", older: "查證那一步改過這個主張，這句是舊的說法", not_usable: "查證那一步現在不能當事實" } as const;

export function current(fact: Fact, evidence: Evidence): CurrentFact {
  if (fact.cards?.length) return { ...live(fact, evidence), asOfNow: true };
  if (!fact.claim) return { ...fact, asOfNow: true };
  const { against: _stored, ...rest } = fact;
  const claim = evidence.claims.find((item) => item.claim_id === fact.claim);
  if (!claim) return { ...rest, sources: 0, self_said: false, asOfNow: true, standing: STANDING.deleted };
  if (claim.version !== fact.claim_version) return { ...rest, sources: 0, self_said: false, asOfNow: true, standing: STANDING.older };
  const counts = { sources: claim.support.length, self_said: false, ...(claim.oppose.length ? { against: claim.oppose.length } : {}) };
  return { ...rest, ...counts, asOfNow: true, ...(claim.usable ? {} : { standing: STANDING.not_usable }) };
}

export function sourceLine(fact: CurrentFact): { text: string; warn: boolean } {
  if (fact.standing) return { text: fact.standing, warn: true };
  if (fact.self_said) return { text: "我自己說的，還沒有外部出處", warn: true };
  if (fact.against) return { text: `${fact.sources} 個獨立出處支持、${fact.against} 個反對`, warn: true };
  if (fact.sources >= 2) return { text: `${fact.sources} 個獨立出處`, warn: false };
  return { text: fact.sources === 1 ? "只靠 1 個出處" : "查不到出處", warn: true };
}

export type MapView = { method?: string; unwinnable?: boolean; layers?: Record<string, Array<{ text: string; card?: string; sources?: number; self_said?: boolean; cards?: string[] }>> };

/** The map as DECIDE reads it: every linked fact with the count the server gives now (never the copy the map stored). */
export const liveMap = (map: MapView | null, evidence: Evidence): MapView | null =>
  map && { ...map, layers: { ...map.layers, facts: (map.layers?.facts ?? []).map((item) => live(item, evidence)) } };
export type CardView = { doc_id: string; content: { category?: string; text?: string; from_whom?: string } };
export type ThinkCardView = { author: string; content: { claim?: string } };

const mapItems = (map: MapView | null) => Object.values(map?.layers ?? {}).flat();

/** The map's facts as the card holds them (the person's own say when the map does not say otherwise). */
export const mapFacts = (map: MapView | null): Fact[] => (map?.layers?.facts ?? []).map((item) => ({ text: item.text, sources: item.sources ?? 0, self_said: item.self_said !== false, ...(item.cards?.length ? { cards: item.cards } : {}) }));

/** The map's facts not on the card yet, added after the ones already there; what the person already wrote stays as it is. */
export const withMapFacts = (held: Fact[], map: MapView | null): Fact[] => [...held, ...mapFacts(map).filter((fact) => !held.some((item) => item.text === fact.text))];

/** 地圖上「別人的聲音」那幾張卡: only the SENSE cards a map item was made from, and only of that category -- the cards that
 *  are not on the map are not read (the card: 只讀強度，不讀外化素材裡的卡片；放進地圖的卡片跟著地圖讀到). */
export function voicesOnMap(map: MapView | null, cards: CardView[]): Array<{ text: string; from_whom?: string }> {
  const placed = new Set(mapItems(map).map((item) => item.card).filter(Boolean));
  return cards.filter((card) => placed.has(card.doc_id) && card.content.category === "別人的聲音" && card.content.text).map((card) => ({ text: card.content.text!, from_whom: card.content.from_whom }));
}

/** What the system lists as possibly influencing the person (系統做什麼): the voices on the map, facts resting on one source
 *  or none, AI-written or jointly written thinking cards, the method used; the AI, this platform and -- when someone leads
 *  the case -- the facilitator are always on it. Stored with the version the person saves. */
export function influencesFrom(input: { facts: Fact[]; map: MapView | null; evidence: Evidence; voices: Array<{ text: string; from_whom?: string }>; thinkCards: ThinkCardView[]; facilitated: boolean }): Influence[] {
  const facts = [...input.facts, ...mapFacts(input.map).filter((fact) => !input.facts.some((held) => held.text === fact.text))].map((fact) => current(fact, input.evidence));
  const listed: Influence[] = [
    ...input.voices.map((voice) => ({ kind: "voice" as const, text: `別人的聲音：「${voice.text}」${voice.from_whom ? `（來自：${voice.from_whom}）` : ""}` })),
    ...facts.filter((fact) => fact.text.trim() && sourceLine(fact).warn).map((fact) => ({ kind: "single_source" as const, text: `「${fact.text}」：${sourceLine(fact).text}` })),
    ...input.thinkCards.filter((card) => (card.author === "ai" || card.author === "joint") && card.content.claim).map((card) => ({ kind: "ai_think" as const, text: `${card.author === "ai" ? "AI 寫的" : "AI 起草、你改過的"}思考卡：「${card.content.claim}」` })),
    ...(input.map?.method ? [{ kind: "method" as const, text: `這次用的拆法：${input.map.method}` }] : []),
    { kind: "ai", text: "AI：它整理、提問、檢查過你寫的東西，說法會影響你怎麼想。" },
    { kind: "platform", text: "這個平台本身：問哪些問題、用什麼順序、列哪些選項，都是它定的。" },
    ...(input.facilitated ? [{ kind: "facilitator" as const, text: `${blockOf("FACILITATE")?.name ?? "帶領者"}：有人帶這個案子，帶領者的提問和說法也可能影響你。` }] : []),
  ];
  return listed;
}

/** VERIFY's checked facts the person judged 採信 or 存疑, offered as judgment-card facts with their supporting origins
 * (查證結果交給 DECIDE，當判斷卡上的已知事實). 不採信 is not offered; can it be trusted stays the person's mark. */
export function withCheckedClaims(facts: Fact[], claims: CheckedClaim[]): Fact[] {
  const offered = claims
    .filter((claim) => claim.usable)   // the server's one rule (evidence.usable_as_fact)
    .filter((claim) => !facts.some((fact) => fact.claim === claim.claim_id || fact.text === claim.text))
    .map(factOf);
  return [...facts, ...offered];
}

const factOf = (claim: CheckedClaim): Fact => ({ text: claim.text, sources: claim.support.length, self_said: false, claim: claim.claim_id, claim_version: claim.version, ...(claim.oppose.length ? { against: claim.oppose.length } : {}) });

/** A fact brought from the map whose stored count is not the count its source cards give now (null = it is). */
export function mapDrift(fact: Fact, evidence: Evidence): string | null {
  if (!fact.cards?.length) return null;
  const now = live(fact, evidence).sources;
  return now === fact.sources ? null : `出處數變了：現在 ${now} 個獨立出處`;
}

/** Why a fact brought from VERIFY no longer says what the ledger says now (null = it still does). */
export function claimDrift(fact: Fact, claims: CheckedClaim[]): string | null {
  if (!fact.claim) return null;
  const claim = claims.find((item) => item.claim_id === fact.claim);
  if (!claim) return "這個主張在查證那一步刪掉了";
  if (claim.version !== fact.claim_version || claim.verdict?.earlier) return "這個主張在查證那一步改過了";
  if (!claim.verdict) return "你在查證那一步拿掉了判定";
  if (claim.verdict.verdict === NOT_TRUSTED) return "你在查證那一步改成不採信";
  if (!claim.usable) return "現在沒有算數的出處支持它";
  if (claim.support.length !== fact.sources || claim.oppose.length !== (fact.against ?? 0)) return `出處變了：現在 ${claim.support.length} 個支持、${claim.oppose.length} 個反對`;
  return null;
}

/** The fact as the ledger says it now; null when it should come off the card (gone, or no longer trusted). */
export function refreshed(fact: Fact, claims: CheckedClaim[]): Fact | null {
  const claim = claims.find((item) => item.claim_id === fact.claim);
  if (!claim || !claim.usable) return null;
  const { against: _old, ...rest } = fact;
  return { ...rest, ...factOf(claim), credibility: fact.credibility };
}

/** People named on the card as affected that the case's intake does not list yet: they are written back to the intake. */
export function newPeople(intake: string[], mine: string[]): string[] {
  const known = new Set(intake.map((name) => name.trim()));
  return [...new Set(mine.map((name) => name.trim()).filter((name) => name && !known.has(name)))];
}

/** 不能反悔的決定，這個案子有護欄 wait_or_review 時：你確認了不能反悔的地方，卻還沒選先等一下或請人覆核。 */
export const holdAsked = (guardrails: string[], irreversible: string[], hold?: string): boolean => guardrails.includes("wait_or_review") && irreversible.length > 0 && !hold;

/** 現在我要自己下結論 binds the version being written and the one last saved (mirrors ai_actions/decide.py sealed()). */
export const sealedNow = (latestVersion: number, sealedVersions: number[]): boolean => sealedVersions.includes(latestVersion) || sealedVersions.includes(latestVersion + 1);

export const intensityAdvice = (intensity: string | undefined): string =>
  intensity === "強" ? "情緒和急迫感很強時，建議把不能反悔的決定延後。要等多久，由你定。" : "";

export const VERSION_ROWS: Array<{ key: keyof Judgment; label: string }> = [
  { key: "conclusion", label: "暫定結論" }, { key: "confidence", label: "信心（%）" }, { key: "change_condition", label: "什麼會改變結論" }, { key: "uncertainty", label: "仍然不確定的地方" },
  { key: "criteria", label: "判準和權衡" }, { key: "alternative", label: "替代假設或反例" }, { key: "assumptions", label: "假設和依據" }, { key: "next_step", label: "下一步" },
  { key: "intensity_now", label: "下判斷前的情緒強度" }, { key: "revision_reason", label: "這一版為什麼改" },
];
const show = (value: unknown): string => (value === undefined || value === null ? "" : Array.isArray(value) ? value.join("、") : String(value));

/** Two versions of the card as rows of two columns; a row is marked when the two differ. Every old version stays (舊版不刪). */
export function versionRows(a: Judgment, b: Judgment): Array<{ label: string; a: string; b: string; changed: boolean }> {
  return VERSION_ROWS.map(({ key, label }) => ({ label, a: show(a[key]), b: show(b[key]), changed: show(a[key]) !== show(b[key]) })).filter((row) => row.a || row.b);
}
