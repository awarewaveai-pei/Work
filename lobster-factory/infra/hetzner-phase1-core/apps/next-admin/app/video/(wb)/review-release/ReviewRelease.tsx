"use client";
// 審片與發布 (video-unify-plan-20261116 §4 U6, D8): the QA step and the release panel the old pipeline used, as one page
// of the workbench -- steps 11 (審片) and 12 (發布) of an episode open it at their own half. The organization is the
// caller's and never picked here; the video comes with the link (an episode's cut) or is picked from a project's.
import { useEffect, useRef, useState } from "react";
import QaStep from "../../../(shell)/tools/video/QaStep";
import ReleaseDeliveryPanel from "../../../(shell)/tools/video/ReleaseDeliveryPanel";

export default function ReviewRelease({ organizationId, assetId, projectId, section }: { organizationId?: string; assetId?: string; projectId?: string; section: "qa" | "release" }) {
  const [candidate, setCandidate] = useState(assetId);
  const half = useRef<HTMLDivElement>(null);
  // Step 12 opens at the release half; a video chosen below brings its release half into view too.
  useEffect(() => { if (section === "release" || candidate !== assetId) half.current?.scrollIntoView?.(); }, [section, candidate, assetId]);
  if (!organizationId || (!assetId && !projectId)) return <p style={{ padding: "24px 28px", fontSize: 12, color: "var(--text-secondary)" }}>請從一支成片或一個專案打開審片與發布。</p>;
  return <>
    <QaStep organizationId={organizationId} projectId={assetId ? undefined : projectId} initialAssetId={assetId} includeWorkbench onContinue={(id) => { setCandidate(id); half.current?.scrollIntoView?.({ behavior: "smooth" }); }} />
    <div ref={half}>
      {candidate
        ? <ReleaseDeliveryPanel key={candidate} organizationLocked initialOrganizationId={organizationId} initialCandidateAssetId={candidate} />
        : <p style={{ padding: "0 28px 24px", fontSize: 12, color: "var(--text-secondary)" }}>在上面選一支影片，四項檢查通過後按「繼續到發布」，這裡就是它的發布。</p>}
    </div>
  </>;
}
