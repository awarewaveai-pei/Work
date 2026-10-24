"use client";

import { useRef, useState } from "react";
import ScriptForge from "./ScriptForge";
import VideoStudio from "./VideoStudio";
import FootageEditor from "./FootageEditor";
import ReleaseDeliveryPanel from "./ReleaseDeliveryPanel";
import MediaOperationsPanel from "./MediaOperationsPanel";
import OrganizationPicker from "./OrganizationPicker";
import ModeSelectStep, { type ProductionMode } from "./ModeSelectStep";
import CostGateStep from "./CostGateStep";
import TimelineGateStep from "./TimelineGateStep";
import CaptionsStep from "./CaptionsStep";
import QaStep from "./QaStep";

// ── 2026-09-10 重做：把「重分 tab 組」換成真正的 10 步驟 pipeline ──────────────
// 上一輪只把 VideoStudio 內層 5 個平級 tab 重分成 3 組，仍然是使用者可任意跳點的
// 導覽列，不是操作者畫的 A→B→C→…→L 依序推進、上一步完成才能進下一步的流程。這裡
// 重做成真正的 stepper：currentStep 從 1 走到 9（見下方 STEP 6 附註），每步做完
// 才能繼續，狀態往下傳。VideoTabs.tsx／VideoStudio 3 分組 tab bar 不刪，改標
// 「進階」入口保留給需要繞過流程直接操作單一引擎的人。
//
// 誠實揭露一個沒有假裝解決的現實限制：她的步驟④「生成或選取素材」跟⑥「渲染」在
// 現有三個引擎（Quick Engine ffmpeg／FootageEditor／RemotionStudio）裡都是同一顆按
// 鈕觸發的同一段後端邏輯（VideoStudio 的「生成草稿」本身就包含渲染；FootageEditor
// 的「送實拍渲染」同一畫面）。要真正拆成兩個獨立可分別重試的步驟，需要重寫這三個
// 引擎的 render pipeline 本身，不是重排 UI 能做到的——這裡誠實地把④⑥合併成一個
// stepper 節點，而不是做一個沒有對應真實後端閘的假步驟。

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

interface ScriptPrefill {
  topic: string; articleTitle: string; articleContent: string;
  scenes?: { narration: string; imagePrompt: string; visual?: "custom" | "broll"; brollKeyword?: string; referenceImageUrl?: string }[];
  mediaMode?: string; duration?: number; customScenes?: number;
}
interface RemotionPrefill {
  topic: string; headline?: string; tagline?: string; cta?: string; imageHint?: string;
  scenes?: { visual: string; dialogue: string }[]; mediaMode?: string; duration?: number; customScenes?: number;
}

const STEP_LABELS: { step: Step; label: string }[] = [
  { step: 1, label: "① 建立腳本" },
  { step: 2, label: "② 選擇模式" },
  { step: 3, label: "③ 費用確認" },
  { step: 4, label: "④⑥ 生成／渲染" },
  { step: 5, label: "⑤ Timeline 驗證" },
  { step: 6, label: "⑦ 字幕" },
  { step: 7, label: "⑧ QA" },
  { step: 8, label: "⑨ Release" },
  { step: 9, label: "⑩ 營運" },
];

const barBtn = (state: "done" | "active" | "todo"): React.CSSProperties => ({
  padding: "7px 12px", borderRadius: 999, border: "1px solid " + (state === "active" ? "var(--accent)" : "var(--border-subtle)"),
  background: state === "active" ? "var(--accent)" : state === "done" ? "var(--badge-green-bg)" : "var(--bg-subtle)",
  color: state === "active" ? "var(--btn-primary-text)" : state === "done" ? "var(--badge-green-text)" : "var(--text-muted)",
  fontSize: 12, fontWeight: state === "todo" ? 500 : 700, whiteSpace: "nowrap",
});

