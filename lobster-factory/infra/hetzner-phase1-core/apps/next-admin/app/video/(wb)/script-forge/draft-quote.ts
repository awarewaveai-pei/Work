import type { AutoDraftRequest } from "../../../(shell)/tools/video/ScriptForge";
import type { Workbench } from "../workbench";

// N12: the one way the script page and the 一鍵到草稿 dialog ask for the whole trip's price. Both show only the server's
// typicalTwd (通常約) and maxTwd (最多); nothing is summed here (plan §13 C4).
export type DraftQuoteRequest = Pick<AutoDraftRequest, "platform" | "sceneCount" | "plan">;
export interface DraftChoices { ratios: string[]; fill: string; tts?: { provider: string; voice: string } | null }
export interface DraftQuote {
  typicalTwd: number; maxTwd: number; runQuote?: string | null; perRatioTwd: number; problems?: string[];
  fill: { twd: number; perPictureTwd: number };
  voices: { provider: string; voice: string; label: string; available?: boolean }[]; sites: { id: string; name: string }[];
}

/** The dialog's starting choices: the platform's ratio; missing pictures by AI only when the page asked for AI scenes. */
export function defaultDraftChoices(request: DraftQuoteRequest): DraftChoices {
  return { ratios: [request.platform === "youtube" ? "16:9" : "9:16"], fill: request.plan.customScenes > 0 ? "ai" : "stock-video" };
}

export async function requestDraftQuote(workbench: Workbench, request: DraftQuoteRequest, { ratios, fill, tts }: DraftChoices): Promise<DraftQuote> {
  // Before the script exists every scene is priced at the narration limit and without a picture: the trip's maximum.
  const q = await workbench.request("/quick-render/quote", {
    scenes: Array.from({ length: request.sceneCount }, () => ({ narration: "文".repeat(2000), url: "" })),
    ratios, fill, until: "drafts", ...(tts ? { tts } : {}), scriptPlan: request.plan,
  }) as DraftQuote;
  if (!Number.isFinite(q?.typicalTwd) || !Number.isFinite(q?.maxTwd)) throw Error("主系統尚未提供有效的整趟報價，已停下");
  return q;
}
