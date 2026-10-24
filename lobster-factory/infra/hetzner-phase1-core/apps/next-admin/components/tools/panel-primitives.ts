// ── Shared panel design system (4 primitives) — SINGLE SOURCE OF TRUTH ──
// Used across /tools/studio, /tools/tarot, /tools/video, /tools/theme so every
// in-panel control of the same TYPE looks identical everywhere.
// Neurodiversity-friendly: predictable, low visual noise, one canonical look per type.
//
//   tabStyle(active)      sub-category TABS  — solid-accent fill when active
//   chipStyle(active)     option CHIPS       — light-purple fill when active (distinct from tabs)
//   actionPill(disabled)  primary ACTION     — solid-accent pill (fetch / generate / dice)
//   ghostBtn()            secondary ACTION   — transparent + bordered (clear / cancel / reset)
//
// Palette is driven entirely by global CSS variables (var(--accent), var(--border),
// var(--btn-primary-text), var(--text-muted)) so it adapts to theme automatically.
// Boundary: result-stage buttons (生成 / 存入 / 下載 …) may use the GLOBAL
// btn-primary / btn-secondary CSS classes — a separate, self-consistent primitive.
// Do NOT unify across that boundary; only same-type controls share a helper.
import type { CSSProperties } from "react";

export function tabStyle(active: boolean): CSSProperties {
  return {
    padding: "3px 10px", borderRadius: 12, fontSize: 11, cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent)" : "rgba(127,127,127,0.08)",
    color: active ? "var(--btn-primary-text)" : "var(--text-muted)",
    fontWeight: active ? 600 : 400, transition: "all 0.15s",
  };
}

export function chipStyle(active: boolean): CSSProperties {
  return {
    padding: "3px 10px", borderRadius: 12, fontSize: 11, cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "rgba(99,102,241,0.15)" : "rgba(127,127,127,0.08)",
    color: active ? "var(--accent-text)" : "var(--text-muted)",
    fontWeight: active ? 600 : 400, transition: "all 0.15s",
  };
}

export function actionPill(disabled = false): CSSProperties {
  return {
    fontSize: 11, fontWeight: 600, padding: "4px 14px", borderRadius: 20,
    cursor: disabled ? "default" : "pointer",
    background: "var(--accent)", color: "var(--btn-primary-text)", border: "none",
    opacity: disabled ? 0.5 : 1, flexShrink: 0, transition: "all 0.15s",
  };
}

export function ghostBtn(): CSSProperties {
  return {
    fontSize: 11, padding: "2px 10px", borderRadius: 20, cursor: "pointer",
    background: "transparent", border: "1px solid var(--border)",
    color: "var(--text-muted)", transition: "all 0.15s",
  };
}
