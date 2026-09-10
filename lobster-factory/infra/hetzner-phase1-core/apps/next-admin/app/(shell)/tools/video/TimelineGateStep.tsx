"use client";

import { useEffect, useRef, useState } from "react";
import { validateTimelineDraft, type TimelineDraftResult } from "@/lib/content/video/timeline-draft-validation";
import type { ProductionMode } from "./ModeSelectStep";

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14 };

/**
 * ⑤ 背景 Timeline 驗證——非使用者操作頁，生成完自動跑、通過就自動往下一步。
 * 只有 footage_edit 目前會產生正式 Timeline v1 物件（FootageEditor 的 compiledTimeline）；
 * 其餘引擎（quick_video/short_drama 的 ffmpeg 路徑、remotion 手動模板）不走這個物件，誠實標
 * 「此引擎不適用」直接放行，不假裝驗證了不存在的東西。手動貼 JSON 的進階版本仍在
 * 審片與交付分組底下可以找到（TimelineValidationPanel，未刪除）。
 */
export default function TimelineGateStep({
  mode,
  timelineJson,
  onPass,
}: {
  mode: ProductionMode;
  timelineJson?: string;
  onPass: () => void;
}) {
  const [result, setResult] = useState<TimelineDraftResult | null>(null);
  const [checking, setChecking] = useState(false);
  const ran = useRef(false);

  const applicable = mode === "footage_edit" && !!timelineJson;

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!applicable) {
      const t = setTimeout(onPass, 900);
      return () => clearTimeout(t);
    }
    setChecking(true);
    void validateTimelineDraft(timelineJson!).then((r) => {
      setResult(r);
      setChecking(false);
      if (r.ok) setTimeout(onPass, 1200);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>⑤ Timeline 背景驗證</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>自動執行，不需要操作。</div>
      </div>

      {!applicable && (
        <div style={{ ...card, color: "var(--text-secondary)", fontSize: 12.5 }}>
          此引擎（{mode === "remotion" ? "Remotion 模板" : "快速影片／短劇"}）不產生正式 Timeline v1 物件，這關自動放行 → 正在前往下一步…
        </div>
      )}

      {applicable && checking && (
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--text-secondary)" }}>
          <span style={{ width: 14, height: 14, border: "2px solid var(--border-subtle)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          驗證中…
          <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        </div>
      )}

      {applicable && result?.ok === true && (
        <div style={{ border: "1px solid var(--green)", background: "var(--intake-success-bg)", borderRadius: 8, padding: 12, fontSize: 12, display: "grid", gap: 5 }}>
          <b>結構驗證通過 → 正在前往下一步…</b>
          <span>Tracks：{result.timeline.trackCount}；輸出：{result.timeline.outputProfiles.join(", ")}</span>
        </div>
      )}

      {applicable && result && result.ok !== true && (
        <div style={{ border: "1px solid var(--red)", background: "var(--badge-red-bg)", borderRadius: 8, padding: 12, fontSize: 12, color: "var(--badge-red-text)" }}>
          <b>驗證未通過——請回上一步調整剪輯計畫再重新編譯</b>
          <div style={{ marginTop: 6 }}>{result.error}{result.status ? `（HTTP ${result.status}）` : ""}</div>
          {result.errors ? <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", maxHeight: 200, overflow: "auto" }}>{JSON.stringify(result.errors, null, 2)}</pre> : null}
        </div>
      )}
    </div>
  );
}
