"use client";

// K26: the image source of this site's schedule articles, chosen apart from the article page's default (the defaults
// form's 圖片模型). Saved on its own (PATCH { scheduleImageModel }), staff only, like the text road beside it. The pressed
// button is what the schedule draws with now (scheduleImageModel(): an unset site follows its manual default when a
// schedule can use it, else the default), so a site never set shows its real source.
import { useState } from "react";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { ARTICLE_IMAGE_SOURCES, articleImageSourceLabel, scheduleImageModel } from "@/lib/content/image/article-image";
import OptionButtons from "./OptionButtons";

const LABEL = "排程文章的圖片來源";
const OPTIONS = [
  ...ARTICLE_IMAGE_SOURCES.filter((s) => s.schedule).map((s) => ({ value: s.value, label: articleImageSourceLabel(s) })),
  { value: "none", label: "不配圖" },
];

export default function ScheduleImageButtons({ site, onSaved, readOnly = false }: { site: ManagedSite; onSaved: (updated: ManagedSite) => void; readOnly?: boolean }) {
  const current = scheduleImageModel(site.contentDefaults);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(value: string) {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/content/sites/${site.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduleImageModel: value }),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean; site?: ManagedSite; error?: string } | null;
      if (json?.ok && json.site) onSaved(json.site);
      else setError(json?.error ?? `儲存失敗（${res.status}）`);
    } catch {
      setError("網路錯誤，請重試");
    } finally { setSaving(false); }
  }

  if (readOnly) {
    const shown = OPTIONS.find((o) => o.value === current)?.label ?? current;
    // not set on its own: the schedule follows the site's 圖片模型 (or the default), which the defaults form below can change
    const own = site.contentDefaults?.scheduleImageModel === current;
    return <div style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 12 }}>
      {LABEL}：{shown}。{own ? "要更改請聯絡我們。" : "目前沿用下方的「圖片模型」（不能用的來源改用預設）；要另外指定請聯絡我們。"}
    </div>;
  }

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
      <OptionButtons label={LABEL} value={current} options={OPTIONS} onChange={(v) => void save(v)} />
      <div className="form-hint">Codex 免費生圖要等主機常駐上線後才能給排程用</div>
      {error && <div style={{ color: "var(--badge-red-text)", fontSize: 12 }}>{error}</div>}
    </div>
  );
}
