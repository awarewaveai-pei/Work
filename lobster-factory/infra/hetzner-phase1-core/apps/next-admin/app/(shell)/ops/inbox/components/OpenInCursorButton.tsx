"use client";

import type { Incident } from "@/lib/ops-inbox/types";
import { buildCursorDeeplink } from "@/lib/ops-inbox/dispatch/buildCursorDeeplink";

export function OpenInCursorButton({ incident, primary }: { incident: Incident; primary?: boolean }) {
  const onClick = () => {
    window.location.href = buildCursorDeeplink(incident);
  };
  const style = primary
    ? { background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)", border: "1px solid var(--btn-primary-bg)" }
    : { background: "var(--btn-secondary-bg)", color: "var(--btn-secondary-text)", border: "1px solid var(--btn-secondary-border)" };
  return (
    <button onClick={onClick} style={{ ...style, padding: "8px 14px", borderRadius: 6, cursor: "pointer" }}>
      Open in Cursor →
    </button>
  );
}
