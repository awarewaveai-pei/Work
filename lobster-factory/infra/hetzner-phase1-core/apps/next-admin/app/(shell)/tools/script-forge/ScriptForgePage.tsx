"use client";

// The standalone ScriptForge page (AUTO_CONTENT plan P5.26): the same component the video pipeline's step 1 mounts;
// 「送去生產影片」 carries the script to /tools/video (script-handoff.ts) instead of moving to the next step in-page;
// 「送社群」 saves a social draft through the social product's API (staff page only: the video door has no such call).
import ScriptForge from "../video/ScriptForge";
import { stashForVideo, type ScriptHandoff } from "../video/script-handoff";

function toVideo(kind: ScriptHandoff["kind"], payload: object) {
  if (stashForVideo({ kind, payload: payload as Record<string, unknown> })) window.location.assign("/tools/video");
  else window.alert("這個瀏覽器不能暫存腳本（可能是無痕模式），請到「影片生成工具」第 1 步直接做。");
}

function saveSocialDraft(brand: string, fields: { body: string; notes: string }) {
  return fetch("/api/social/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand, fields }) });
}

export default function ScriptForgePage() {
  return <ScriptForge sideMenu saveSocialDraft={saveSocialDraft}
    onSendToProduction={(p) => toVideo("production", p)} onSendToRemotion={(p) => toVideo("remotion", p)} />;
}
