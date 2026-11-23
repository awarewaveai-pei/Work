"use client";
// 審片與發布 (video-unify-plan-20261116 §4 U6, D8): the QA step and the release panel the old pipeline used, as one page
// of the workbench -- steps 11 (審片) and 12 (發布) of an episode open it at their own half. The organization is the
// caller's and never picked here; the video comes with the link (an episode's cut) or is picked from a project's.
// K11 (ADR 020 §2.4): the link's organizationId must be the workbench's own client (capabilities.mainSystem, the same
// source as schedule/ and works/); another client's video says so and loads nothing until the workbench is switched.
import { useEffect, useRef, useState } from "react";
import QaStep from "../../../(shell)/tools/video/QaStep";
import ReleaseDeliveryPanel from "../../../(shell)/tools/video/ReleaseDeliveryPanel";
import { useWorkbench } from "../workbench";

const note = (text: string) => <p style={{ padding: "24px 28px", fontSize: 12, color: "var(--text-secondary)" }}>{text}</p>;

export default function ReviewRelease({ organizationId, assetId, projectId, section }: { organizationId?: string; assetId?: string; projectId?: string; section: "qa" | "release" }) {
  const workbench = useWorkbench();
  const [identity, setIdentity] = useState<string | null | undefined>(undefined);
  const [candidate, setCandidate] = useState(assetId);
  const half = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!workbench) return;
    let live = true;
    workbench.loadCapabilities().then((c) => live && setIdentity(c?.mainSystem?.organizationId?.toLowerCase() || null), () => live && setIdentity(null));
    return () => { live = false; };
  }, [workbench]);
  const mine = identity !== undefined && identity !== null && organizationId?.toLowerCase() === identity;
  // Step 12 opens at the release half; a video chosen below brings its release half into view too.
  useEffect(() => { if (mine && (section === "release" || candidate !== assetId)) half.current?.scrollIntoView?.(); }, [mine, section, candidate, assetId]);
  if (!organizationId || (!assetId && !projectId)) return note("請從一支成片或一個專案打開審片與發布。");
  if (identity === undefined) return note("載入中…");
  if (identity === null) return note("這個影片工作台沒有連上主系統，審片與發布無法使用。");
  if (!mine) return note("這支影片屬於另一個客戶，請先在工作台頂部切換到那個客戶，再重新打開。");
  return <>
    <QaStep organizationId={organizationId} projectId={assetId ? undefined : projectId} initialAssetId={assetId} includeWorkbench onContinue={(id) => { setCandidate(id); half.current?.scrollIntoView?.({ behavior: "smooth" }); }} />
    <div ref={half}>
      {candidate
        ? <ReleaseDeliveryPanel key={candidate} organizationLocked initialOrganizationId={organizationId} initialCandidateAssetId={candidate} />
        : <p style={{ padding: "0 28px 24px", fontSize: 12, color: "var(--text-secondary)" }}>在上面選一支影片，四項檢查通過後按「繼續到發布」，這裡就是它的發布。</p>}
    </div>
  </>;
}
