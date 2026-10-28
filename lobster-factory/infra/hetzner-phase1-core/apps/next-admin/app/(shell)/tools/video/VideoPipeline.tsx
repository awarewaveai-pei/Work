"use client";

import { useEffect, useRef, useState } from "react";
import VideoStudio from "./VideoStudio";
import FootageEditor from "./FootageEditor";
import ReleaseDeliveryPanel from "./ReleaseDeliveryPanel";
import OrganizationPicker from "./OrganizationPicker";
import ModeSelectStep, { type ProductionMode } from "./ModeSelectStep";
import CostGateStep from "./CostGateStep";
import CaptionsStep from "./CaptionsStep";
import QaStep from "./QaStep";
import { handoffFromScript, type VideoHandoff } from "./video-handoff";

// 影片專案 stepper（VIDEO_TOOL_REDESIGN_2026-10-26.md D1/D5、V1.4）：5 步；客戶、腳本、模式、做到哪一步都存在
// 專案列（/tools/video?project=<id>），重整或關頁後回來接著做。客戶只在建專案時選一次。
// Remotion 還不是 DB 的 production_mode（0071 check；D9 在 V3.4 改成加購片頭卡），在那之前記在 brief.engine。

type Step = 1 | 2 | 3 | 4 | 5;
type Brief = VideoHandoff & { engine?: "remotion" };
interface Project {
  id: string; organization_id: string; title: string;
  production_mode: "quick_video" | "short_drama" | "footage_edit";
  lifecycle_stage: string; brief_json: Brief;
}

const STEP_LABELS: { step: Step; label: string }[] = [
  { step: 1, label: "① 腳本" },
  { step: 2, label: "② 設定與費用" },
  { step: 3, label: "③ 生成與修圖" },
  { step: 4, label: "④ 審片" },
  { step: 5, label: "⑤ 發布" },
];
const STAGE_OF: Record<Step, string> = { 1: "create", 2: "create", 3: "produce", 4: "review", 5: "release" };

function stepOf(p: Project): Step {
  if (p.lifecycle_stage === "produce") return 3;
  if (p.lifecycle_stage === "review") return 4;
  if (p.lifecycle_stage === "release" || p.lifecycle_stage === "measure") return 5;
  return p.brief_json?.production || p.brief_json?.remotion ? 2 : 1;
}
const modeOf = (p: Project): ProductionMode => (p.brief_json?.engine === "remotion" ? "remotion" : p.production_mode);

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14 };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--card-bg)", color: "var(--text-primary)", fontSize: 13 };
const primary = (on: boolean): React.CSSProperties => ({ padding: "12px 24px", borderRadius: 8, border: "none", background: on ? "var(--accent)" : "var(--border-subtle)", color: on ? "var(--btn-primary-text)" : "var(--text-muted)", fontWeight: 700, fontSize: 14, cursor: on ? "pointer" : "not-allowed" });
const barBtn = (state: "done" | "active" | "todo"): React.CSSProperties => ({
  padding: "7px 12px", borderRadius: 999, border: "1px solid " + (state === "active" ? "var(--accent)" : "var(--border-subtle)"),
  background: state === "active" ? "var(--accent)" : state === "done" ? "var(--badge-green-bg)" : "var(--bg-subtle)",
  color: state === "active" ? "var(--btn-primary-text)" : state === "done" ? "var(--badge-green-text)" : "var(--text-muted)",
  fontSize: 12, fontWeight: state === "todo" ? 500 : 700, whiteSpace: "nowrap",
});

