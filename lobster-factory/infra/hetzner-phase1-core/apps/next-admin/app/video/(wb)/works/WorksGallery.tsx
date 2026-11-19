"use client";
// The workbench's 作品: only the customer the workbench is switched to (capabilities.mainSystem, the same source as
// schedule/ and script-forge/). The list waits for it, so no unscoped request goes out first.
import { useEffect, useState } from "react";
import DesignsGallery from "../../../(shell)/tools/designs/DesignsGallery";
import { useWorkbench } from "../workbench";

export default function WorksGallery() {
  const workbench = useWorkbench();
  const [organizationId, setOrganizationId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!workbench) return;
    let live = true;
    workbench.loadCapabilities().then((c) => live && setOrganizationId(c?.mainSystem?.organizationId || null), () => live && setOrganizationId(null));
    return () => { live = false; };
  }, [workbench]);
  if (organizationId === undefined) return <p style={{ padding: 24, fontSize: 13, color: "var(--text-muted)" }}>載入中…</p>;
  if (!organizationId) return <p style={{ padding: 24, fontSize: 13, color: "var(--text-muted)" }}>這個影音工作台沒有連上主系統，作品無法顯示。</p>;
  return <DesignsGallery initialTab="videos" organizationId={organizationId} />;
}
