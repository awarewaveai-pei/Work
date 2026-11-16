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

// ── Video workbench controls (video-unify-plan-20261116 §1.8, §4 U2) ──
// A next-admin page inside the workbench shell must look like the workbench's own pages: these return the computed
// style of VW/styles/projects.css `.btn` / `input` / `.panel` / `.chip`, from theme tokens only.
// app/video/(wb)/__tests__/style-contract.test.ts compares them with that CSS file and bans hex, font families and
// dropdowns in every component the workbench pages import -- change both sides together.
// `font: inherit` (as projects.css does) is the only font rule: controls use the page font, never their own.

const CONTROL_RADIUS = "calc(var(--radius) * 0.83333)";

export type ButtonTone = "primary" | "secondary" | "danger";

/** `.btn` / `.btn.primary` / `.btn.small`; disabled = `button:disabled` + `.btn:disabled`. */
export function buttonStyle({ tone = "secondary", small = false, disabled = false }: { tone?: ButtonTone; small?: boolean; disabled?: boolean } = {}): CSSProperties {
  return {
    font: "inherit",
    fontSize: small ? "var(--font-size-sm)" : "var(--font-size-base)",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, whiteSpace: "nowrap",
    padding: small ? "7px 11px" : "10px 14px",
    borderRadius: CONTROL_RADIUS,
    border: `1px solid ${tone === "primary" ? "transparent" : "var(--border-subtle)"}`,
    background: tone === "primary" ? "var(--btn-primary-bg)" : "var(--btn-secondary-bg)",
    color: tone === "primary" ? "var(--btn-primary-text)" : tone === "danger" ? "var(--red)" : "var(--btn-secondary-text)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    filter: disabled ? "grayscale(0.3)" : "none",
  };
}

/** `input` / `textarea`; focused = `:focus-visible` (callers that track focus pass it; others keep the browser ring). */
export function inputStyle(focused = false): CSSProperties {
  return {
    font: "inherit",
    width: "100%", boxSizing: "border-box",
    padding: "12px 13px",
    borderRadius: CONTROL_RADIUS,
    border: "1px solid var(--border-subtle)",
    background: "var(--bg-subtle)",
    color: "var(--text-primary)",
    outline: focused ? "2px solid var(--accent)" : "revert",
    outlineOffset: 2,
  };
}

/** `.panel`: the card every section sits in. Like `.panel` it sets no padding; each caller gives its own. */
export function cardStyle(): CSSProperties {
  return {
    background: "var(--card-bg)",
    border: "1px solid var(--card-border)",
    borderRadius: "calc(var(--radius) * 1.25)",
  };
}

/** `.chip` / `.chip.on`: one choice in a row of visible choices (the workbench never uses a dropdown). */
export function optionStyle(active: boolean): CSSProperties {
  return {
    font: "inherit",
    fontSize: "var(--font-size-sm)",
    padding: "7px 11px",
    borderRadius: "calc(var(--radius) * 1.8333)",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--ai-bg)" : "transparent",
    color: active ? "var(--ai-text)" : "var(--text-primary)",
    cursor: "pointer",
  };
}
