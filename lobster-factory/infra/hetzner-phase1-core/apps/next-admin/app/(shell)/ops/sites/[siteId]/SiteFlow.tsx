"use client";

// The site-flow page body (SITE-FLOW-COMPLETION-PLAN.md §2, card SF-J): nine steps, one column, every state read from
// GET /api/ops/site-flow/[siteId] (I1: nothing is stored here). A step that touches the host is two presses:
// preview (POST plan) then confirm (POST execute with the plan hash). A background host job is followed with
// POST {action:"poll"}. The one-time admin password lives in React state only: never in a browser store, gone on reload.
import { useCallback, useEffect, useRef, useState } from "react";
import { Tag } from "@/app/(shell)/ops/clients/[slug]/hub-ui";
import { FLOW_STEPS, doneCount, viewOf, type ApiStep, type StepView } from "@/lib/site-flow/page-model";

interface FlowData {
  site: { id: string; name: string };
  environment: { environment_type: string; base_url: string | null };
  steps: ApiStep[];
}
interface PlanShown { summary: string; items: Array<{ label: string; value: string }>; rollback: string }
interface Preview { plan: PlanShown; planHash: string }
interface Note { tone: "ok" | "err" | "info"; text: string }

type Json = Record<string, unknown>;

async function post(siteId: string, step: string, body: Json): Promise<{ status: number; body: Json }> {
  const r = await fetch(`/api/ops/site-flow/${siteId}/${step}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: ((await r.json().catch(() => ({}))) as Json) ?? {} };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** One sentence for a refused or failed answer of the step route. */
function failureText(b: Json): string {
  const stages = Array.isArray(b.stages) ? (b.stages as Array<{ ok?: boolean; stage?: string; detail?: string }>) : [];
  const bad = stages.find((s) => s.ok === false && s.stage !== "rollback");
  const rolled = stages.find((s) => s.stage === "rollback");
  const base = str(b.detail) || (bad?.detail ?? "") || str(b.reason) || str(b.error) || "沒有成功";
  return rolled ? `${base}（已${rolled.ok ? "自動還原" : "嘗試還原但沒成功，請人工處理"}）` : base;
}

const TONE_OF: Record<StepView["tone"], "green" | "red" | "gray" | "yellow" | "accent"> = { green: "green", red: "red", gray: "gray", yellow: "yellow", accent: "accent" };

export function SiteFlow({ siteId }: { siteId: string }) {
  const [data, setData] = useState<FlowData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview | undefined>>({});
  const [notes, setNotes] = useState<Record<string, Note | undefined>>({});
  const [reveals, setReveals] = useState<Record<string, Json | undefined>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const dataRef = useRef<FlowData | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/ops/site-flow/${siteId}`);
      const j = (await r.json().catch(() => ({}))) as Json;
      if (!r.ok || j.ok !== true) {
        setLoadError(r.status === 404 ? "找不到這個網站的正式環境。" : `讀取失敗（${str(j.error) || `http_${r.status}`}）`);
        return;
      }
      dataRef.current = j as unknown as FlowData;
      setData(j as unknown as FlowData);
      setLoadError(null);
    } catch {
      setLoadError("連不上伺服器。");
    }
  }, [siteId]);

  useEffect(() => { void load(); }, [load]);

  // Follow background host jobs: a poll finishes (verifies, rolls back) the run, so it is a POST, then re-read.
  const anyRunning = !!data?.steps.some((s) => s.state === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(async () => {
      const running = (dataRef.current?.steps ?? []).filter((s) => s.state === "running" && s.lastRun?.id);
      await Promise.all(running.map((s) => post(siteId, s.key, { action: "poll", runId: s.lastRun!.id })));
      await load();
    }, 5000);
    return () => clearInterval(t);
  }, [anyRunning, siteId, load]);

  const setNote = (key: string, n: Note | undefined) => setNotes((cur) => ({ ...cur, [key]: n }));

  async function openPlan(key: string) {
    setBusy(key);
    setNote(key, undefined);
    try {
      const r = await post(siteId, key, { action: "plan" });
      if (r.status === 200 && r.body.ok === true) {
        setPreviews((cur) => ({ ...cur, [key]: { plan: r.body.plan as PlanShown, planHash: str(r.body.planHash) } }));
      } else {
        setNote(key, { tone: "err", text: str(r.body.detail) || str(r.body.error) || `http_${r.status}` });
      }
    } catch {
      setNote(key, { tone: "err", text: "連不上伺服器，請再按一次。" });
    } finally {
      setBusy(null);
    }
  }

  async function confirm(key: string) {
    const pv = previews[key];
    if (!pv) return;
    setBusy(key);
    setNote(key, undefined);
    try {
      const r = await post(siteId, key, { action: "execute", planHash: pv.planHash });
      const b = r.body;
      if (b.reveal && typeof b.reveal === "object") setReveals((cur) => ({ ...cur, [key]: b.reveal as Json }));
      if (r.status === 409 && b.error === "plan_changed" && b.plan) {
        setPreviews((cur) => ({ ...cur, [key]: { plan: b.plan as PlanShown, planHash: str(b.planHash) } }));
        setNote(key, { tone: "info", text: "計畫已變更，請重新看過再確認。" });
        return;
      }
      setPreviews((cur) => ({ ...cur, [key]: undefined }));
      if (r.status === 202) setNote(key, { tone: "info", text: "主機正在做，這一頁會自動更新進度。" });
      else if (b.ok === true) setNote(key, { tone: "ok", text: "完成。" });
      else setNote(key, { tone: "err", text: failureText(b) });
    } catch {
      setNote(key, { tone: "err", text: "結果不明：請看這一步現在的狀態。如果是安裝步驟而沒看到管理員密碼，請重設管理員密碼。" });
    } finally {
      setBusy(null);
      await load();
    }
  }

  const views: StepView[] = FLOW_STEPS.map((def) => viewOf(def, def.engineKey ? data?.steps.find((s) => s.key === def.engineKey) ?? null : null));

  return (
    <>
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>建站流程{data ? `：${data.site.name}` : ""}</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-base)", margin: "0 0 20px" }}>
        {data ? `${data.environment.base_url ?? "尚未設定網址"} · 已完成 ${doneCount(views)} / ${FLOW_STEPS.filter((d) => d.engineKey).length} 步（有提供的步驟）` : "讀取中…"}
        {" "}每一步的狀態都是即時從主機讀來的。
      </p>
      {loadError && <p role="alert" style={{ color: "var(--badge-red-text)", background: "var(--badge-red-bg)", padding: "8px 10px", borderRadius: 8, fontSize: 13 }}>{loadError}</p>}
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {views.map((v) => {
          const key = v.def.engineKey;
          const preview = key ? previews[key] : undefined;
          const rawNote = key ? notes[key] : undefined;
          // "the host is working" is stale once the step reads 完成
          const note = rawNote?.tone === "info" && v.stateLabel === "完成" ? undefined : rawNote;
          const reveal = key ? reveals[key] : undefined;
          const isBusy = !!key && busy === key;
          return (
            <li key={v.def.no} data-step={key ?? `n${v.def.no}`} style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>第 {v.def.no} 步　{v.def.title}</span>
                <Tag tone={TONE_OF[v.tone]} dot>{v.stateLabel}</Tag>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{v.def.what}</p>
              {v.reason && <p style={{ margin: "6px 0 0", fontSize: 12, color: v.tone === "red" ? "var(--badge-red-text)" : "var(--text-muted)" }}>{v.reason}</p>}
              {v.action && key && (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={v.action.disabled || isBusy}
                    onClick={() => (v.action!.kind === "plan" ? void openPlan(key) : void load())}
                  >
                    {isBusy ? "處理中…" : v.action.label}
                  </button>
                </div>
              )}
              {preview && key && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--card-border)", paddingTop: 12 }}>
                  <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{preview.plan.summary}</p>
                  <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 12px", fontSize: 12 }}>
                    {preview.plan.items.map((it) => (
                      <div key={it.label} style={{ display: "contents" }}>
                        <dt style={{ color: "var(--text-muted)" }}>{it.label}</dt>
                        <dd style={{ margin: 0, color: "var(--text-primary)", overflowWrap: "anywhere" }}>{it.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)" }}>出錯時：{preview.plan.rollback}</p>
                  <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                    <button type="button" className="btn-primary" disabled={isBusy} onClick={() => void confirm(key)}>{isBusy ? "執行中…" : "確認執行"}</button>
                    <button type="button" className="btn btn-ghost" disabled={isBusy} onClick={() => setPreviews((cur) => ({ ...cur, [key]: undefined }))}>取消</button>
                  </div>
                </div>
              )}
              {note && (
                <p role={note.tone === "err" ? "alert" : "status"} style={{ margin: "10px 0 0", fontSize: 13, color: note.tone === "err" ? "var(--badge-red-text)" : note.tone === "ok" ? "var(--badge-green-text)" : "var(--text-secondary)" }}>{note.text}</p>
              )}
              {reveal && (
                <div role="status" style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "var(--badge-yellow-bg)", color: "var(--badge-yellow-text)", fontSize: 13 }}>
                  <p style={{ margin: "0 0 6px", fontWeight: 600 }}>這些只顯示這一次，請現在複製；重新整理後就看不到了。</p>
                  {Object.entries(reveal).map(([k, val]) => (
                    <div key={k}>{k}：<code style={{ userSelect: "all" }}>{String(val)}</code></div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
