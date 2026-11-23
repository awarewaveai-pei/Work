"use client";

// The site-flow page body (SITE-FLOW-COMPLETION-PLAN.md §2, cards SF-J, SF-H): nine steps, one column, every state read
// from GET /api/ops/site-flow/[siteId] (I1: nothing is stored here). A step that touches the host is two presses:
// preview (POST plan) then confirm (POST execute with the plan hash and the same step input). A running step is
// followed with POST {action:"poll"}, one poll at a time (the next starts after the previous answered).
// 第 4 步 (backup) and 第 8 步 (hand-done items) are panels of the same answer; ticks go to .../manual-checks.
// The one-time admin password lives in React state only: never in a browser store, gone on reload.
import { useCallback, useEffect, useRef, useState } from "react";
import { Tag } from "@/app/(shell)/ops/clients/[slug]/hub-ui";
import { FLOW_STEPS, doneCount, tickText, viewOf, type ApiPanels, type ApiStep, type LoadState, type StepView } from "@/lib/site-flow/page-model";

interface FlowData {
  site: { id: string; name: string };
  environment: { environment_type: string; base_url: string | null };
  steps: ApiStep[];
  panels?: ApiPanels;
}
interface PlanShown { summary: string; items: Array<{ label: string; value: string }>; rollback: string }
interface Preview { plan: PlanShown; planHash: string; input: Json }
interface Note { tone: "ok" | "err" | "info"; text: string }

type Json = Record<string, unknown>;

const POLL_MS = 5000;
const ORACLE_PLUGIN = "aware-wave-oracle"; // = lib/site-flow/steps/wp-install.ts ORACLE_PLUGIN

async function post(url: string, body: Json): Promise<{ status: number; body: Json }> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: ((await r.json().catch(() => ({}))) as Json) ?? {} };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** One sentence for a refused or failed answer of the step route. */
function failureText(b: Json): string {
  const stages = Array.isArray(b.stages) ? (b.stages as Array<{ ok?: boolean; stage?: string; detail?: string }>) : [];
  const bad = stages.find((s) => s.ok === false && s.stage !== "rollback");
  const rolled = stages.find((s) => s.stage === "rollback");
  const base = str(b.detail) || (bad?.detail ?? "") || str(b.reason) || str(b.error) || "沒有成功";
  return rolled ? `${base}（${rolled.ok ? "已自動還原" : "還原沒有成功，請人工處理"}：${rolled.detail ?? ""}）` : base;
}

const TONE_OF: Record<StepView["tone"], "green" | "red" | "gray" | "yellow" | "accent"> = { green: "green", red: "red", gray: "gray", yellow: "yellow", accent: "accent" };

/** The WordPress step's input: admin email (required) and the opt-in own plugins. */
function WpInputs({ value, onChange, disabled }: { value: Json; onChange: (v: Json) => void; disabled: boolean }) {
  const oracle = Array.isArray(value.optional_plugins) && (value.optional_plugins as string[]).includes(ORACLE_PLUGIN);
  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ color: "var(--text-secondary)" }}>管理員 email（也是登入帳號，60 字以內）</span>
        <input className="form-input" type="email" maxLength={60} disabled={disabled} value={str(value.admin_email)} onChange={(e) => onChange({ ...value, admin_email: e.target.value })} />
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--text-secondary)" }}>
        <input type="checkbox" disabled={disabled} checked={oracle} onChange={(e) => onChange({ ...value, optional_plugins: e.target.checked ? [ORACLE_PLUGIN] : [], ...(e.target.checked ? {} : { oracle_server_url: "" }) })} />
        同時安裝 AwareWave 命理外掛
      </label>
      {oracle && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "var(--text-secondary)" }}>命理外掛的「引擎網址（伺服器用）」：這個 WordPress 從主機內部呼叫引擎的網址</span>
          <input className="form-input" type="url" maxLength={268} placeholder="http://oracle-web:3000（小寫、可帶埠、不帶路徑）" disabled={disabled} value={str(value.oracle_server_url)} onChange={(e) => onChange({ ...value, oracle_server_url: e.target.value })} />
        </label>
      )}
    </div>
  );
}

