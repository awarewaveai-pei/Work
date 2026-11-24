"use client";
// K25: 文章封面 -- the one cover layout's colours and font for this site, as swatches and buttons (no dropdowns), with the
// cover drawn live beside them. A site that never set it starts from the layout's defaults (siteCover).
import type { CoverSettings } from "@/lib/content/cover/settings";
import OptionButtons from "./OptionButtons";
import CoverPreview from "../CoverPreview";

const FONTS = [{ value: "sans", label: "黑體（Noto Sans）" }, { value: "serif", label: "明體（Noto Serif）" }];
const BASE_SWATCHES = ["#1f2430", "#ffffff", "#c9ced8", "#000000", "#2f4f4f", "#7a2e2e", "#1e3a5f", "#5b4636", "#f4efe6"];

function ColorRow({ label, value, swatches, onChange }: { label: string; value: string; swatches: string[]; onChange(v: string): void }) {
  return (
    <div role="group" aria-label={label}>
      <span style={{ color: "var(--text-muted)", fontSize: 12, display: "block", marginBottom: 3 }}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {[...new Set([value, ...swatches])].map((c) => (
          <button key={c} type="button" aria-label={c} aria-pressed={c === value} title={c} onClick={() => onChange(c)}
            style={{ width: 24, height: 24, borderRadius: 5, cursor: "pointer", background: c,
              border: c === value ? "2px solid var(--accent)" : "1px solid var(--card-border)" }} />
        ))}
        <input type="color" aria-label={`${label}（自訂）`} value={value} onChange={(e) => onChange(e.target.value.toLowerCase())}
          style={{ width: 32, height: 24, padding: 0, border: "1px solid var(--card-border)", borderRadius: 5, background: "none", cursor: "pointer" }} />
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{value}</span>
      </div>
    </div>
  );
}

export default function CoverSettingsFields({ value, onChange }: { value: CoverSettings; onChange(next: CoverSettings): void }) {
  const swatches = BASE_SWATCHES;
  const set = (patch: Partial<CoverSettings>) => onChange({ ...value, ...patch });
  return (
    <div>
      <span style={{ color: "var(--text-muted)", fontSize: 12, display: "block", marginBottom: 6 }}>
        文章封面（所有文章同一個版型：上方圖片、下方色塊放短標題與副標）
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: "1 1 280px" }}>
          <ColorRow label="色塊顏色" value={value.bandColor} swatches={swatches} onChange={(v) => set({ bandColor: v })} />
          <ColorRow label="標題字色" value={value.titleColor} swatches={swatches} onChange={(v) => set({ titleColor: v })} />
          <ColorRow label="副標字色" value={value.subtitleColor} swatches={swatches} onChange={(v) => set({ subtitleColor: v })} />
          <OptionButtons label="字型" value={value.font} options={FONTS} onChange={(v) => set({ font: v === "serif" ? "serif" : "sans" })} />
        </div>
        <CoverPreview title="正念呼吸入門：五分鐘找回平靜" subtitle="每天一點練習，焦慮少一點" settings={value} width={300} />
      </div>
    </div>
  );
}
