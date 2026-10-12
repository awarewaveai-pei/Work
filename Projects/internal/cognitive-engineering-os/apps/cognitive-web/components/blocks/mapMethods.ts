// Which 拆法 MAP lists first (walk B4: a personal contract case opened on 斷點迴歸、工具變數法). The server sends the
// tools sorted by id, each with its family (ai_actions/map.py map_tools); this orders them by the case's purpose
// (開案資料 purpose, kinds/assembler.py PURPOSES). Display order only: every tool stays in the list and the search.
// Families are the catalog's (methods/registry/method-family-display.yaml); a family not named here keeps its place
// among the rest. suggestTools picks up to three for the sentences the person wrote, with no AI.
import type { Tool } from "../../lib/map";
import { pickTools } from "../StuckBox";

/** The families that fit each purpose, best first. */
export const PURPOSE_FAMILIES: Record<string, string[]> = {
  自我理解: ["systems", "root_cause", "framing", "representation", "insight"],
  複雜決策: ["framing", "stakeholders", "root_cause", "systems", "decomposition", "foresight", "strategy"],
  訊息判斷: ["framing", "decomposition", "stakeholders", "representation"],
  創意發散: ["framing", "strategy", "foresight", "representation", "decomposition"],
  學習反思: ["root_cause", "systems", "framing", "representation"],
  團隊審議: ["stakeholders", "framing", "decomposition", "systems", "strategy"],
  公共議題判斷: ["stakeholders", "stakeholder", "systems", "foresight", "framing"],
};
/** Research methods: they need data and statistics (反事實推理、差異中的差異法、斷點迴歸、質性編碼…). Always last. */
export const RESEARCH_FAMILIES = ["causal", "research"];

export type Ranked = { fit: Tool[]; rest: Tool[]; research: Tool[] };

/** The tools in three runs: fit this purpose, the rest, research methods; each run keeps the server's order. */
export function rankTools(tools: Tool[], purpose: string | undefined): Ranked {
  const fits = PURPOSE_FAMILIES[purpose ?? ""] ?? [];
  const research = tools.filter((tool) => RESEARCH_FAMILIES.includes(tool.family));
  const fit = tools.filter((tool) => fits.includes(tool.family)).sort((a, b) => fits.indexOf(a.family) - fits.indexOf(b.family));
  const rest = tools.filter((tool) => !fits.includes(tool.family) && !RESEARCH_FAMILIES.includes(tool.family));
  return { fit, rest, research };
}

export type ToolPick = { tool: Tool; hits: string[] };

/** MAP.method as code (no AI): up to ``limit`` tools whose name or blurb holds the words of what the person wrote -- the free matching 先說你卡在哪 uses
 *  (StuckBox pickTools), the one implementation -- the most matched words first and, among equals, the case's purpose order (rankTools). */
export function suggestTools(tools: Tool[], purpose: string | undefined, text: string, limit = 3): ToolPick[] {
  const ranked = rankTools(tools, purpose);
  const order = [...ranked.fit, ...ranked.rest, ...ranked.research];
  const position = new Map(order.map((tool, index) => [tool.method_id, index]));
  const byId = new Map(order.map((tool) => [tool.method_id, tool]));
  const catalog = { prompts: [], tools: order.map((tool) => ({ id: tool.method_id, name_zh: tool.name, name_en: tool.name_en, blurb_zh: tool.blurb_zh })) };
  return pickTools(catalog, text, order.length)
    .sort((a, b) => b.hits.length - a.hits.length || position.get(a.id)! - position.get(b.id)!)
    .slice(0, limit)
    .map((pick) => ({ tool: byId.get(pick.id)!, hits: pick.hits }));
}
