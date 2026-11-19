"use client";

// One single-choice setting as a row of visible buttons (operator rule: no dropdowns). Same look and aria-pressed as the
// publish-mode / YouTube groups on this page; a row wraps when there are many options. A stored value that is not in the
// list (an old option, a hand-edited row) shows as its own pressed button "目前：<值>" -- never silently replaced.
import type { CSSProperties } from "react";

export interface Option { value: string; label: string }

const btn = (on: boolean): CSSProperties => ({
  padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
  border: `1px solid ${on ? "var(--accent)" : "var(--card-border)"}`,
  background: on ? "var(--accent)" : "var(--bg-card)", color: on ? "var(--bg-card)" : "var(--text-primary)",
});

export default function OptionButtons({ label, value, options, onChange }: {
  label: string; value: string; options: readonly Option[]; onChange: (value: string) => void;
}) {
  const unknown = value !== "" && !options.some((o) => o.value === value);
  const shown: Option[] = unknown ? [{ value, label: `目前：${value}` }, ...options] : [...options];
  return (
    <div role="group" aria-label={label}>
      <span style={{ color: "var(--text-muted)", fontSize: 12, display: "block", marginBottom: 3 }}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {shown.map((o) => (
          <button key={o.value === "" ? "__none" : o.value} type="button" style={btn(o.value === value)}
            aria-pressed={o.value === value} onClick={() => { if (o.value !== value) onChange(o.value); }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