async function api(method: "GET" | "POST" | "PATCH", body?: object, id?: string): Promise<{ item?: Project; error?: string }> {
  const res = await fetch(`/api/video/projects${id ? `?id=${id}` : ""}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json().catch(() => ({})) as { item?: Project; error?: string };
  return res.ok ? json : { error: json.error ?? `HTTP ${res.status}` };
}

/** sf_history (ScriptForge, browser-local per AUTO_CONTENT D2): pick a saved script as this project's script. */
function readHistory(): { id: number; title?: string; ts?: string; script?: unknown }[] {
  try { return JSON.parse(localStorage.getItem("sf_history") || "[]"); } catch { return []; }
}

export default function VideoPipeline() {
  const [project, setProject] = useState<Project | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [loadError, setLoadError] = useState("");
  const [review, setReview] = useState<"captions" | "qa">("captions");
  const [candidateAssetId, setCandidateAssetId] = useState("");
  const [renderDone, setRenderDone] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("project");
    if (!id) return;
    void api("GET", undefined, id).then((r) => {
      if (r.item) { setProject(r.item); setStep(stepOf(r.item)); } else setLoadError(r.error ?? "讀不到專案");
    });
  }, []);

  async function patch(fields: Record<string, unknown>) {
    if (!project) return;
    const r = await api("PATCH", { id: project.id, ...fields });
    if (r.item) setProject(r.item); else setLoadError(r.error ?? "存檔失敗");
  }
  function goto(next: Step) {
    setStep(next);
    if (project && STAGE_OF[next] !== project.lifecycle_stage) void patch({ lifecycleStage: STAGE_OF[next] });
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  const maxStep: Step = project ? Math.max(step, stepOf(project)) as Step : 1;

  if (!project) return <NewProject loadError={loadError} onCreated={(p) => { window.history.replaceState(null, "", `?project=${p.id}`); setProject(p); setStep(1); }} />;

  const brief = project.brief_json ?? { title: project.title };
  const mode = modeOf(project);
  const org = project.organization_id;
  return (
    <div ref={topRef} style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "12px 28px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-canvas)", position: "sticky", top: 0, zIndex: 10 }}>
        {STEP_LABELS.map(({ step: s, label }) => (
          <button key={s} type="button" disabled={s > maxStep} onClick={() => goto(s)}
            style={{ ...barBtn(s === step ? "active" : s < step ? "done" : "todo"), cursor: s <= maxStep ? "pointer" : "not-allowed" }}>{label}</button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
          <span>{project.title}</span>
          <a href="/tools/video" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>＋ 新影片</a>
          <a href="?advanced=1" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>進階</a>
        </div>
      </div>
      {loadError && <div style={{ padding: "8px 28px", color: "var(--red)", fontSize: 12 }}>{loadError}</div>}

      {step === 1 && <ScriptStep brief={brief} onPick={(h) => void patch({ brief: { ...h, engine: brief.engine } })} onNext={() => goto(2)} />}

      {step === 2 && (
        <>
          <ModeSelectStep value={mode} onSelect={(m) => void patch(m === "remotion"
            ? { brief: { ...brief, engine: "remotion" } }
            : { productionMode: m, brief: { ...brief, engine: undefined } })} />
          <CostGateStep mode={mode} onConfirm={() => goto(3)} />
        </>
      )}

      {step === 3 && mode === "footage_edit" && (
        <>
          <FootageEditor initialOrganizationId={org} projectId={project.id} onRenderComplete={() => setRenderDone(true)} />
          {renderDone && <RenderedBar projectId={project.id} note="實拍渲染已送出，完成後在專案頁看得到。" onNext={() => goto(4)} />}
        </>
      )}
      {step === 3 && (mode === "quick_video" || mode === "short_drama") && (
        <VideoStudio initial={brief.production}
          embedded={{ lockTab: "generate", organizationId: org, projectId: project.id, onRenderComplete: () => setRenderDone(true) }} />
      )}
      {step === 3 && (mode === "quick_video" || mode === "short_drama") && renderDone && (
        <RenderedBar projectId={project.id} note="成片完成，就在上面。" onNext={() => goto(4)} />
      )}
      {step === 3 && mode === "remotion" && (
        <>
          <VideoStudio remotionInitial={brief.remotion} embedded={{ lockTab: "remotion", organizationId: org, projectId: project.id }} />
          <div style={{ padding: "0 28px 24px" }}><button type="button" onClick={() => goto(4)} style={primary(true)}>Remotion 渲染已送出，繼續 →</button></div>
        </>
      )}

      {step === 4 && review === "captions" && <CaptionsStep organizationId={org} onContinue={() => setReview("qa")} />}
      {step === 4 && review === "qa" && <QaStep organizationId={org} onContinue={(assetId) => { setCandidateAssetId(assetId); goto(5); }} />}

      {step === 5 && (
        <ReleaseDeliveryPanel organizationLocked initialOrganizationId={org} initialCandidateAssetId={candidateAssetId}
          onReleaseCreated={() => void patch({ lifecycleStage: "measure" })} />
      )}
    </div>
  );
}

/** After a render: stay on the result (V2.3); the next step is the operator's click, the project page always has the video. */
function RenderedBar({ projectId, note, onNext }: { projectId: string; note: string; onNext: () => void }) {
  return (
    <div style={{ padding: "0 28px 24px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color: "var(--text-primary)" }}>✅ {note}</span>
      <a href={`/tools/video/projects/${projectId}`} style={{ fontSize: 13, color: "var(--text-secondary)" }}>在專案頁看成片</a>
      <button type="button" onClick={onNext} style={primary(true)}>下一步：審片 →</button>
    </div>
  );
}

function NewProject({ loadError, onCreated }: { loadError: string; onCreated: (p: Project) => void }) {
  const [org, setOrg] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(loadError);
  const ready = !!org && !!title.trim() && !busy;
  async function create() {
    setBusy(true); setError("");
    const r = await api("POST", { organizationId: org, title: title.trim(), productionMode: "quick_video" });
    setBusy(false);
    if (r.item) onCreated(r.item); else setError(r.error ?? "建立失敗");
  }
  return (
    <div style={{ padding: "24px 28px", display: "grid", gap: 14, maxWidth: 520 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>新影片</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>客戶只在這裡選一次；之後每一步都用這個客戶。也可以先在 <a href="/tools/script-forge" style={{ color: "var(--text-secondary)" }}>腳本工具</a> 寫好腳本，按「送去做影片」直接建專案。</div>
      <div style={card}><label style={{ fontSize: 12, color: "var(--text-secondary)" }}>客戶<div style={{ marginTop: 5 }}><OrganizationPicker value={org} onChange={setOrg} /></div></label></div>
      <div style={card}><label htmlFor="vp-title" style={{ fontSize: 12, color: "var(--text-secondary)" }}>影片標題</label><input id="vp-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} style={{ ...field, marginTop: 5 }} /></div>
      {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
      <button type="button" disabled={!ready} onClick={() => void create()} style={primary(ready)}>{busy ? "建立中…" : "建立專案 →"}</button>
    </div>
  );
}

function ScriptStep({ brief, onPick, onNext }: { brief: Brief; onPick: (h: VideoHandoff) => void; onNext: () => void }) {
  const [history, setHistory] = useState<ReturnType<typeof readHistory>>([]);
  useEffect(() => setHistory(readHistory().filter((h) => h.script)), []);
  const has = !!(brief.production || brief.remotion);
  const sceneCount = brief.production?.scenes?.length ?? brief.remotion?.scenes?.length ?? 0;
  return (
    <div style={{ padding: "24px 28px", display: "grid", gap: 14, maxWidth: 640 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>① 腳本</div>
      {has
        ? <div style={card}><div style={{ fontSize: 13, fontWeight: 700 }}>{brief.title || "（未命名）"}</div><div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{sceneCount} 場</div></div>
        : <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>這個專案還沒有腳本。從下面挑一份，或到 <a href="/tools/script-forge" style={{ color: "var(--text-secondary)" }}>腳本工具</a> 寫一份再按「送去做影片」。</div>}
      {history.length > 0 && (
        <details style={card} open={!has}>
          <summary style={{ fontSize: 12, cursor: "pointer" }}>{has ? "改用腳本歷史裡的另一份" : "從腳本歷史挑一份"}（只存在這台電腦的瀏覽器）</summary>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {history.slice(0, 20).map((h) => (
              <button key={h.id} type="button" onClick={() => onPick(handoffFromScript(h.script, { customScenes: 3 }))}
                style={{ ...field, textAlign: "left", cursor: "pointer" }}>{h.title || "（未命名）"} <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{h.ts}</span></button>
            ))}
          </div>
        </details>
      )}
      <button type="button" disabled={!has} onClick={onNext} style={primary(has)}>下一步 →</button>
    </div>
  );
}
