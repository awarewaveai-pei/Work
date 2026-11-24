"use client";

// The article images' style as visible buttons (K10; operator rule: no dropdowns): the catalog's groups, then the styles
// of the open group. value = a STYLE_CATALOG key, "" = not set (the photo look, article-image.ts ARTICLE_DEFAULT_STYLE).
// Used by the site settings (the site's default) and the article page (that article only).
import { useEffect, useState, type CSSProperties } from "react";
import { STYLE_CATALOG } from "@/app/(shell)/tools/tarot/tarotStyles";

const GROUPS = [...new Set(STYLE_CATALOG.map((s) => s.group))];

const btn = (on: boolean): CSSProperties => ({
  padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
  border: `1px solid ${on ? "var(--accent)" : "var(--card-border)"}`,
  background: on ? "var(--accent)" : "var(--bg-card)", color: on ? "var(--bg-card)" : "var(--text-primary)",
});

export default function ImageStyleButtons({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (key: string) => void; disabled?: boolean;
}) {
  const current = STYLE_CATALOG.find((s) => s.zh === value);
  const [group, setGroup] = useState<string>(current?.group ?? GROUPS[0]);
  // a value set after mount (the site default arriving) opens its own group, so the pressed button is visible
  useEffect(() => { if (current) setGroup(current.group); }, [current]);
  const pick = (key: string) => { if (key !== value) onChange(key); };
  return (
    <div role="group" aria-label={label}>
      <span style={{ color: "var(--text-muted)", fontSize: 12, display: "block", marginBottom: 3 }}>
        {label}：{current ? current.zh.split("｜")[0] : "照片感（預設）"}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        <button type="button" style={btn(!current)} aria-pressed={!current} disabled={disabled} onClick={() => pick("")}>照片感（預設）</button>
        {GROUPS.map((g) => (
          <button key={g} type="button" style={btn(false)} aria-pressed={g === group} disabled={disabled}
            onClick={() => setGroup(g)}>
            {g === group ? `▾ ${g}` : g}
          </button>
        ))}
      </div>
      <div role="group" aria-label={`${label}：${group}`} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {STYLE_CATALOG.filter((s) => s.group === group).map((s) => (
          <button key={s.zh} type="button" title={s.zh} style={btn(s.zh === value)} aria-pressed={s.zh === value} disabled={disabled}
            onClick={() => pick(s.zh)}>
            {s.zh.split("｜")[0]}
          </button>
        ))}
      </div>
    </div>
  );
}
