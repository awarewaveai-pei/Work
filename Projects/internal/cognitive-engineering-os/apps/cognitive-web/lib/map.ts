// MAP 拆解 as the pages hold it: the map's shape (ai_lego/core/domain/kinds/map.py `map.map`) and the small rules the page
// applies to it. The words (layers, questions, claim kinds) come from GET /blocks/map/spec, not from here.
import { live, originsBehind, type Evidence } from "./evidence";
import type { Author } from "./blocks";

export type By = Exclude<Author, "system">;   // who wrote a line: user | ai | joint
export type Item = { id: string; text: string; by: By; card?: string; group?: string; place?: string; sources?: number; self_said?: boolean; cards?: string[] };   // cards: GATHER source cards
export type Claim = { id: string; text: string; kind: string; by: By; item?: string; details?: Record<string, string> };
export type Answer = { q: number; answer: string; note?: string };
export type MapContent = {
  method?: string; method_id?: string; method_version?: string; one_lines?: Record<string, string>; layers?: Record<string, Item[]>; skipped?: string[];
  core_conflict?: string; claims?: Claim[]; gaps?: string[]; assumptions?: Array<{ text: string; by: By }>;
  unwinnable?: boolean; unwinnable_answers?: Answer[];
};
export type MapSpec = {
  layers: Array<{ key: string; name: string; question: string; output: string }>;
  claim_kinds: Array<{ kind: string; needs: string; details: Array<{ key: string; label: string }> }>;
  unwinnable: { questions: Array<{ q: number; question: string; example: string }>; answers: string[]; reasons: string[]; reasons_reading: string; source: string };
};
export type SenseCard = { category: string; text: string };
export type Placement = { card: string; layer: string };
export type Tool = { method_id: string; name: string; family: string; family_zh: string; version: string; used: boolean };

export const FACT_CATEGORY = "事件";   // only a card that says what happened may be offered as a fact by the AI

export const newId = () => Math.random().toString(36).slice(2, 10);
export const itemsOf = (content: MapContent, layer: string): Item[] => content.layers?.[layer] ?? [];
export const withItems = (content: MapContent, layer: string, items: Item[]): MapContent => ({ ...content, layers: { ...content.layers, [layer]: items } });
export const allItems = (content: MapContent): Item[] => Object.values(content.layers ?? {}).flat();

/** A card put into a layer: a copy of its words (editing or deleting the card later does not change the map). */
export function placeCard(content: MapContent, layer: string, doc: { doc_id: string; content: SenseCard }): MapContent {
  const item: Item = { id: newId(), text: doc.content.text, by: "user", card: doc.doc_id, ...(layer === "facts" ? { sources: 0, self_said: true } : {}) };
  return withItems(content, layer, [...itemsOf(content, layer), item]);
}

export const unplacedCards = <D extends { doc_id: string }>(cards: D[], content: MapContent): D[] => {
  const placed = new Set(allItems(content).map((item) => item.card).filter(Boolean));
  return cards.filter((card) => !placed.has(card.doc_id));
};

/** What the AI suggested that the page may offer: a card not in a layer yet, a real layer, and a fact only from an 事件 card
 *  (a feeling, a fear or a story is never offered as a fact, however the model labelled it). */
export function usablePlacements(placements: Placement[] | undefined, cards: Array<{ doc_id: string; content: SenseCard }>, content: MapContent, layers: string[]): Placement[] {
  const open = new Map(unplacedCards(cards, content).map((card) => [card.doc_id, card.content.category]));
  return (placements ?? []).filter((item) => open.has(item.card) && layers.includes(item.layer) && (item.layer !== "facts" || open.get(item.card) === FACT_CATEGORY));
}

/** Layers with nothing in them, and the layer(s) with the least among those that have something; a skipped layer is neither. */
export function layerFlags(content: MapContent, layers: string[]): { empty: string[]; thinnest: string[] } {
  const live = layers.filter((layer) => !(content.skipped ?? []).includes(layer));
  const counts = live.map((layer) => [layer, itemsOf(content, layer).length] as const);
  const filled = counts.filter(([, count]) => count > 0);
  const least = Math.min(...filled.map(([, count]) => count));
  const most = Math.max(...filled.map(([, count]) => count));
  return { empty: counts.filter(([, count]) => count === 0).map(([layer]) => layer), thinnest: filled.length > 1 && least < most ? filled.filter(([, count]) => count === least).map(([layer]) => layer) : [] };
}

/** A fact from outside with fewer than two independent sources: the AI stops on it until the person says so (mirrors kinds/map.py thin_facts). */
export const thinFacts = (content: MapContent, evidence: Evidence): Item[] => itemsOf(content, "facts").map((item) => live(item, evidence))
  .filter((item) => item.self_said !== true && !(typeof item.sources === "number" && item.sources >= evidence.min_origins));   // no mark = from outside, as the server reads it

/** The line under a fact: how many independent sources it has, or that it is the person's own say. */
export function sourceLine(item: Item): { text: string; warn: boolean } {
  if (item.self_said !== false) return { text: "我自己說的，還沒有外部出處", warn: true };
  const count = typeof item.sources === "number" ? item.sources : 0;
  return count >= 2 ? { text: `${count} 個獨立出處`, warn: false } : { text: count === 1 ? "只有 1 個出處" : "查不到出處", warn: true };
}

/** A fact linked to source cards carries the count the server would give (never more: the save check refuses that);
 * with no cards left it is the person's own say again. */
