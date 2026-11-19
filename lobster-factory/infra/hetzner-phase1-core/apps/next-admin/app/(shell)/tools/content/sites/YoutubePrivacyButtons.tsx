"use client";

// Who sees this site's auto-made YouTube videos (N5a, plan O7): public by default. Saved on its own (PATCH { youtubePrivacy }),
// never as part of the defaults form; staff only (the route refuses others). Read when the topic's YouTube draft is made.
import { useState } from "react";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { youtubePrivacy, type YoutubePrivacy } from "@/lib/content/brand-voice";

const CHOICES: Array<{ value: YoutubePrivacy; label: string; detail: string }> = [
  { value: "public", label: "公開", detail: "自動做好的影片在 YouTube 上公開，任何人都搜得到。" },
  { value: "unlisted", label: "不公開", detail: "自動做好的影片在 YouTube 上不公開，只有拿到連結的人看得到；文章裡的影片照樣能播。" },
];

export default function YoutubePrivacyButtons({ site, onSaved, readOnly = false }: { site: ManagedSite; onSaved: (updated: ManagedSite) => void; readOnly?: boolean }) {
  const current = youtubePrivacy(site.contentDefaults);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = CHOICES.find((c) => c.value === current);

  async function save(value: YoutubePrivacy) {
    if (value === current) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/content/sites/${site.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtubePrivacy: value }),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean; site?: ManagedSite; error?: string } | null;
      if (json?.ok && json.site) onSaved(json.site);
      else setError(json?.error ?? `儲存失敗（${res.status}）`);
    } catch {
      setError("網路錯誤，請重試");
    } finally { setSaving(false); }
  }

  if (readOnly) {
    return <div style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 12 }}>YouTube 影片：{shown?.label}。{shown?.detail}要更改請聯絡我們。</div>;
  }

  const btn = (on: boolean): React.CSSProperties => ({
    padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
    border: `1px solid ${on ? "var(--accent)" : "var(--card-border)"}`,
    background: on ? "var(--accent)" : "var(--bg-card)", color: on ? "var(--bg-card)" : "var(--text-primary)",
  });

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>YouTube 影片</span>
        {CHOICES.map((c) => (
          <button key={c.value} type="button" style={btn(current === c.value)} disabled={saving} onClick={() => void save(c.value)}
            aria-pressed={current === c.value}>
            {c.label}
          </button>
        ))}
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{shown?.detail}</div>
      {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
    </div>
  );
}
