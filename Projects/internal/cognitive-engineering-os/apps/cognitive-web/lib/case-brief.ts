// A case written as one description a tool run can start from (walk 2026-10-12 W21): the question from 開案, the SENSE cards
// and the MAP layers, in the person's own words. It goes into the run page's 「手邊有一段描述？」 box (LazyFill), so the fields are
// matched or drafted from the case itself, never from a demo. Plain text only: the AI draft reads it as the brief (<= 8000
// characters, ai_gateway/draft.py MAX_BRIEF_CHARS).
import type { Doc } from "./blocks";
import type { MapContent, SenseCard } from "./map";

const LAYER_NAMES: Array<[string, string]> = [["facts", "事實"], ["interpretations", "解釋"], ["interests", "利益"], ["structure", "結構"], ["core", "核心矛盾"], ["intervention", "介入"]];
const MAX_CHARS = 7000;

export function caseBrief(intake: { question?: string } | undefined, cards: Array<Doc<SenseCard>>, map: MapContent | undefined): string {
  const question = intake?.question?.trim();
  const written = cards.filter((card) => card.content.text.trim()).map((card) => `- （${card.content.category}）${card.content.text.trim()}`);
  const layers = LAYER_NAMES.flatMap(([key, name]) => {
    const lines = (map?.layers?.[key] ?? []).map((item) => item.text.trim()).filter(Boolean);
    return lines.length ? [`${name}：${lines.join("；")}`] : [];
  });
  const parts = [
    question ? `我想釐清：${question}` : "",
    written.length ? `我寫下的卡片：\n${written.join("\n")}` : "",
    layers.length ? `我拆解的六層：\n${layers.join("\n")}` : "",
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, MAX_CHARS);
}