export function linkSources(item: Item, cards: string[], evidence: Evidence): Item {
  if (!cards.length) return { ...item, cards: undefined, sources: 0, self_said: true };
  return { ...item, cards, sources: originsBehind(evidence, cards), self_said: false };
}

/** Before a save: every linked fact's count is the live one (an origin marked 不用 since then counts no more). */
export const withLiveSources = (content: MapContent, evidence: Evidence): MapContent =>
  withItems(content, "facts", itemsOf(content, "facts").map((item) => (item.cards?.length ? linkSources(item, item.cards, evidence) : item)));

/** An AI line the person changed is theirs together; one left as it was stays the AI's. */
export const editedBy = (by: By): By => (by === "ai" ? "joint" : by);

/** The groups the interests are listed under: everyone named at 開案 as affected, then any group written since. */
export function interestGroups(items: Item[], affected: string[]): Array<{ group: string; items: Item[] }> {
  const groups = [...new Set([...affected, ...items.map((item) => item.group || "")].filter(Boolean))];
  return [...groups.map((group) => ({ group, items: items.filter((item) => item.group === group) })), ...(items.some((item) => !item.group) ? [{ group: "", items: items.filter((item) => !item.group) }] : [])];
}

export const detailsMissing = (claim: Claim, spec: MapSpec): string[] =>
  (spec.claim_kinds.find((entry) => entry.kind === claim.kind)?.details ?? []).filter((detail) => !claim.details?.[detail.key]?.trim()).map((detail) => detail.label);
/** A law claim that lacks its 法域、時效 or 來源 (AI may not fill them from what it remembers). */
export const unconfirmedLaw = (claim: Claim, spec: MapSpec): boolean => claim.kind === "法律" && detailsMissing(claim, spec).length > 0;

/** A claim confirmed from an AI proposal: the line's own words; the person's changes make it theirs together. */
export function confirmClaim(content: MapContent, itemId: string, kind: string, by: By, details?: Record<string, string>): MapContent {
  const item = allItems(content).find((found) => found.id === itemId);
  if (!item || (content.claims ?? []).some((claim) => claim.item === itemId && claim.kind === kind)) return content;
  return { ...content, claims: [...(content.claims ?? []), { id: newId(), text: item.text, kind, by, item: itemId, ...(details ? { details } : {}) }] };
}

/** Another reading the AI gave, taken into the 解釋 layer as the AI's line. */
export function takeAlternative(content: MapContent, alt: { view: string; check?: string }): MapContent {
  return withItems(content, "interpretations", [...itemsOf(content, "interpretations"), { id: newId(), text: alt.check ? `${alt.view}（要確認：${alt.check}）` : alt.view, by: "ai" }]);
}

export type Decision = { suggestion: { doc_id: string; version: number }; key: string; decision: "採用" | "不採用" };
/** Lines of an AI offer the person has not answered yet, by what is kept and what was decided on this page. */
export function pendingKeys(keys: string[], suggestion: { doc_id: string; version: number } | null, reviews: Array<{ suggestion: string; version: number; key: string }>, decided: Decision[]): string[] {
  if (!suggestion) return [];
  const done = new Set([...reviews.filter((review) => review.suggestion === suggestion.doc_id && review.version === suggestion.version).map((review) => review.key),
    ...decided.filter((entry) => entry.suggestion.doc_id === suggestion.doc_id && entry.suggestion.version === suggestion.version).map((entry) => entry.key)]);
  return keys.filter((key) => !done.has(key));
}

const methodLine = (content: MapContent): string => (content.method ? `${content.method}${content.method_version ? `（工具 ${content.method_version} 版）` : ""}` : "");

/** Two versions of the map as rows of two columns, for reading side by side. */
export function compareRows(a: MapContent, b: MapContent, spec: MapSpec): Array<{ label: string; a: string[]; b: string[] }> {
  const lines = (content: MapContent, layer: string) => [content.one_lines?.[layer] ? `一句：${content.one_lines[layer]}` : "", (content.skipped ?? []).includes(layer) ? "（這一層跳過了）" : "",
    ...itemsOf(content, layer).map((item) => (item.group ? `${item.group}：${item.text}` : item.text))].filter(Boolean);
  const claim = (item: Claim) => [`${item.kind}：${item.text}`, ...Object.values(item.details ?? {}).filter(Boolean)].join("；");
  const answers = (content: MapContent) => (content.unwinnable_answers ?? []).map((item) => `${item.q + 1}. ${item.answer}${item.note ? `（${item.note}）` : ""}`);
  return [
    { label: "拆法", a: [methodLine(a)].filter(Boolean), b: [methodLine(b)].filter(Boolean) },
    ...spec.layers.map((layer) => ({ label: layer.name, a: lines(a, layer.key), b: lines(b, layer.key) })),
    { label: "核心矛盾（你寫的）", a: [a.core_conflict ?? ""].filter(Boolean), b: [b.core_conflict ?? ""].filter(Boolean) },
    { label: "主張", a: (a.claims ?? []).map(claim), b: (b.claims ?? []).map(claim) },
    { label: "資訊缺口", a: a.gaps ?? [], b: b.gaps ?? [] },
    { label: "假設", a: (a.assumptions ?? []).map((item) => item.text), b: (b.assumptions ?? []).map((item) => item.text) },
    { label: "解不了的局", a: [...(a.unwinnable ? ["你標成解不了的局"] : []), ...answers(a)], b: [...(b.unwinnable ? ["你標成解不了的局"] : []), ...answers(b)] },
  ];
}
