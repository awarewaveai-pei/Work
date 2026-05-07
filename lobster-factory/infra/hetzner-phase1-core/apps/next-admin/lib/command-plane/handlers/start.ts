// /start and /help — welcome message listing available commands.
// Pure text response, no DB / API calls.

import type { CommandHandler } from "../commandRouter";

export const startHandler: CommandHandler = async () => {
  const text = [
    "*AwareWave Ops Bot*",
    "",
    "可用指令：",
    "• `/status` — 系統狀態 + 最近 5 個指令 + 開放 incidents",
    "• `/health` — 開放 incidents + 24h 錯誤計數",
    "• `/daily_review` — 24 小時 AI 摘要",
    "• `/weekly_review` — 7 天 AI 摘要",
    "• `/list_failed_runs` — 最近失敗 runs",
    "",
    "輸入 `/` 應該會顯示指令選單；不會的話直接打字傳。",
  ].join("\n");

  return { text };
};
