"use client";
// 媒體 (SOCIAL_MANAGER_PLAN.md C9; mock: #mediaView). The brand's media, newest first, with how many posts use each;
// upload adds one (through Postiz storage, lib/social/store.ts addImage); a click attaches it to the post open on the
// right (the editor takes it through SlotContext.attach). Storage moves to R2 on its own card (runbook R2 item).
import { useRef, useState } from "react";
import { api, ApiError } from "../api";
import { fileDataUrl, uploadTooLarge } from "../media";
import type { SlotContext } from "../SocialManager";

export default function MediaView({ ctx, selected, onToggle }: { ctx: SlotContext; selected?: Set<string>; onToggle?: (id: string) => void }) {
  const { brand, media } = ctx;
  const canWrite = brand.role === "owner" || brand.role === "editor";
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [squareCrop, setSquareCrop] = useState(false);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const shown = media.filter((m) => filter === "all" || m.kind === filter);

  async function upload(file: File) {
    const video = file.type.startsWith("video/");
    const tooLarge = uploadTooLarge(file);
    if (tooLarge) return ctx.say(tooLarge, true);
    setBusy(true);
    try {
      const dataUrl = await fileDataUrl(file, squareCrop);
      const name = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 200) || (video ? "video.mp4" : "image.webp");
      const { media: m } = video ? await api.uploadVideo(brand.id, dataUrl, name) : await api.upload(brand.id, dataUrl, name);
      ctx.mediaAdded(m);
      ctx.say(`已上傳 ${m.file_name}。`);
    } catch (e) {
      ctx.say(e instanceof ApiError ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sm-side">
      <div className="sm-row sm-chips">
        {canWrite && <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>＋ 上傳圖片／影片</button>}
        {canWrite && <label className="sm-ck"><input type="checkbox" checked={squareCrop} disabled={busy} onChange={(e) => setSquareCrop(e.target.checked)} />圖片裁成方形</label>}
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
        <span className="sm-muted">{ctx.canAttach ? "點一張圖，會附到右邊這則貼文。" : "先打開一則貼文，再點圖片，就會附上去。"}</span>
      </div>
      <div className="sm-seg" role="group" aria-label="媒體類型"><button type="button" className={filter === "all" ? "sm-on" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>全部</button><button type="button" className={filter === "image" ? "sm-on" : ""} aria-pressed={filter === "image"} onClick={() => setFilter("image")}>圖片</button><button type="button" className={filter === "video" ? "sm-on" : ""} aria-pressed={filter === "video"} onClick={() => setFilter("video")}>影片</button></div>
      <div className="sm-media-grid">
        {shown.map((m) => (
          <button type="button" key={m.id} className={`sm-mitem${selected?.has(m.id) ? " sm-sel" : ""}`} disabled={selected ? !canWrite : !ctx.canAttach || !canWrite} aria-pressed={selected ? selected.has(m.id) : undefined} title={m.file_name}
            onClick={() => { if (selected && onToggle) onToggle(m.id); else { ctx.attach(m.id); ctx.say(`已附上 ${m.file_name}。`); } }}>
            {m.postiz_path ? m.kind === "video" ? <video className="sm-mth" src={m.postiz_path} muted preload="metadata" /> : <img className="sm-mth" src={m.postiz_path} alt="" /> : <span className="sm-mth">{m.kind === "video" ? "影片" : "圖"}</span>}
            <span className="sm-ellipsis">{m.file_name}</span>
            <span className="sm-muted">用過 {m.used ?? 0} 次</span>
          </button>
        ))}
        {!shown.length && <span className="sm-muted">這個分類還沒有媒體。</span>}
      </div>
    </div>
  );
}
