"use client";
// Copies the resume brief (built on the server from real data) to the clipboard. Nothing else.
import { useState } from "react";

export function CopyBrief({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("ok");
    } catch {
      setState("fail");
    }
  };
  return (
    <div>
      <button type="button" className="btn-primary" style={{ fontSize: 13, padding: "8px 14px" }} onClick={copy}>複製接續摘要</button>
      <span role="status" style={{ marginLeft: 10, fontSize: 12, color: "var(--text-muted)" }}>
        {state === "ok" ? "已複製，貼給 Claude 或 Codex 即可接續。" : state === "fail" ? "這個瀏覽器不讓複製，請手動選取下方文字。" : ""}
      </span>
      {state === "fail" && <textarea readOnly value={text} rows={12} style={{ width: "100%", marginTop: 8, fontSize: 12 }} />}
    </div>
  );
}
