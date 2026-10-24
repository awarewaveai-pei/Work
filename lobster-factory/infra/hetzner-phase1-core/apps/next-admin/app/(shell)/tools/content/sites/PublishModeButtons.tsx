"use client";

// A site's publish mode (plan D1, I5): two buttons, human review by default. Saved on its own (PATCH { publishMode }),
// never as part of the defaults form, so a stale form cannot flip it. Turning auto on asks once more first. Staff only
// (the route refuses others): on the content door the customer sees the mode, without buttons.
import { useState } from "react";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { autoPublishes, type PublishMode } from "@/lib/content/brand-voice";

const MODES: Array<{ value: PublishMode; label: string; detail: string }> = [
  { value: "human_review", label: "人工審核", detail: "排程做好的文章和社群貼文都留在草稿，由人看過再發布。" },
  { value: "ai_review_auto", label: "AI 審核後自動發布", detail: "規則檢查全部通過才自動發布；沒通過的留在草稿。" },
];

export default function PublishModeButtons({ site, onSaved, readOnly = false }: { site: ManagedSite; onSaved: (updated: ManagedSite) => void; readOnly?: boolean }) {
  const current: PublishMode = autoPublishes(site.contentDefaults) ? "ai_review_auto" : "human_review";
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(mode: PublishMode) {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/content/sites/${site.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publishMode: mode }),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean; site?: ManagedSite; error?: string } | null;
      if (json?.ok && json.site) { onSaved(json.site); setConfirming(false); }
      else setError(json?.error ?? `儲存失敗（${res.status}）`);
    } catch {
      setError("網路錯誤，請重試");
    } finally { setSaving(false); }
  }

  function pick(mode: PublishMode) {
    if (mode === current) return;
    if (mode === "ai_review_auto") setConfirming(true);
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
        發布方式：{shown?.label}。{shown?.detail}要更改請聯絡我們。
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>發布方式</span>
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
          <span>通過檢查的文章會直接上線、社群貼文會排進發送。確定嗎？</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void save("ai_review_auto")}>確定自動發布</button>
          <button type="button" className="btn btn-sm" disabled={saving} onClick={() => setConfirming(false)}>取消</button>
        </div>
      )}
      {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
    </div>
  );
}
