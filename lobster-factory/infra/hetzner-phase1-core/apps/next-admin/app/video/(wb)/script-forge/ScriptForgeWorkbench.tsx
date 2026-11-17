"use client";
// 腳本 inside the video workbench (video-unify-plan-20261116 §4 U3): the same ScriptForge, its modules, fields, flow and
// words unchanged. It works for the organization the workbench is connected to (capabilities.mainSystem), so no
// organization picker shows. 「送去做影片」 makes a new episode; opened from an episode, it writes the shots back instead.
import { useEffect, useState } from "react";
import ScriptForge, { type AutoDraftRequest } from "../../../(shell)/tools/video/ScriptForge";
import OneClickDraftDialog from "./OneClickDraftDialog";
import { ratioForPlatform, shotsFromScript, type VideoHandoff } from "../../../(shell)/tools/video/video-handoff";
import { useWorkbench, type Workbench } from "../workbench";

// The projects page's store key (VW scripts/projects-0.js STORE): read for how many shots the episode has now.
const PROJECTS = "awarewave-projects-screenshot-frontend-v1";
type Target = { projectId: string; episodeId: string };

function saveSocialDraft(brand: string, fields: { body: string; notes: string }) {
  return fetch("/api/video/social-drafts/text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: brand, fields }) });
}

function shotCount(workbench: Workbench, { projectId, episodeId }: Target): number {
  try {
    const state = JSON.parse(workbench.storage.getItem(PROJECTS) ?? "null") as { projects?: { id: string; episodes?: { id: string; shots?: unknown[] }[] }[] } | null;
    return state?.projects?.find((p) => p.id === projectId)?.episodes?.find((e) => e.id === episodeId)?.shots?.length ?? 0;
  } catch {
    return 0;
  }
}

async function send(workbench: Workbench, episode: Target | null, h: VideoHandoff): Promise<boolean> {
  const shots = shotsFromScript(h.script);
  try {
    if (!episode) {
      await workbench.spine.create({ title: h.title || "未命名影片", ratio: ratioForPlatform(h.platform), shots, characters: h.storyBible?.characters ?? [], storyBibleSeries: h.storyBible?.seriesId });
      return true;
    }
    const n = shotCount(workbench, episode);
    if (n > 0 && !window.confirm(`這一集已有 ${n} 個鏡頭，寫回會取代現有鏡頭。確定寫回？`)) return false;
    // Card U9: the script's cast comes along, so the shots that name a character are bound to it again.
    await workbench.spine.setShots({ ...episode, shots, characters: h.storyBible?.characters ?? [], storyBibleSeries: h.storyBible?.seriesId });
    return true;
  } catch (e) {
    window.alert(`${episode ? "寫回這一集" : "建立影片"}失敗：${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

export default function ScriptForgeWorkbench({ episode, socialHref }: { episode: Target | null; socialHref: string | null }) {
  const workbench = useWorkbench();
  // undefined = still asking; null = this workbench is not connected to the main system
  const [organizationId, setOrganizationId] = useState<string | null | undefined>(undefined);
  const [pending, setPending] = useState<{ request: AutoDraftRequest; resolve: () => void } | null>(null);
  useEffect(() => {
    if (!workbench) return;
    let live = true;
    workbench.loadCapabilities().then((c) => live && setOrganizationId(c?.mainSystem?.organizationId || null), () => live && setOrganizationId(null));
    return () => { live = false; };
  }, [workbench]);
  if (!workbench || organizationId === undefined) return <p style={{ padding: 24, fontSize: 13, color: "var(--text-muted)" }}>載入中…</p>;
  if (!organizationId) return <p style={{ padding: 24, fontSize: 13, color: "var(--text-muted)" }}>這個影音工作台沒有連上主系統，腳本無法使用。</p>;
  return (
    <><ScriptForge sideMenu videoNeedsClient={false} organizationId={organizationId}
      onSendToVideo={(h) => send(workbench, episode, h)} videoVerb={episode ? "寫回這一集" : undefined}
      onStartDrafts={(request) => new Promise<void>((resolve) => setPending({ request, resolve }))}
      saveSocialDraft={socialHref ? saveSocialDraft : undefined} socialHref={socialHref ?? undefined} />
      {pending && <OneClickDraftDialog request={pending.request} workbench={workbench} close={() => { pending.resolve(); setPending(null); }} />}</>
  );
}
