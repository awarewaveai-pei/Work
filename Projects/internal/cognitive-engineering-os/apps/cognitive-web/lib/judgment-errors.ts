// The refusals DECIDE, ACT and LEARN can answer with, as one sentence each; anything else goes through humanError().
// The pages disable the buttons these come from, so they show up only when two tabs disagree.
import { ApiError } from "./api";
import { humanError } from "./errors";

const OURS: Record<string, string> = {
  AI_SEALED: "你按了「現在我要自己下結論」，這一版 AI 不再給新答案。存下一版之後，才能再請它檢查。",
  DECIDE_NO_JUDGMENT: "先存判斷卡，才能請 AI 檢查。",
  ACT_NO_NEXT_STEP: "判斷卡上還沒有「下一步」，沒有東西可以拆。",
  ACT_NO_TASK: "先寫一張任務卡，才能請 AI 看哪裡不能反悔。",
  ACT_NO_NUMBERS: "還沒有任何一筆紀錄記了數字。",
  LEARN_NOTHING_TO_COMPARE: "這個案子還沒有判斷或任務，沒有東西可以對照。",
  LEARN_NO_DAILY_CARD: "先寫今天的校準卡，才能請 AI 整理。",
};

export function judgmentError(reason: unknown): string {
  const detail = reason instanceof ApiError && typeof reason.detail === "string" ? /^[A-Z][A-Z0-9_]*/.exec(reason.detail)?.[0] : undefined;
  return (detail && OURS[detail]) || humanError(reason);
}
