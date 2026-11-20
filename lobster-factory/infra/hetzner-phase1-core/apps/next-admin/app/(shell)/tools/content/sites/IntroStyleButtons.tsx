"use client";

// Card R2: the intro (片頭) this site's automatic videos get -- picture cards, several may be chosen; the videos take them in
// turn (public/editor-shared/intro-styles.js introStyleFor). Only styles an automatic video can fill from its title and one
// picture are offered. Saved on its own (PATCH { introStyles }), never as part of the defaults form; old sites = none.
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { siteIntroCards, siteIntroStyles, siteIntroTransition } from "@/lib/content/brand-voice";
import { INTRO_STYLES, STILL_STYLE } from "@/public/editor-shared/intro-styles.js";
import { ARTICLE_VIDEO_DEFAULTS } from "@/lib/content/video/defaults";
import type { OpenerDesign } from "@/lib/content/video/opener-designs";
import TransitionButtons from "@/components/tools/TransitionButtons";
import Transitions from "@/public/editor-shared/transitions.js";

const CHOICES = INTRO_STYLES.filter((s) => s.auto);

const card = (on: boolean): CSSProperties => ({
  display: "flex", flexDirection: "column", gap: 4, padding: 4, borderRadius: 6, cursor: "pointer", textAlign: "left", fontSize: 12,
  border: `${on ? 2 : 1}px solid ${on ? "var(--accent)" : "var(--card-border)"}`, background: "var(--bg-card)", color: "var(--text-primary)",
});
const picture: CSSProperties = { width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 4, background: "var(--card-border)" };
// card R3: the automatic video's shape (one format); a design of another shape shows whole over a blurred copy of itself
const VIDEO_RATIO = (([w, h]) => w / h)(ARTICLE_VIDEO_DEFAULTS.formats[0].split("x").map(Number) as [number, number]);
const crops = (w: number, h: number) => Math.abs(w / h / VIDEO_RATIO - 1) > 0.02;

export default function IntroStyleButtons({ site, onSaved }: { site: ManagedSite; onSaved: (updated: ManagedSite) => void }) {
  const current = siteIntroStyles(site.contentDefaults), transition = siteIntroTransition(site.contentDefaults);
  const cards = siteIntroCards(site.contentDefaults), stillOn = current.includes(STILL_STYLE);
  const [designs, setDesigns] = useState<OpenerDesign[] | null>(null);
  const [shapes, setShapes] = useState<Record<string, boolean>>({});   // design id -> its picture would be cut
  useEffect(() => {
    if (!stillOn || designs) return;
    fetch(`/api/content/sites/${site.id}/opener-designs`).then((r) => r.json())
      .then((j: { ok?: boolean; designs?: OpenerDesign[]; error?: string }) => { if (j.ok) setDesigns(j.designs ?? []); else setError(j.error ?? "讀不到我的設計"); })
      .catch(() => setError("讀不到我的設計"));
  }, [stillOn, designs, site.id]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: { introStyles?: string[]; introTransition?: string; introCards?: string[] }) {
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
  const pickCard = (id: string) => void save({ introCards: cards.includes(id) ? cards.filter((x) => x !== id) : [...cards, id] });

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
      {/* card R3: the banner card's designs -- this site's customer's saved designs; each chosen one takes a turn */}
      {stillOn && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            橫幅字卡用哪幾張設計（可複選，每張輪一次）。在 <a href={`/tools/banner?${new URLSearchParams({ ratio: ARTICLE_VIDEO_DEFAULTS.formats[0].replace("x", ":"), template: "opener-center", ...(site.organization_id ? { org: site.organization_id } : {}) })}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>橫幅工具</a> 存到我的設計後回來重新整理。
          </span>
          {designs === null ? <span style={{ color: "var(--text-muted)", fontSize: 12 }}>讀取我的設計…</span>
            : designs.length === 0 ? <span style={{ color: "var(--text-muted)", fontSize: 12 }}>我的設計還沒有圖片，先到橫幅工具做一張。</span>
            : (
              <div role="group" aria-label="橫幅字卡的設計" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {designs.map((d) => {
                  const on = cards.includes(d.id);
                  return (
                    <button key={d.id} type="button" style={card(on)} disabled={saving} aria-pressed={on} onClick={() => pickCard(d.id)}>
                      <img src={d.url} alt="" loading="lazy" style={{ ...picture, objectFit: "contain" }}
                        onLoad={(e) => { const i = e.currentTarget; setShapes((s) => ({ ...s, [d.id]: crops(i.naturalWidth, i.naturalHeight) })); }} />
                      <span>{d.name}</span>
                      {(d.width && d.height ? crops(d.width, d.height) : shapes[d.id]) && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>比例不同，會加模糊底</span>}
                    </button>
                  );
                })}
              </div>
            )}
          {designs && cards.filter((id) => !designs.some((d) => d.id === id)).map((id) => (
            <button key={id} type="button" className="btn btn-ghost" style={{ fontSize: 12, alignSelf: "flex-start" }} disabled={saving} onClick={() => pickCard(id)}>
              已刪除的設計（這一格會跳過）· 移除
            </button>
          ))}
          {cards.length === 0 && <span style={{ color: "var(--text-muted)", fontSize: 12 }}>還沒選設計：橫幅字卡這一格不會輪到。</span>}
        </div>
      )}
      {/* card R2: the transitions module's list */}
      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>片頭接正片的轉場（0.5 秒）</span>
      <TransitionButtons label="片頭轉場" value={transition} disabled={saving} onPick={(id) => void save({ introTransition: id })}
        look={(on) => ({ ...card(on), flexDirection: "row" })} />
      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
        {current.length === 0 ? "自動做的影片不加片頭。" : current.length === 1
          ? `每支自動影片開頭加「${names[0]}」，${transition === "無" ? "直接切" : `${Transitions.label(transition)} 0.5 秒`}接正片。`
          : `自動影片依序輪流用：${names.join(" → ")}，${transition === "無" ? "直接切" : `${Transitions.label(transition)} 0.5 秒`}接正片。`}
        標題用影片標題，背景用影片第一個鏡頭的畫面（橫幅字卡用選好的設計，不另加標題）；片頭做不出來時照樣出沒有片頭的影片。
      </div>
      {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
    </div>
  );
}
