"use client";

import type { Incident } from "@/lib/ops-inbox/types";
import { buildRemoteUiUrl } from "@/lib/ops-inbox/dispatch/buildRemoteUiUrl";
import { buildIncidentPrompt } from "@/lib/ops-inbox/dispatch/buildPrompt";

export function OpenRemoteUIButton({ incident, target, primary }: { incident: Incident; target: "n8n" | "supabase"; primary?: boolean }) {
  const onClick = async () => {
    const prompt = buildIncidentPrompt(incident, "remote-ui");
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {}
    window.open(buildRemoteUiUrl(incident, target), "_blank");
  };
  const label = target === "n8n" ? "Open n8n UI →" : "Open Studio →";
  const style = primary
    ? { background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)", border: "1px solid var(--btn-primary-bg)" }
    : { background: "var(--btn-secondary-bg)", color: "var(--btn-secondary-text)", border: "1px solid var(--btn-secondary-border)" };
  return (
    <button onClick={onClick} style={{ ...style, padding: "8px 14px", borderRadius: 6, cursor: "pointer" }}>
      {label}
    </button>
  );
}