export function SiteFlow({ siteId }: { siteId: string }) {
  const [data, setData] = useState<FlowData | null>(null);
  const [load, setLoad] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview | undefined>>({});
  const [inputs, setInputs] = useState<Record<string, Json>>({});
  const [notes, setNotes] = useState<Record<string, Note | undefined>>({});
  const [reveals, setReveals] = useState<Record<string, Json | undefined>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [tickNotes, setTickNotes] = useState<Record<string, string>>({});
  const dataRef = useRef<FlowData | null>(null);

  const stepUrl = (key: string) => `/api/ops/site-flow/${siteId}/${key}`;

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/ops/site-flow/${siteId}`);
      const j = (await r.json().catch(() => ({}))) as Json;
      if (!r.ok || j.ok !== true) {
        setLoadError(r.status === 404 ? "找不到這個網站的正式環境。" : `讀取失敗（${str(j.error) || `http_${r.status}`}）`);
        if (!dataRef.current) setLoad("failed");
        return;
      }
      dataRef.current = j as unknown as FlowData;
      setData(j as unknown as FlowData);
      setLoad("loaded");
      setLoadError(null);
    } catch {
      setLoadError("連不上伺服器。");
      if (!dataRef.current) setLoad("failed");
    }
  }, [siteId]);

  useEffect(() => { void reload(); }, [reload]);

  // Follow running steps. A poll can verify and roll back on the host, so it is a POST; the next round starts only
  // after this one answered (a slow host never stacks polls).
  const anyRunning = !!data?.steps.some((s) => s.state === "running");
  useEffect(() => {
    if (!anyRunning) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const round = async () => {
      const running = (dataRef.current?.steps ?? []).filter((s) => s.state === "running" && s.lastRun?.id);
      for (const s of running) {
        if (stopped) return;
        try {
          await post(stepUrl(s.key), { action: "poll", runId: s.lastRun!.id });
        } catch { /* next round */ }
      }
      if (stopped) return;
      await reload();
      if (!stopped) timer = setTimeout(round, POLL_MS);
    };
    timer = setTimeout(round, POLL_MS);
    return () => { stopped = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyRunning, siteId, reload]);

  const setNote = (key: string, n: Note | undefined) => setNotes((cur) => ({ ...cur, [key]: n }));

  async function openPlan(key: string, input: Json) {
    setBusy(key);
    setNote(key, undefined);
    try {
      const r = await post(stepUrl(key), { action: "plan", input });
      if (r.status === 200 && r.body.ok === true) {
        setPreviews((cur) => ({ ...cur, [key]: { plan: r.body.plan as PlanShown, planHash: str(r.body.planHash), input } }));
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
      const r = await post(stepUrl(key), { action: "execute", planHash: pv.planHash, input: pv.input });
      const b = r.body;
      if (b.reveal && typeof b.reveal === "object") setReveals((cur) => ({ ...cur, [key]: b.reveal as Json }));
      if (r.status === 409 && b.error === "plan_changed" && b.plan) {
        setPreviews((cur) => ({ ...cur, [key]: { plan: b.plan as PlanShown, planHash: str(b.planHash), input: pv.input } }));
        setNote(key, { tone: "info", text: "計畫已變更，請重新看過再確認。" });
        return;
      }
      setPreviews((cur) => ({ ...cur, [key]: undefined }));
      const stages = Array.isArray(b.stages) ? (b.stages as Array<{ detail?: string }>) : [];
      if (r.status === 202) setNote(key, { tone: "info", text: stages[stages.length - 1]?.detail || "主機正在做，這一頁會自動更新進度。" });
      else if (b.ok === true) setNote(key, { tone: "ok", text: "完成。" });
      else setNote(key, { tone: "err", text: failureText(b) });
    } catch {
      setNote(key, { tone: "err", text: "結果不明：請看這一步現在的狀態。如果是安裝步驟而沒看到管理員密碼，請按「重設管理員密碼」。" });
    } finally {
      setBusy(null);
      await reload();
    }
  }

  async function tick(key: string, checked: boolean, busyKey: string) {
    setBusy(busyKey);
    setNote(busyKey, undefined);
    try {
      const r = await post(`/api/ops/site-flow/${siteId}/manual-checks`, { key, checked, note: tickNotes[key] ?? "" });
      if (r.body.ok !== true) setNote(busyKey, { tone: "err", text: r.body.error === "conflict" ? "剛好有別人也在改，請再按一次。" : str(r.body.error) || `http_${r.status}` });
    } catch {
      setNote(busyKey, { tone: "err", text: "連不上伺服器，請再按一次。" });
    } finally {
      setBusy(null);
      await reload();
    }
  }

  const views: StepView[] = FLOW_STEPS.map((def) =>
    viewOf(def, def.engineKey ? data?.steps.find((s) => s.key === def.engineKey) ?? null : null, { load, anyRunning, panels: data?.panels ?? null }),
  );
  const shownSteps = FLOW_STEPS.length;

  return (
    <>
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>建站流程{data ? `：${data.site.name}` : ""}</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-base)", margin: "0 0 20px" }}>
        {data ? `${data.environment.base_url ?? "尚未設定網址"} · 已完成 ${doneCount(views)} / ${shownSteps} 步` : load === "loading" ? "讀取中…" : "讀取失敗"}
        {" "}每一步的狀態都是即時從主機讀來的。
      </p>
      {loadError && <p role="alert" style={{ color: "var(--badge-red-text)", background: "var(--badge-red-bg)", padding: "8px 10px", borderRadius: 8, fontSize: 13 }}>{loadError}</p>}
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {views.map((v) => {
          const key = v.def.engineKey;
          const api = key ? data?.steps.find((s) => s.key === key) ?? null : null;
          const preview = key ? previews[key] : undefined;
          const rawNote = notes[key ?? `n${v.def.no}`];
          // "the host is working" is stale once the step reads 完成
          const note = rawNote?.tone === "info" && v.stateLabel === "完成" ? undefined : rawNote;
          const reveal = key ? reveals[key] : undefined;
          const isBusy = busy !== null && busy === (key ?? `n${v.def.no}`);
          const otherBusy = busy !== null && !isBusy;
          const wpInput = inputs.wp_install ?? {};
          const canPlan = v.action?.kind === "plan" && !v.action.disabled;
          const showReset = key === "wp_install" && api && !anyRunning && (api.state === "done" || api.state === "failed");
          return (
            <li key={v.def.no} data-step={key ?? `n${v.def.no}`} style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>第 {v.def.no} 步　{v.def.title}</span>
                <Tag tone={TONE_OF[v.tone]} dot>{v.stateLabel}</Tag>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{v.def.what}</p>
              {v.reason && <p style={{ margin: "6px 0 0", fontSize: 12, color: v.tone === "red" ? "var(--badge-red-text)" : "var(--text-muted)" }}>{v.reason}</p>}

              {v.def.panel === "manual_checks" && load === "loaded" && (
                <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {(data?.panels?.manual_checks ?? []).map((m) => (
                    <li key={m.key} data-check={m.key} style={{ fontSize: 13 }}>
                      <label style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "var(--text-primary)" }}>
                        <input type="checkbox" checked={!!m.tick} disabled={busy !== null} onChange={(e) => void tick(m.key, e.target.checked, `n${v.def.no}`)} />
                        <span>{m.label}<span style={{ color: "var(--text-muted)" }}>（{m.where}）</span></span>
                      </label>
                      {m.tick ? (
                        <p style={{ margin: "2px 0 0 22px", fontSize: 12, color: "var(--text-muted)" }}>您手動確認：{tickText(m.tick)}</p>
                      ) : (
                        <input className="form-input" placeholder="備註（選填，勾選時一起存）" maxLength={200} value={tickNotes[m.key] ?? ""} onChange={(e) => setTickNotes((c) => ({ ...c, [m.key]: e.target.value }))} style={{ margin: "4px 0 0 22px", width: "calc(100% - 22px)" }} />
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {key && api?.manual && v.action?.kind === "tick" && (
                <label style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "var(--text-primary)" }}>
                  <input type="checkbox" checked={api.state === "done"} disabled={busy !== null || api.state === "running"} onChange={(e) => void tick(api.manual!.key, e.target.checked, key)} />
                  {api.manual.label}（您手動確認）
                </label>
              )}

              {key === "wp_install" && canPlan && !preview && <WpInputs value={wpInput} disabled={busy !== null} onChange={(nv) => setInputs((c) => ({ ...c, wp_install: nv }))} />}

              {v.action && key && v.action.kind !== "tick" && (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={v.action.disabled || isBusy || otherBusy}
                    onClick={() => (v.action!.kind === "plan" ? void openPlan(key, key === "wp_install" ? { ...wpInput, mode: "install" } : {}) : void reload())}
                  >
                    {isBusy ? "處理中…" : v.action.label}
                  </button>
                </div>
              )}
              {showReset && !preview && (
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-ghost" disabled={busy !== null || !api?.enabled} onClick={() => void openPlan("wp_install", { mode: "reset_password" })}>重設管理員密碼</button>
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
                    <button type="button" className="btn-primary" disabled={isBusy || otherBusy || anyRunning} onClick={() => void confirm(key)}>{isBusy ? "執行中…" : "確認執行"}</button>
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
