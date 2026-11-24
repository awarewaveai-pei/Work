"use client";
// K25: the article cover as it will be published -- drawn by /api/content/cover-preview (the same renderCover the
// pipeline uses), asked again only after the input has been still for a moment, never per key press. Nothing stored.
import { useEffect, useRef, useState } from "react";
import type { CoverSettings } from "@/lib/content/cover/settings";

export const COVER_PREVIEW_DELAY_MS = 600;

export default function CoverPreview({ title, subtitle, settings, imageUrl, width = 320 }: {
  title: string; subtitle?: string; settings: CoverSettings; imageUrl?: string; width?: number;
}) {
  const [src, setSrc] = useState("");
  const [err, setErr] = useState("");
  const shown = useRef("");   // the object URL on screen: freed when replaced or unmounted
  useEffect(() => () => { if (shown.current) URL.revokeObjectURL(shown.current); }, []);
  const key = JSON.stringify({ title: title.trim(), subtitle: subtitle?.trim() ?? "", settings, imageUrl: imageUrl ?? "" });
  useEffect(() => {
    const body = JSON.parse(key) as { title: string };
    if (!body.title) { setErr("沒有標題"); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/content/cover-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: ctrl.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${r.status}`);
          const url = URL.createObjectURL(await r.blob());
          if (shown.current) URL.revokeObjectURL(shown.current);
          shown.current = url;
          setSrc(url); setErr("");
        })
        .catch((e) => { if (!ctrl.signal.aborted) setErr(e instanceof Error ? e.message : String(e)); });
    }, COVER_PREVIEW_DELAY_MS);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [key]);
  return (
    <div style={{ width, maxWidth: "100%" }}>
      {src
        ? <img src={src} alt="封面預覽" style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: 6, border: "1px solid var(--card-border)", display: "block" }} />
        : <div style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: 6, border: "1px dashed var(--card-border)" }} />}
      {err && <div className="form-hint" style={{ color: "var(--red)", marginTop: 4 }}>封面預覽失敗：{err}</div>}
    </div>
  );
}
