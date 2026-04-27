"use client";

import type { Incident } from "@/lib/ops-inbox/types";
import { buildClipboardPrompt } from "@/lib/ops-inbox/dispatch/buildClipboardPrompt";

export function AskChatGPTButton({ incident }: { incident: Incident }) {
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(buildClipboardPrompt(incident, "chatgpt"));
    } catch {}
    window.open("https://chatgpt.com", "_blank");
  };
  return (
    <button onClick={onClick} style={{ padding: "8px 14px", borderRadius: 6, cursor: "pointer" }}>
      Ask ChatGPT →
    </button>
  );
}
