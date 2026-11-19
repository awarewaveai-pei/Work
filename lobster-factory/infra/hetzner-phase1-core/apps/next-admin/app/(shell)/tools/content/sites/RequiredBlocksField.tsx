"use client";

// N1b: the site's must-carry paragraphs. Always visible on the site card (it used to hide inside the collapsed defaults
// panel, so nobody saw whether a site had any). Saves on its own: the stored defaults with only requiredBlocks swapped
// (the route replaces contentDefaults whole), so unsaved edits in the defaults panel never ride along.
import { useState } from "react";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { MAX_REQUIRED_BLOCKS, requiredBlocks } from "@/lib/content/brand-voice";

const NL = String.fromCharCode(10);

export default function RequiredBlocksField({ site, onSaved }: { site: ManagedSite; onSaved: (updated: ManagedSite) => void }) {
  const stored = (site.contentDefaults?.requiredBlocks ?? []).join(NL);
  const [text, setText] = useState(stored);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = requiredBlocks(site.contentDefaults).length;

  async function save() {
    setSaving(true); setSaved(false); setError(null);
    try {
      const res = await fetch(`/api/content/sites/${site.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentDefaults: { ...(site.contentDefaults ?? {}), requiredBlocks: text.split(NL) } }),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean; site?: ManagedSite; error?: string } | null;
      if (json?.ok && json.site) {
        onSaved(json.site);
        setText((json.site.contentDefaults?.requiredBlocks ?? []).join(NL));
        setSaved(true);
      } else setError(json?.error ?? `儲存失敗（${res.status}）`);
    } catch {
      setError("網路錯誤，請重試");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>每篇必附段落（一行一段，最多 {MAX_REQUIRED_BLOCKS} 段）</span>
        {count > 0 && <span style={{ color: "var(--green)", fontSize: 12 }}>已設 {count} 段</span>}
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>例如免責聲明、求助專線。AI 寫的文章會逐字附在文末；少了任何一段，審核就不會過。影片建的新草稿也會自動帶上。</div>
      <textarea aria-label="每篇必附段落" value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }}
        placeholder={["例：本文僅供參考，不能取代專業醫療或心理治療。", "例：如有立即危險，請撥 1925 安心專線或 1995 生命線。"].join(NL)}
        style={{ background: "var(--form-input-bg)", border: "1px solid var(--card-border)", borderRadius: 5, color: "var(--text-primary)", padding: "6px 8px", fontSize: 13, width: "100%", boxSizing: "border-box", minHeight: 72, resize: "vertical" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" className="btn btn-sm" disabled={saving || text === stored} onClick={() => void save()}>
          {saving ? "儲存中…" : "儲存必附段落"}
        </button>
        {saved && <span style={{ color: "var(--green)", fontSize: 12 }}>✓ 已儲存</span>}
        {error && <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span>}
      </div>
    </div>
  );
}
