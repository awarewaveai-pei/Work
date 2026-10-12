// Which 拆法 MAP lists first (walk B4: a personal contract case opened on 斷點迴歸、工具變數法). The server sends the
// tools sorted by id, each with its family (ai_actions/map.py map_tools); this orders them by the case's purpose
// (開案資料 purpose, kinds/assembler.py PURPOSES). Display order only: every tool stays in the list and the search.
// Families are the catalog's (methods/registry/method-family-display.yaml); a family not named here keeps its place
// among the rest.
import type { Tool } from "../../lib/map";

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
