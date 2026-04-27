import type { Incident } from "@/lib/ops-inbox/types";

export function recommendOrder(incident: Incident): Array<"chatgpt" | "claude" | "gemini"> {
  if (incident.signal_type === "business") return ["claude", "chatgpt", "gemini"];
  if (incident.signal_type === "resource" || incident.signal_type === "uptime") return ["claude", "gemini", "chatgpt"];
  return ["chatgpt", "claude", "gemini"];
}
