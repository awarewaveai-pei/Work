"use client";

// One prompt the operator can lift straight into the panel's description box. The text is the only prop,
// so a prompt printed on the page and the prompt copied to the clipboard can never drift apart.
import React from "react";

export function CopyPrompt({ text, note }: { text: string; note?: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the text is on screen and selectable anyway */
    }
  };

  return (
    <div style={{ border: "1px solid var(--card-border)", borderRadius: 8, background: "var(--bg-subtle)", padding: "10px 12px", margin: "0 0 10px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <code style={{ flex: "1 1 240px", minWidth: 0, fontSize: 14, lineHeight: 1.7, color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</code>
        <button
          type="button"
          onClick={copy}
          style={{ flex: "0 0 auto", padding: "5px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 6,
            border: "1px solid var(--card-border)", background: "var(--bg-card)", color: copied ? "var(--accent-text)" : "var(--text-secondary)" }}
        >
          {copied ? "已複製" : "複製"}
        </button>
      </div>
      {note ? <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>{note}</div> : null}
    </div>
  );
}
