"use client";
// One value as a button; clicking it opens every choice as a grid -- any value in two clicks, no <select> and no
// stepper (operator 2026-10-24: 「要讓我按24次」). Used by /ops/schedules and the topic queue.
import { useEffect, useRef, useState } from "react";
import { chipStyle } from "@/components/tools/panel-primitives";

/** A value shows as a button; clicking it opens every choice as a grid (24 hours, 28 days) -- any value in two clicks.
 *  Fixed-positioned so the rows' horizontal-scroll box does not clip it; closes on pick, Escape, outside click or scroll. */
export function GridPicker({ value, options, format, label, columns = 6, disabled, onChange }: {
  value: number; options: number[]; format: (v: number) => string; label: string; columns?: number; disabled: boolean; onChange: (v: number) => void;
}) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const onDown = (e: MouseEvent) => { if (!panelRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); window.removeEventListener("scroll", close, true); };
  }, [at]);
  const width = columns * 48 + 8 * 2;
  const open = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const height = Math.ceil(options.length / columns) * 32 + 16;
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + height + 8 > window.innerHeight ? r.top - height - 4 : r.bottom + 4 });
  };
  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled} aria-label={label} aria-expanded={Boolean(at)}
        style={{ ...chipStyle(Boolean(at)), padding: "3px 12px", fontSize: "var(--font-size-sm)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
        onClick={() => (at ? setAt(null) : open())}>{format(value)}</button>
      {at && (
        <div ref={panelRef} role="group" aria-label={label} style={{
          position: "fixed", left: at.left, top: at.top, zIndex: 50, width, padding: 8, display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 4,
          // Themes may give --card-bg alpha (cards show the page through); a floating panel must not, so the card
          // tint is laid over the page colour, which is always opaque.
          background: "linear-gradient(var(--card-bg), var(--card-bg)), var(--body-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
        }}>
          {options.map((v) => (
            <button key={v} type="button" style={{ ...chipStyle(v === value), padding: "4px 0", textAlign: "center", fontVariantNumeric: "tabular-nums" }} aria-pressed={v === value}
              onClick={() => { setAt(null); if (v !== value) onChange(v); }}>{format(v)}</button>
          ))}
        </div>
      )}
    </>
  );
}
