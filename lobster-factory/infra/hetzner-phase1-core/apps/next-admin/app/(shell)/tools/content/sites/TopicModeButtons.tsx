"use client";

// A site's topic mode (AUTO_CONTENT P9.2, B4): who approves the month's proposed topics -- a person by default. Independent of
// the publish mode beside it. Saved on its own (PATCH { topicMode }), never as part of the defaults form. Turning AI on asks
// once more first (the schedule then spends the customer's money without a person). Staff only (the route refuses others).
import { useState } from "react";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { aiPicksTopics, type TopicMode } from "@/lib/content/brand-voice";

const MODES: Array<{ value: TopicMode; label: string; detail: string }> = [
  { value: "human_pick", label: "題目我自己挑", detail: "每月自動提出題目，留在題目佇列等人勾選核准才會做。只管題目；文章怎麼發布看旁邊的設定。" },
  { value: "ai_pick", label: "AI 挑好直接做", detail: "每月提出的題目由 AI 自動核准，到排定日就開始做。只管題目；文章怎麼發布看旁邊的設定。" },
];

export default function TopicModeButtons({ site, onSaved, readOnly = false }: { site: ManagedSite; onSaved: (updated: ManagedSite) => void; readOnly?: boolean }) {
  const current: TopicMode = aiPicksTopics(site.contentDefaults) ? "ai_pick" : "human_pick";
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(mode: TopicMode) {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/content/sites/${site.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topicMode: mode }),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean; site?: ManagedSite; error?: string } | null;
      if (json?.ok && json.site) { onSaved(json.site); setConfirming(false); }
      else setError(json?.error ?? `儲存失敗（${res.status}）`);
    } catch {
      setError("網路錯誤，請重試");
    } finally { setSaving(false); }
  }

  function pick(mode: TopicMode) {
    if (mode === current) return;
    if (mode === "ai_pick") setConfirming(true);
    else void save(mode);
  }

  const btn = (on: boolean): React.CSSProperties => ({
    padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
    border: `1px solid ${on ? "var(--accent)" : "var(--card-border)"}`,
    background: on ? "var(--accent)" : "var(--bg-card)", color: on ? "var(--bg-card)" : "var(--text-primary)",
  });

  const shown = MODES.find((m) => m.value === current);
  if (readOnly) {
    return (
      <div style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 12 }}>
        選題方式：{shown?.label}。{shown?.detail}要更改請聯絡我們。
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>選題方式</span>
        {MODES.map((m) => (
          <button key={m.value} type="button" style={btn(current === m.value)} disabled={saving} onClick={() => pick(m.value)}
            aria-pressed={current === m.value}>
            {m.label}
          </button>
        ))}
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{shown?.detail}</div>
      {confirming && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-primary)" }}>
          <span>AI 提出的題目會自動核准並開始做，會花費額度。確定嗎？</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void save("ai_pick")}>確定讓 AI 挑題</button>
          <button type="button" className="btn btn-sm" disabled={saving} onClick={() => setConfirming(false)}>取消</button>
        </div>
      )}
      {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
    </div>
  );
}
