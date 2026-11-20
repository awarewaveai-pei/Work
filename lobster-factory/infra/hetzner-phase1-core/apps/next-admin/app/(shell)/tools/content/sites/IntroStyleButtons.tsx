"use client";

// Card R2: the intro (片頭) this site's automatic videos get -- picture cards, several may be chosen; the videos take them in
// turn (public/editor-shared/intro-styles.js introStyleFor). Only styles an automatic video can fill from its title and one
// picture are offered. Saved on its own (PATCH { introStyles }), never as part of the defaults form; old sites = none.
import { useState } from "react";
import type { CSSProperties } from "react";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { siteIntroStyles, siteIntroTransition } from "@/lib/content/brand-voice";
import { INTRO_STYLES } from "@/public/editor-shared/intro-styles.js";
import Transitions from "@/public/editor-shared/transitions.js";

const CHOICES = INTRO_STYLES.filter((s) => s.auto);

const card = (on: boolean): CSSProperties => ({
  display: "flex", flexDirection: "column", gap: 4, padding: 4, borderRadius: 6, cursor: "pointer", textAlign: "left", fontSize: 12,
  border: `${on ? 2 : 1}px solid ${on ? "var(--accent)" : "var(--card-border)"}`, background: "var(--bg-card)", color: "var(--text-primary)",
});
const picture: CSSProperties = { width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 4, background: "var(--card-border)" };

export default function IntroStyleButtons({ site, onSaved }: { site: ManagedSite; onSaved: (updated: ManagedSite) => void }) {
  const current = siteIntroStyles(site.contentDefaults), transition = siteIntroTransition(site.contentDefaults);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: { introStyles?: string[]; introTransition?: string }) {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/content/sites/${site.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean; site?: ManagedSite; error?: string } | null;
      if (json?.ok && json.site) onSaved(json.site);
      else setError(json?.error ?? `儲存失敗（${res.status}）`);
    } catch {
      setError("網路錯誤，請重試");
    } finally { setSaving(false); }
  }

  const toggle = (id: string) => void save({ introStyles: id === "none" ? [] : current.includes(id) ? current.filter((x) => x !== id) : [...current, id] });
  const names = current.map((id) => CHOICES.find((c) => c.id === id)?.label ?? id);

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>自動影片的片頭樣式（可複選）</span>
      <div role="group" aria-label="自動影片的片頭樣式" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
        {CHOICES.map((c) => {
          const on = c.id === "none" ? current.length === 0 : current.includes(c.id);
          return (
            <button key={c.id} type="button" style={card(on)} disabled={saving} aria-pressed={on} onClick={() => toggle(c.id)}>
              {c.preview ? <img src={`/editor-shared/${c.preview}`} alt="" loading="lazy" style={picture} /> : <span style={{ ...picture, display: "block" }} />}
              <span>{c.label}</span>
            </button>
          );
        })}
      </div>
      {/* card R2: the transitions module's list */}
      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>片頭接正片的轉場（0.5 秒）</span>
      <div role="group" aria-label="片頭轉場" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {Transitions.LIST.map((t: { id: string; note: string }) => (
          <button key={t.id} type="button" style={{ ...card(transition === t.id), flexDirection: "row" }} disabled={saving}
            aria-pressed={transition === t.id} onClick={() => { if (t.id !== transition) void save({ introTransition: t.id }); }}>
            {t.id}{t.note ? ` ${t.note}` : ""}
          </button>
        ))}
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
        {current.length === 0 ? "自動做的影片不加片頭。" : current.length === 1
          ? `每支自動影片開頭加「${names[0]}」，${transition === "無" ? "直接切" : `${transition} 0.5 秒`}接正片。`
          : `自動影片依序輪流用：${names.join(" → ")}，${transition === "無" ? "直接切" : `${transition} 0.5 秒`}接正片。`}
        標題用影片標題，背景用影片第一個鏡頭的畫面；片頭做不出來時照樣出沒有片頭的影片。
      </div>
      {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
    </div>
  );
}
