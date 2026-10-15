"use client";
// 媒體 (SOCIAL_MANAGER_PLAN.md C9; mock: #mediaView). The brand's media, newest first, with how many posts use each;
// upload adds one (through Postiz storage, lib/social/store.ts addImage); a click attaches it to the post open on the
// right (the editor takes it through SlotContext.attach). Storage moves to R2 on its own card (runbook R2 item).
import { useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { SlotContext } from "./SocialManager";

const MAX_UPLOAD = 10 * 1024 * 1024;

export default function MediaView({ ctx }: { ctx: SlotContext }) {
  const { brand, media } = ctx;
  const canWrite = brand.role === "owner" || brand.role === "editor";
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (file.size > MAX_UPLOAD) return ctx.say("圖片超過 10 MB。", true);
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const { media: m } = await api.upload(brand.id, dataUrl, file.name.replace(/[^\w.\- ]/g, "_").slice(0, 200) || "image.webp");
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
        {canWrite && <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>＋ 上傳</button>}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
        <span className="sm-muted">{ctx.canAttach ? "點一張圖，會附到右邊這則貼文。" : "先打開一則貼文，再點圖片，就會附上去。"}</span>
      </div>
      <div className="sm-media-grid">
        {media.map((m) => (
          <button type="button" key={m.id} className="sm-mitem" disabled={!ctx.canAttach || !canWrite} title={m.file_name}
            onClick={() => { ctx.attach(m.id); ctx.say(`已附上 ${m.file_name}。`); }}>
            {m.postiz_path ? <img className="sm-mth" src={m.postiz_path} alt="" /> : <span className="sm-mth">{m.kind === "video" ? "影片" : "圖"}</span>}
            <span className="sm-ellipsis">{m.file_name}</span>
            <span className="sm-muted">用過 {m.used ?? 0} 次</span>
          </button>
        ))}
        {!media.length && <span className="sm-muted">還沒有媒體。</span>}
      </div>
    </div>
  );
}