export default function VideoPipeline() {
  const [step, setStep] = useState<Step>(1);
  const [maxReached, setMaxReached] = useState<Step>(1);
  const [organizationId, setOrganizationId] = useState("");
  const [mode, setMode] = useState<ProductionMode | null>(null);
  const [scriptPrefill, setScriptPrefill] = useState<ScriptPrefill | undefined>(undefined);
  const [remotionPrefill, setRemotionPrefill] = useState<RemotionPrefill | undefined>(undefined);
  const [footageOrgSeed, setFootageOrgSeed] = useState("");
  const [footageJobId, setFootageJobId] = useState("");
  const [quickRenderDone, setQuickRenderDone] = useState(false);
  const [candidateAssetId, setCandidateAssetId] = useState("");
  const [candidateChecksum, setCandidateChecksum] = useState("");
  const [releaseId, setReleaseId] = useState("");
  const [genKey, setGenKey] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);

  function goto(next: Step) {
    setStep(next);
    setMaxReached((prev) => (next > prev ? next : prev));
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function reset() {
    setStep(1); setMaxReached(1); setMode(null); setScriptPrefill(undefined); setRemotionPrefill(undefined);
    setFootageOrgSeed(organizationId); setFootageJobId(""); setQuickRenderDone(false);
    setCandidateAssetId(""); setCandidateChecksum(""); setReleaseId(""); setGenKey((k) => k + 1);
  }

  return (
    <div ref={topRef} style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      {/* ── Stepper bar ── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "12px 28px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-canvas)", position: "sticky", top: 0, zIndex: 10 }}>
        {STEP_LABELS.map(({ step: s, label }) => (
          <button key={s} type="button" disabled={s > maxReached}
            onClick={() => s <= maxReached && goto(s)}
            style={{ ...barBtn(s === step ? "active" : s < step ? "done" : "todo"), cursor: s <= maxReached ? "pointer" : "not-allowed", border: "1px solid var(--border-subtle)" }}>
            {label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {step > 1 && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>租戶：{organizationId ? organizationId.slice(0, 8) + "…" : "未選"}</span>}
          <a href="?advanced=1" style={{ fontSize: 11, color: "var(--text-secondary)", textDecoration: "underline" }}>進階（跳過流程，直接操作單一引擎）</a>
        </div>
      </div>

      {/* ── Step 1：建立腳本（含短劇 Story Bible 入口）── */}
      {step === 1 && (
        <ScriptForge
          onSendToProduction={(p) => { setScriptPrefill(p); setRemotionPrefill(undefined); if (!mode) setMode("quick_video"); goto(2); }}
          onSendToRemotion={(p) => { setRemotionPrefill(p); setScriptPrefill(undefined); setMode("remotion"); goto(2); }}
        />
      )}

      {/* ── Step 2：選擇製作模式 ── */}
      {step === 2 && (
        <>
          <div style={{ padding: "14px 28px 0" }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8, maxWidth: 420 }}>
              租戶<div style={{ flex: 1 }}><OrganizationPicker value={organizationId} onChange={setOrganizationId} /></div>
            </label>
          </div>
          <ModeSelectStep value={mode} onSelect={(m) => setMode(m)} />
          <div style={{ padding: "0 28px 24px" }}>
            <button type="button" disabled={!mode} onClick={() => goto(3)}
              style={{ padding: "12px 24px", borderRadius: 8, border: "none", background: mode ? "var(--accent)" : "var(--border-subtle)", color: mode ? "var(--btn-primary-text)" : "var(--text-muted)", fontWeight: 700, fontSize: 14, cursor: mode ? "pointer" : "not-allowed" }}>
              下一步 →
            </button>
          </div>
        </>
      )}

      {/* ── Step 3：費用預覽與確認 ── */}
      {step === 3 && mode && <CostGateStep mode={mode} onConfirm={() => goto(4)} />}

      {/* ── Step 4（含⑥渲染）：生成或選取素材 ── */}
      {step === 4 && mode === "footage_edit" && (
        <FootageEditor
          key={genKey}
          initialOrganizationId={organizationId || footageOrgSeed}
          onRenderComplete={(jobId) => { setFootageJobId(jobId); goto(5); }}
        />
      )}
      {step === 4 && (mode === "quick_video" || mode === "short_drama") && (
        <VideoStudio
          key={genKey}
          initial={scriptPrefill}
          embedded={{ lockTab: "generate", organizationId: organizationId || undefined, onRenderComplete: () => { if (!quickRenderDone) { setQuickRenderDone(true); goto(5); } } }}
        />
      )}
      {step === 4 && mode === "remotion" && (
        <VideoStudio key={genKey} remotionInitial={remotionPrefill} embedded={{ lockTab: "remotion", organizationId: organizationId || undefined }} />
      )}
      {step === 4 && mode === "remotion" && (
        <div style={{ padding: "0 28px 24px" }}>
          <button type="button" onClick={() => goto(5)}
            style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-subtle)", color: "var(--text-primary)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            Remotion 渲染已送出，繼續 →
          </button>
        </div>
      )}

      {/* ── Step 5：Timeline 背景驗證 ── */}
      {step === 5 && mode && (
        <TimelineGateStep mode={mode} onPass={() => goto(6)} />
      )}

      {/* ── Step 6：配音與 Whisper 字幕 ── */}
      {step === 6 && <CaptionsStep organizationId={organizationId} onContinue={() => goto(7)} />}

      {/* ── Step 7：技術 QA + 編輯 QA ── */}
      {step === 7 && (
        <QaStep organizationId={organizationId} onContinue={(assetId, checksum) => { setCandidateAssetId(assetId); setCandidateChecksum(checksum); goto(8); }} />
      )}

      {/* ── Step 8：Release 交付到網站與社群 ── */}
      {step === 8 && (
        <ReleaseDeliveryPanel
          initialOrganizationId={organizationId}
          initialCandidateAssetId={candidateAssetId}
          onReleaseCreated={(id) => { setReleaseId(id); }}
        />
      )}
      {step === 8 && (
        <div style={{ padding: "0 28px 24px" }}>
          <button type="button" onClick={() => goto(9)}
            style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-subtle)", color: "var(--text-primary)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            {releaseId ? "Release 完成，查看營運成效 →" : "略過（先看營運頁）→"}
          </button>
        </div>
      )}

      {/* ── Step 9：營運成效 + 歷史/成本 ── */}
      {step === 9 && (
        <>
          <MediaOperationsPanel />
          <div style={{ padding: "0 28px 24px" }}>
            <button type="button" onClick={reset}
              style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--accent)", color: "var(--btn-primary-text)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              ＋ 開始新影片
            </button>
          </div>
        </>
      )}
    </div>
  );
}
