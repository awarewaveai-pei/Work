"use client";
import Transitions from "@/public/editor-shared/transitions.js";
import { useEffect, useRef, useState } from "react";
import { buttonStyle, inputStyle, optionStyle } from "@/components/tools/panel-primitives";
import { shotsFromScript } from "../../../(shell)/tools/video/video-handoff";
import type { AutoDraftRequest, AutoScriptBudget } from "../../../(shell)/tools/video/ScriptForge";
import type { Workbench } from "../workbench";
import { defaultDraftChoices, requestDraftQuote, type DraftQuote } from "./draft-quote";
import { maxText, typicalText } from "@/lib/script-forge/one-click";

// Per viewer: {organization + script plan -> runId} of a run not yet handed to the workbench (last 20). The server run is
// the truth; this only lets a reopened dialog send the same runId, whose paid script and score come back from the server cache.
const RUNS = "video.one-click.unfinished-runs";
function readRuns(): Record<string, unknown> { try { const m = JSON.parse(localStorage.getItem(RUNS) || "{}"); return m && typeof m === "object" ? m : {}; } catch { return {}; } }
function rememberRun(key: string, runId: string | null) {
  try { const m = readRuns(); delete m[key]; if (runId) m[key] = runId; localStorage.setItem(RUNS, JSON.stringify(Object.fromEntries(Object.entries(m).slice(-20)))); } catch { /* storage unavailable: resuming is then not offered */ }
}

