"use client";

// The standalone ScriptForge page (AUTO_CONTENT plan P5.26): the writing desk. 「送去做影片」 creates a video project for
// the loaded client (VIDEO_TOOL_REDESIGN V1.3) and opens it in /tools/video; 「送社群」 saves a social draft through
// the social product's API (staff page only: the video door has no such call).
import ScriptForge from "../video/ScriptForge";
import type { VideoHandoff } from "../video/video-handoff";

async function toVideo(handoff: VideoHandoff, organizationId: string) {
  const res = await fetch("/api/video/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, title: handoff.title || "未命名影片", productionMode: "quick_video", source: "script_forge", brief: handoff }),
  });
  const json = await res.json().catch(() => null) as { item?: { id?: string }; error?: string } | null;
  if (res.ok && json?.item?.id) window.location.assign(`/tools/video?project=${json.item.id}`);
  else window.alert(`建立影片專案失敗：${json?.error ?? res.status}`);
}

function saveSocialDraft(brand: string, fields: { body: string; notes: string }) {
  return fetch("/api/social/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand, fields }) });
}

export default function ScriptForgePage() {
  return <ScriptForge sideMenu saveSocialDraft={saveSocialDraft} videoNeedsClient onSendToVideo={(h, org) => void toVideo(h, org)} />;
}
