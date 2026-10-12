// What EXPRESS offers to carry into a draft, and how each record is named (walk B7: the picker listed 40+ sources with
// set-aside ones, 「其他紀錄：<id>」, and a SENSE 事件 card as 「感受」). The drawers are the contract card's
// (EXPRESS reads judge, map, claims, calc, source, think, act, sense, review: supervisor DRAWER_READS.EXPRESS); in each,
// only the records a person writes or reads as a statement are offered -- the bookkeeping beside them (groupings,
// answers to an AI offer, search runs) is not. Every label says what the record is in words, never an id.
import { AUTHOR, type Doc } from "../../lib/blocks";

type Content = Record<string, unknown>;
type Describe = (content: Content) => string;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const host = (value: unknown): string => { try { return new URL(text(value)).hostname.replace(/^www\./, ""); } catch { return ""; } };
const first = (value: unknown, key: string): string => (Array.isArray(value) && value[0] && typeof value[0] === "object" ? text((value[0] as Content)[key]) : "");
const or = (value: string, none: string) => value || none;

/** The drawers a draft can carry from, in the order the page lists them; kind -> how one record of it is named. */
export const DRAWERS: Array<{ name: string; kinds: Record<string, Describe> }> = [
  { name: "判斷卡", kinds: {
    "decide.judgment": (c) => `判斷卡：${or(text(c.conclusion), "（還沒寫結論）")}`,
  } },
  { name: "地圖", kinds: {
    "map.map": (c) => `六層地圖${text(c.method) ? `（用「${text(c.method)}」拆）` : ""}${text(c.core_conflict) ? `：核心矛盾是「${text(c.core_conflict)}」` : ""}`,
  } },
  { name: "主張帳本", kinds: {
    "verify.message": (c) => `要查的訊息：${or(text(c.text), "（貼的是連結）")}`,
    "verify.claim": (c) => `主張：${text(c.text)}`,
    "verify.verdict": (c) => `你的查證判定「${text(c.verdict)}」：${text(c.reason)}`,
    "verify.summary": (c) => `查證摘要：${or(text(c.overview), first(c.lines, "text"))}`,
  } },
  { name: "計算", kinds: {
    "compute.run": (c) => `計算：${or(text(c.question), "（沒寫要算什麼）")}（${or(text(c.label), "計算結果")}）`,
    "compute.adopt": (c) => `你${text(c.adopt)}這次計算${text(c.reason) ? `：${text(c.reason)}` : ""}`,
    "compute.explanation": (c) => `計算的白話解釋：最影響結果的是「${text(c.influential)}」`,
  } },
  { name: "來源", kinds: {
    "gather.source": (c) => `來源卡：${or(text(c.title), or(host(c.url), "你貼的檔案"))}`,
    "gather.own": (c) => `我自己說的：${text(c.text)}`,
    "gather.mark": (c) => `你對出處的標記「${text(c.mark)}」：${text(c.reason)}`,
    "gather.ai_says": (c) => `來源摘要：${or(first(c.items, "says"), "（沒有摘要）")}`,
  } },
  { name: "思考卡", kinds: {
    "think.round": (c) => `共思考的一輪：${text(c.problem)}`,
    "think.card": (c) => `思考卡：${text(c.claim)}`,
  } },
  { name: "行動與觀察", kinds: {
    "act.task": (c) => `任務卡：${text(c.title)}`,
    "act.note": (c) => `觀察紀錄：${or(text(c.happened), or(text(c.thoughts), or(text(c.adjustment), "（只記了數字）")))}`,
  } },
  { name: "外化素材", kinds: {
    "sense.card": (c) => `${or(text(c.category), "外化卡")}：${text(c.text)}`,   // the card's own category: 事件 is 事件, not 感受
    "sense.state": (c) => `你標的狀態：${text(c.emotion)}，強度「${text(c.intensity)}」`,
    "sense.mirror": (c) => `外化的整理：${text(c.summary)}`,
  } },
  { name: "回顧", kinds: {
    "learn.calibration": (c) => `回顧：${text(c.outcome)}`,
    "learn.compare": (c) => `前後比較：${text(c.side_by_side)}`,
  } },
];

const DESCRIBE: Record<string, Describe> = Object.assign({}, ...DRAWERS.map((drawer) => drawer.kinds));

/** A record offered in the picker: the kinds above only. */
export const offered = (record: { kind: string }): boolean => record.kind in DESCRIBE;
/** A source card set aside (放一旁): offered only under its own folded line. */
export const setAside = (record: { kind: string; content: Content }): boolean => record.kind === "gather.source" && text(record.content.aside) !== "";

const short = (line: string, max = 90) => (line.length > max ? `${line.slice(0, max)}…` : line);

/** What a record is, in words: its kind's name and its own text, and who wrote it when that was not you; never an id. */
export function recordName(record: { kind: string; content?: Content; author?: Doc["author"] }): string {
  const describe = DESCRIBE[record.kind];
  const line = describe ? describe(record.content ?? {}) : "這個案子的另一筆紀錄";
  const by = record.author === "ai" || record.author === "joint" ? `（${AUTHOR[record.author]}）` : "";
  return `${short(line)}${by}`;
}
