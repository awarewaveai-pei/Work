import type { Incident } from "@/lib/ops-inbox/types";
import { buildIncidentPrompt } from "./buildPrompt";

export function buildClipboardPrompt(incident: Incident, provider: "chatgpt" | "claude" | "gemini"): string {
  const base = buildIncidentPrompt(incident, "chat");
  const providerHint =
    provider === "chatgpt"
      ? "請先輸出 Debug plan，再輸出最小修復步驟。"
      : provider === "claude"
        ? "請先輸出 RCA，再輸出風險與驗證步驟。"
        : "請先輸出關鍵異常 pattern，再輸出排查順序。";
  return `${base}\n\n[Provider hint]\n${providerHint}`;
}
