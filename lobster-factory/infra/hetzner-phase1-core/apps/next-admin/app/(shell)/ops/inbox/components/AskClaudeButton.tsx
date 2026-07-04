"use client";

import type { Incident } from "@/lib/ops-inbox/types";
import { buildClipboardPrompt } from "@/lib/ops-inbox/dispatch/buildClipboardPrompt";

export function AskClaudeButton({ incident }: { incident: Incident }) {
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(buildClipboardPrompt(incident, "claude"));
    } catch {}
    window.open("https://claude.ai", "_blank");
  };
  return (
    <button onClick={onClick} style={{ padding: "8px 14px", borderRadius: 6, cursor: "pointer" }}>
      Ask Claude →
    </button>
  );
}
