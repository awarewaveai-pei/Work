"use client";

import { useState, type ReactNode } from "react";
import { validateTimelineDraft, type TimelineDraftResult } from "@/lib/content/video/timeline-draft-validation";

export default function TimelineValidationPanel() {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TimelineDraftResult | null>(null);

  const validate = async () => {
    setBusy(true);
    setResult(await validateTimelineDraft(raw));
    setBusy(false);
  };

  let feedback: ReactNode = null;
  if (result?.ok === true) {
    feedback = <div style={{ border: "1px solid var(--green)", background: "var(--intake-success-bg)", borderRadius: 8, padding: 12, fontSize: 12, display: "grid", gap: 5 }}>
      <b>結構驗證通過；尚不可渲染</b>
      <span>Timeline：{result.timeline.timelineId}</span>
      <span>組織：{result.timeline.organizationId}</span>
      <span>Tracks：{result.timeline.trackCount}；輸出：{result.timeline.outputProfiles.join(", ")}</span>
      <span>仍需：{result.pendingChecks.join("、")}</span>
    </div>;
  } else if (result) {
    feedback = <div style={{ border: "1px solid var(--red)", background: "var(--badge-red-bg)", borderRadius: 8, padding: 12, fontSize: 12, color: "var(--badge-red-text)" }}>
      <b>驗證未通過</b>
      <div>{result.error}{result.status ? `（HTTP ${result.status}）` : ""}</div>
      {result.errors ? <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{JSON.stringify(result.errors, null, 2)}</pre> : null}
    </div>;
  }

  return <div style={{ padding: "20px 28px", display: "grid", gap: 14 }}>
    <div>
      <b style={{ fontSize: 15 }}>Timeline v1 草稿驗證</b>
      <p style={{ margin: "4px 0", fontSize: 12, color: "var(--text-secondary)" }}>只做結構與租戶驗證；不會渲染、儲存、發布或產生成本。</p>
    </div>
    <textarea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="貼入完整 Timeline v1 JSON" rows={18} spellCheck={false} style={{ width: "100%", resize: "vertical", boxSizing: "border-box", padding: 12, borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--card-bg)", color: "var(--text-primary)", fontFamily: "ui-monospace, monospace", fontSize: 12 }} />
    <button type="button" onClick={() => void validate()} disabled={busy || !raw.trim()} style={{ width: "fit-content", padding: "9px 14px", border: 0, borderRadius: 7, background: "var(--accent)", color: "var(--btn-primary-text)", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}>{busy ? "驗證中…" : "驗證 Timeline"}</button>
    {feedback}
  </div>;
}
