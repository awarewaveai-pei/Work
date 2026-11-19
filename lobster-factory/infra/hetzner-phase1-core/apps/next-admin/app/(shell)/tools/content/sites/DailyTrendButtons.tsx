"use client";

// A site's daily trend topics switch (N8): off by default. Saved on its own (PATCH { dailyTrendTopics }), never as part of
// the defaults form, staff only (the route refuses others). Turning it on asks once more first (a daily AI call). Same look as
// TopicModeButtons beside it.
import { useState } from "react";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { DAILY_MIN_SCORE, DAILY_TOPICS, dailyTrendTopicsOn } from "@/lib/content/brand-voice";
import { dailyCostTwd } from "@/lib/content/topics/cost";
import { trendGeosFor } from "@/lib/content/geos";

const DETAIL = `打開後每天從近兩天熱搜挑最多 ${DAILY_TOPICS} 個題目，AI 打相關分數 ${DAILY_MIN_SCORE} 分以上才放進清單；AI 挑題的網站直接核准，人挑的留待核准。每天約 NT$${dailyCostTwd()}。`;

export default function DailyTrendButtons({ site, onSaved, readOnly = false }: { site: ManagedSite; onSaved: (updated: ManagedSite) => void; readOnly?: boolean }) {
  const on = dailyTrendTopicsOn(site.contentDefaults);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: boolean) {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/content/sites/${site.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dailyTrendTopics: next }),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean; site?: ManagedSite; error?: string } | null;
      if (json?.ok && json.site) { onSaved(json.site); setConfirming(false); }
      else setError(json?.error ?? `儲存失敗（${res.status}）`);
    } catch {
      setError("網路錯誤，請重試");
    } finally { setSaving(false); }
  }

  function pick(next: boolean) {
    if (next === on) return;
    if (next) setConfirming(true);
    else void save(false);
  }

  const btn = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--card-border)"}`,
    background: active ? "var(--accent)" : "var(--bg-card)", color: active ? "var(--bg-card)" : "var(--text-primary)",
  });

  if (readOnly) {
    return (
      <div style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 12 }}>
        每日熱題：{on ? "開" : "關"}。要更改請聯絡我們。
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>每日熱題</span>
        <button type="button" style={btn(!on)} disabled={saving} onClick={() => pick(false)} aria-pressed={!on}>關</button>
        <button type="button" style={btn(on)} disabled={saving} onClick={() => pick(true)} aria-pressed={on}>開</button>
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{DETAIL}</div>
      {!trendGeosFor(site.contentDefaults?.targetCountry).length && (
        <div style={{ color: "var(--red)", fontSize: 12 }}>這個網站的目標國家「{site.contentDefaults?.targetCountry}」沒有熱搜來源，開了也不會有每日題目；改成支援的國家或「全球」才有。</div>
      )}
      {confirming && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-primary)" }}>
          <span>每天會呼叫一次 AI 打分，會花費額度。確定嗎？</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void save(true)}>確定打開</button>
          <button type="button" className="btn btn-sm" disabled={saving} onClick={() => setConfirming(false)}>取消</button>
        </div>
      )}
      {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
    </div>
  );
}
