"use client";

import type { Incident } from "@/lib/ops-inbox/types";
import { buildClipboardPrompt } from "@/lib/ops-inbox/dispatch/buildClipboardPrompt";

interface Props {
  incident: Incident;
  tool: "codex" | "copilot" | "gemini-cli";
}

const TOOL_LABEL: Record<Props["tool"], string> = {
  codex: "Codex CLI",
  copilot: "Copilot CLI",
  "gemini-cli": "Gemini CLI",
};

const TOOL_HINT: Record<Props["tool"], string> = {
  codex: "codex \"<貼上>\"",
  copilot: "gh copilot suggest \"<貼上>\"",
  "gemini-cli": "gemini \"<貼上>\"",
};

export function CopyForTerminalButton({ incident, tool }: Props) {
  const [copied, setCopied] = React.useState(false);

  const onClick = async () => {
    const prompt = buildClipboardPrompt(incident, "claude"); // reuse claude format (RCA-focused)
    const cmd = `# Paste into terminal: ${TOOL_HINT[tool]}\n\n${prompt}`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 13px",
        borderRadius: 6,
        border: "1px solid #e5e7eb",
        background: copied ? "#dcfce7" : "#f8fafc",
        color: copied ? "#15803d" : "#374151",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
        transition: "background 0.15s",
      }}
    >
      {copied ? "✓ Copied!" : `Copy → ${TOOL_LABEL[tool]}`}
    </button>
  );
}

// React import needed for useState in client component
import React from "react";
