"use client";
// Shared pieces of the step cards (moved from BannerStudio.tsx, R2-B1).
import { useState, type Dispatch, type SetStateAction } from "react";
import type { ShadowSpec } from "../banner-layers";
import type { State } from "../banner-state";

/** What every step reads and writes: the design and its setters. */
export interface StepCtx {
  s: State;
  setS: Dispatch<SetStateAction<State>>;
  set: <K extends keyof State>(key: K, val: State[K]) => void;
}

/** One shadow setting: on/off, colour, opacity, blur, X / Y offset -- all visible controls (no dropdowns). */
export function ShadowControls({ label, unit, value, onChange, testId }: {
  label: string; unit: string; value: ShadowSpec; onChange: (v: ShadowSpec) => void; testId: string;
}) {
  const slider = (name: string, key: "opacity" | "blur" | "x" | "y", min: number, max: number, step: number) => (
    <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <span style={{ minWidth: 48 }}>{name}</span>
      <input type="range" min={min} max={max} step={step} value={value[key]} data-testid={`${testId}-${key}`}
        onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) })} style={{ flex: 1, minWidth: 80 }} />
      <span style={{ opacity: 0.7, minWidth: 36, textAlign: "right" }}>{Math.round(value[key] * 100)}%</span>
    </label>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <input type="checkbox" checked={value.on} data-testid={`${testId}-on`} onChange={(e) => onChange({ ...value, on: e.target.checked })} />
        {label}
        {value.on && (
          <input type="color" value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value })} aria-label={`${label}顏色`}
            style={{ width: 32, height: 22, border: "none", background: "none", cursor: "pointer" }} />
        )}
      </label>
      {value.on && (
        <>
          {slider("不透明度", "opacity", 0, 1, 0.02)}
          {slider("模糊", "blur", 0, 1, 0.02)}
          {slider("X 位移", "x", -0.5, 0.5, 0.01)}
          {slider("Y 位移", "y", -0.5, 0.5, 0.01)}
          <span className="form-hint">模糊與位移以{unit}為 100%，換尺寸時比例不變。</span>
        </>
      )}
    </div>
  );
}

export function AccordionSection({
  title, summary, children, defaultOpen = false, icon,
}: {
  title: string; summary?: string; children: React.ReactNode; defaultOpen?: boolean; icon?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        style={{
          width: "100%", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "9px 14px", background: "var(--chip-surface, #f8f9fa)", border: "none", borderRadius: 6,
          cursor: "pointer", color: "var(--text-primary)", fontWeight: 600,
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {icon && <span>{icon}</span>}
          <span>{title}</span>
          {summary && !open && (
            <span style={{ fontSize: 11, opacity: 0.45, marginLeft: 4, fontWeight: 400 }}>{summary}</span>
          )}
        </span>
        <span style={{ opacity: 0.4, fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 4, padding: 10, background: "var(--chip-surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function PresetChips({ chips, onSelect, selected }: { chips: string[]; onSelect: (v: string) => void; selected?: string }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
      {chips.map((c, i) => {
        const active = selected === c;
        return (
          <button
            key={`${c}-${i}`}
            type="button"
            onClick={() => onSelect(c)}
            style={{
              fontSize: 11, padding: "2px 9px", borderRadius: 20,
              background: active ? "var(--accent)" : "var(--chip-bg)",
              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
              cursor: "pointer", color: active ? "var(--btn-primary-text)" : "var(--text-muted)",
              fontWeight: active ? 600 : 400, lineHeight: 1.6,
              transition: "all 0.15s",
            }}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

/** C13: one numbered section of the controls; the header shows what is set now, so a closed section still tells its state. */
export function StepCard({
  title, step, icon, hint, summary, children, defaultOpen = false,
}: {
  title: string; step?: string; icon?: string; hint?: string; summary?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "none", border: "none",
          padding: 16, cursor: "pointer", display: "flex", gap: 8,
          alignItems: "center", justifyContent: "space-between",
          color: "var(--text-primary)", textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {step && <span style={{ fontSize: 12, fontWeight: 700, minWidth: 24, height: 24, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--chip-bg)", color: "var(--text-muted)" }}>{step}</span>}
          {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
          <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
          {hint && <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>{hint}</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {summary && <span data-testid={`banner-step-summary-${step ?? title}`} style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>}
          <span style={{ color: "var(--text-muted)", fontSize: 11, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && (
        <div style={{ padding: "8px 16px 16px", borderTop: "1px solid var(--border)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

/** A part inside a section (e.g. 背景 / 產品圖 in 畫面). */
export function SubHead({ children, first = false }: { children: React.ReactNode; first?: boolean }) {
  return <div style={{ fontSize: 13, fontWeight: 700, margin: first ? "8px 0 8px" : "24px 0 8px", paddingTop: first ? 0 : 16, borderTop: first ? undefined : "1px solid var(--border)" }}>{children}</div>;
}