export default function OneClickDraftDialog({ request, workbench, close }: { request: AutoDraftRequest; workbench: Workbench; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), budgetEdited = useRef(false), runBudget = useRef<AutoScriptBudget | null>(null),
    [ratios, setRatios] = useState(() => defaultDraftChoices(request).ratios),
    [fill, setFill] = useState(() => defaultDraftChoices(request).fill), [tts, setTts] = useState<{ provider: string; voice: string } | null>(null),
    [quote, setQuote] = useState<DraftQuote | null>(null), [budget, setBudget] = useState<number | null>(null),
    [embed, setEmbed] = useState(false), [siteId, setSiteId] = useState(""),
    [intro, setIntro] = useState("title"), [transition, setTransition] = useState<string>(Transitions.AUTO.id),
    [caps, setCaps] = useState<Awaited<ReturnType<Workbench["loadCapabilities"]>> | null>(null),
    [busy, setBusy] = useState(false), [error, setError] = useState(""), [unfinished, setUnfinished] = useState<string | null>(null);
  useEffect(() => { const d = dialog.current; if (d?.showModal) d.showModal(); else d?.setAttribute("open", ""); void workbench.loadCapabilities().then(setCaps); }, [workbench]);
  const org = caps?.mainSystem?.organizationId, runKey = org ? JSON.stringify([org, request.plan]) : "";
  useEffect(() => { const saved = runKey && readRuns()[runKey]; setUnfinished(typeof saved === "string" ? saved : null); }, [runKey]);
  useEffect(() => {
    let live = true; setQuote(null); setError("");
    if (ratios.length) void requestDraftQuote(workbench, request, { ratios, fill, tts }).then((q) => {
      if (!live) return;
      setQuote(q); if (!budgetEdited.current) setBudget(q.maxTwd);
    }, (e) => live && setError(e.message));
    return () => { live = false; };
  }, [request, workbench, ratios, fill, tts]);
  const template = caps?.remotionTemplates?.find((t) => t.id === intro),
    unsupported = template && ratios.some((r) => !(template.ratios || ["16:9", "9:16", "4:5", "1:1"]).includes(r)),
    invalid = !quote || !org || !ratios.length || budget === null || !Number.isFinite(budget) || budget < 0 || (embed && !siteId) || unsupported || (!!template && !caps?.remotion),
    // N12: a new run whose cap cannot cover the whole trip would pay the first calls and stop midway, so it cannot start
    // (the script route refuses it too, against the same signed quote). A resume keeps its run's own rules (run-store).
    belowMax = !!quote && budget !== null && budget + 1e-9 < quote.maxTwd;
  async function start(resumeRunId?: string) {
    if (invalid || busy || (!resumeRunId && belowMax)) return;
    setBusy(true); setError("");
    if (resumeRunId && runBudget.current?.runId !== resumeRunId) runBudget.current = null;
    const autoBudget = runBudget.current ||= { runId: resumeRunId || crypto.randomUUID(), budgetTwd: budget!, spentTwd: 0, organizationId: org!, model: request.plan.model, lang: request.plan.lang, siteId: request.plan.siteId, sceneCount: request.plan.sceneCount, customScenes: request.plan.customScenes };
    autoBudget.budgetTwd = budget!; autoBudget.runQuote = quote!.runQuote;
    rememberRun(runKey, autoBudget.runId); setUnfinished(null);
    try {
      const handoff = await request.generate(autoBudget), shots = shotsFromScript(handoff.script);
      if (autoBudget.estimated) throw Error("腳本用量回執不完整，已停在腳本；請取消並檢查腳本後手動接續");
      if (!shots.length) throw Error("腳本沒有可製作的場景，已停下，尚未送影片");
      if (autoBudget.spentTwd > autoBudget.budgetTwd) throw Error("腳本花費已達上限，已停下，尚未送影片");
      const actual = await workbench.request("/quick-render/quote", { scenes: shots.map((s) => ({ narration: s.line, url: "" })), ratios, fill, until: "drafts", ...(tts ? { tts } : {}) }) as Pick<DraftQuote, "problems" | "fill" | "perRatioTwd" | "voices">;
      if (actual.problems?.length) throw Error("請取消並先修改腳本：" + actual.problems.join("；"));
      if (!Number.isFinite(actual.fill?.perPictureTwd) || !Number.isFinite(actual.perRatioTwd)) throw Error("無法確認實際腳本的影片費用，已停下");
      const end = intro === "none" ? { kind: "none" } : intro === "title"
        ? { kind: "title", fields: { title: (handoff.title || request.topic).slice(0, 80) }, seconds: 3, transition, transitionSeconds: .5 }
        : { kind: "template", templateId: intro, fields: {}, seconds: template!.seconds.def, transition, transitionSeconds: .5 };
      await workbench.spine.create({ title: handoff.title || request.topic, ratio: ratios[0], shots,
        characters: handoff.storyBible?.characters || [], storyBibleSeries: handoff.storyBible?.seriesId, intro: end,
        autoRun: { runId: autoBudget.runId, until: "drafts", budgetTwd: budget, spentTwd: autoBudget.spentTwd, baseSpentTwd: autoBudget.spentTwd,
          fill, ratios, tts: tts || actual.voices.find((v) => v.available !== false) || null, embedSiteId: embed ? siteId : null,
          prices: { perPictureTwd: actual.fill.perPictureTwd, perRatioTwd: actual.perRatioTwd } },
      });
      rememberRun(runKey, null);
      close();
    } catch (e) { setError(e instanceof Error ? e.message : "執行失敗，已停下"); setBusy(false); }
  }
  return <dialog ref={dialog} aria-label="一鍵到草稿確認" onCancel={(e) => { e.preventDefault(); if (!busy) close(); }} style={{ background: "var(--card-bg)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: "var(--radius)", maxWidth: 640, width: "90vw", padding: 24 }}>
    <h2>一鍵到草稿</h2><p>建立新的一集：主題 → 完整腳本 → 補畫面 → 影片 → 審片 → 社群草稿。任何一步失敗就停下。</p>
    <p>使用已選的模型、品牌語氣與故事設定；額外的連續性檢查與定裝照可稍後手動補。</p>
    <p>輸出比例</p><div role="group" aria-label="輸出比例">{["16:9", "9:16", "4:5"].map((r) => <button type="button" key={r} disabled={busy} aria-pressed={ratios.includes(r)} style={optionStyle(ratios.includes(r))} onClick={() => setRatios(ratios.includes(r) ? ratios.filter((x) => x !== r) : [...ratios, r])}>{r}</button>)}</div>
    <p>缺的畫面</p><div role="group" aria-label="補畫面">{[["ai", "AI 生圖"], ["stock-video", "圖庫影片"], ["stock-photo", "圖庫照片"]].map(([id, label]) => <button key={id} type="button" disabled={busy} aria-pressed={fill === id} style={optionStyle(fill === id)} onClick={() => setFill(id)}>{label}</button>)}</div>
    <p>配音</p><div role="group" aria-label="配音">{quote?.voices.map((v) => <button type="button" key={v.provider + v.voice} disabled={busy || v.available === false} style={optionStyle(tts ? tts.provider === v.provider && tts.voice === v.voice : v === quote.voices.find((x) => x.available !== false))} onClick={() => setTts({ provider: v.provider, voice: v.voice })}>{v.label}</button>)}</div>
    <p>片頭</p><div role="group" aria-label="片頭">{[["none", "不要"], ["title", "標題卡"], ...(caps?.remotionTemplates || []).map((t) => [t.id, t.label])].map(([id, label]) => <button type="button" key={id} disabled={busy} style={optionStyle(intro === id)} onClick={() => setIntro(id)}>{label}</button>)}</div>
    {/* card R2: the transitions module's list */}
    <div role="group" aria-label="轉場">{Transitions.LIST.map((t: { id: string; note: string }) => <button type="button" key={t.id} disabled={busy} aria-pressed={transition === t.id} style={optionStyle(transition === t.id)} onClick={() => setTransition(t.id)}>{t.id}{t.note ? ` ${t.note}` : ""}</button>)}</div>
    {unsupported && <p role="alert">片頭模板不支援所選比例，請改比例或選標題卡。</p>}
    {!!template && !caps?.remotion && <p role="alert">片頭模板服務尚未設定，請選標題卡或不要。</p>}
    <p><label><input type="checkbox" checked={embed} disabled={busy || !quote?.sites.length} onChange={(e) => { setEmbed(e.target.checked); if (e.target.checked && !siteId) setSiteId(quote?.sites[0]?.id || ""); }} />同時建一篇網站草稿文章並嵌入</label></p>
    {embed && <div role="group" aria-label="網站">{quote?.sites.map((s) => <button type="button" key={s.id} disabled={busy} style={optionStyle(siteId === s.id)} onClick={() => setSiteId(s.id)}>{s.name}</button>)}</div>}
    <p data-testid="draft-quote">{quote ? `整趟${typicalText(quote)}，${maxText(quote)}` : "正在取得整趟報價…"}</p>
    <p>腳本尚未生成，以所選鏡頭數的上限計價；完成後按回報用量記帳。網站文章與社群都只存草稿。</p>
    <label>花費上限 NT$<input aria-label="花費上限 NT$" type="number" min="0" step="0.01" disabled={busy} value={budget ?? ""} style={inputStyle()} onChange={(e) => { budgetEdited.current = true; setBudget(e.target.value === "" ? null : Number(e.target.value)); }} /></label>
    {quote && <p data-testid="draft-budget-note">預填的是最多可能花到的錢，通常只花約 NT${quote.typicalTwd.toFixed(1)}。</p>}
    {belowMax && <p data-testid="draft-budget-floor">上限至少要 NT${quote!.maxTwd.toFixed(2)} 才能開始；低於這個數，跑到一半就會停下，前面已花的錢拿不回來。</p>}
    {unfinished && <p>這份腳本設定上次的一鍵到草稿還沒完成。續接上一趟會沿用已付費的腳本與評分，不重複計費；重新開始會重新生成並計費。</p>}
    {error && <p role="alert">{error}</p>}
    <div><button type="button" disabled={busy} style={buttonStyle()} onClick={close}>取消</button>{unfinished && <button type="button" disabled={invalid || busy} style={buttonStyle({ disabled: invalid || busy })} onClick={() => void start(unfinished)}>續接上一趟</button>}<button type="button" disabled={invalid || busy || belowMax} style={buttonStyle({ tone: "primary", disabled: invalid || busy || belowMax })} onClick={() => void start()}>{busy ? "正在生成腳本…" : unfinished ? "重新開始到草稿" : "確認，開始到草稿"}</button></div>
  </dialog>;
}
