"use client";

// COMPUTE 計算與模擬 (contract card): you say what to calculate, pick the numbers, say where each comes from (source
// cards, or 我自己說的) and set 樂觀／悲觀 beside 一般; saving runs it on the server (block_hooks/compute.py), which keeps
// every run: formula, inputs with sources, a range, the one number that flips it, the label. Every rule and every
// refusal lives on the server (GET /blocks/compute/spec); this page only shows them. The AI suggests an algorithm and
// explains a run in words; it never writes a number.
import React, { useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "../../lib/api";
import { AUTHOR, ai, docs, type AiTurn, type Doc, type Notice } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { BlockShell, Notices } from "./BlockShell";

type InputSpec = { key: string; name: string; type: string; min?: number; max?: number; hint?: string; repeat?: [number, number]; spread?: boolean; scenarios?: boolean; sweep?: string };
type TypeSpec = { unit: string; fixed_unit: boolean; same_unit?: boolean; integer?: boolean };
export type Algorithm = { id: string; name: string; label: string; formula: string; inputs: InputSpec[]; result: { name: string; unit: string }; sides: string[]; extras?: string[] };
export type Spec = {
  ruleset: { name: string; version: string; fingerprint: string; title: string; maintainer: string }; types: Record<string, TypeSpec>; algorithms: Algorithm[];
  scenarios: string[]; base: string; own_words: string; min_origins: number; labels: string[]; adopt: string[]; parts: string[]; not_priced_sides: string[];
  not_prediction: string; uncomputable: string;
};
type InputRow = { key: string; name: string; value: number; unit: string; cards?: string[]; own: boolean };
type NotPriced = { side: string; what: string };
export type Request = { question: string; algorithm: string; inputs: Array<Omit<InputRow, "value"> & { value: number | null }>; scenarios?: Record<string, Record<string, number | null>>; not_priced?: NotPriced[]; who_bears?: string };
type Flip = { input: string | null; base?: number; at?: number; from: string; to?: string; change?: number | null; why?: string; each: Array<{ input: string; base: number; at: number | null; to?: string; why?: string }> };
export type Run = {
  run_id: string; at: string; question: string; label: string; algorithm: { id: string; version: string; name: string }; formula: string; inputs: InputRow[];
  scenarios: Record<string, Record<string, number>>; flip: Flip; rules: { version: string }; request: string; rerun_of?: string; thin_inputs: string[];
  result: { what: string; unit: string; range: { low: number; high: number; unit: string }; by_scenario?: Record<string, { value: number; side: string; benefits_now?: number; costs_now?: number }>;
    simulation?: { runs: number; value: number; mean: number; chance: number; threshold: number; side: string }; not_priced?: NotPriced[]; who_bears?: string };
  adopt: { adopt: string; reason: string } | null; sourcing: Array<{ input: string; own: boolean; origins: number; words: string }>; weakest: string;
};
type Origin = { origin_id: string; counts: boolean; cards: Array<{ card: string; title?: string; url?: string }> };
type Explanation = { run: string; points: Array<{ part: string; text: string }>; influential: string; rests_on: string[] };
type Suggestion = { algorithms: Array<{ id: string; why: string }>; ideas?: string[]; question?: string };
type Adopt = { run: string; adopt: string; reason?: string };

export type DraftInput = { key: string; name: string; value: string; unit: string; own: boolean; cards: string[]; scenarios: Record<string, string> };
export type Draft = { question: string; algorithm: string; inputs: DraftInput[]; not_priced: NotPriced[]; who_bears: string };

const others = (spec: Spec) => spec.scenarios.filter((name) => name !== spec.base);
const number = (text: string): number | null => (text.trim() === "" ? null : Number(text));
export const fmt = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value) : "—");

/** The empty rows an algorithm asks for: one per input, a repeated one as many times as it needs at least. */
export function draftFor(spec: Spec, algorithm: Algorithm, question = ""): Draft {
  const rows = algorithm.inputs.flatMap((input) => Array.from({ length: input.repeat ? input.repeat[0] : 1 }, () => ({
    key: input.key, name: input.repeat ? "" : input.name, value: "", unit: spec.types[input.type].unit, own: true, cards: [], scenarios: {},
  })));
  return { question, algorithm: algorithm.id, inputs: rows, not_priced: [], who_bears: "" };
}

/** What is saved: numbers as typed (an empty or unreadable one goes as null, and the server says which). */
export function toRequest(spec: Spec, draft: Draft): Request {
  const algorithm = spec.algorithms.find((item) => item.id === draft.algorithm);
  const scenarios: Record<string, Record<string, number | null>> = {};
  for (const scenario of others(spec)) {
    for (const row of draft.inputs) {
      const text = row.scenarios[scenario] ?? "";
      if (text.trim() !== "") (scenarios[scenario] ??= {})[row.name.trim()] = number(text);
    }
  }
  const extras = new Set(algorithm?.extras ?? []);
  return {
    question: draft.question.trim(), algorithm: draft.algorithm,
    inputs: draft.inputs.map((row) => ({ key: row.key, name: row.name.trim(), value: number(row.value), unit: row.unit.trim(), own: row.own, ...(row.own ? {} : { cards: row.cards }) })),
    ...(Object.keys(scenarios).length ? { scenarios } : {}),
    ...(extras.has("not_priced") && draft.not_priced.length ? { not_priced: draft.not_priced.map((row) => ({ side: row.side, what: row.what.trim() })) } : {}),
    ...(extras.has("who_bears") ? { who_bears: draft.who_bears.trim() } : {}),
  };
}

/** A saved request back into the form (改輸入再算). */
export function fromRequest(spec: Spec, content: Request): Draft {
  return {
    question: content.question, algorithm: content.algorithm, not_priced: content.not_priced ?? [], who_bears: content.who_bears ?? "",
    inputs: content.inputs.map((row) => ({
      key: row.key, name: row.name, value: row.value === null ? "" : String(row.value), unit: row.unit, own: row.own, cards: row.cards ?? [],
      scenarios: Object.fromEntries(others(spec).filter((name) => content.scenarios?.[name]?.[row.name] != null).map((name) => [name, String(content.scenarios![name][row.name])])),
    })),
  };
}

/** The server words a refused number in plain Chinese after its code (block_hooks/compute.py _refuse); any other failure is humanError's. */
export function refusal(reason: unknown): string {
  if (reason instanceof ApiError && typeof reason.detail === "string") {
    const found = /^COMPUTE_INPUT_REFUSED: ([\s\S]+)$/.exec(reason.detail);
    if (found) return found[1];
  }
  return humanError(reason);
}

/** 哪一個輸入一變，結果就翻過來 -- in one sentence, from the run's own sweep. */
export function flipWords(run: Run): string {
  const flip = run.flip;
  if (!flip.input) return flip.why ?? "";
  const unit = run.inputs.find((row) => row.name === flip.input)?.unit ?? "";
  const change = typeof flip.change === "number" ? `（${flip.change > 0 ? "多" : "少"} ${Math.abs(Math.round(flip.change * 100))}%）` : "";
  const whole = run.result.simulation ? "（這一項的樂觀、一般、悲觀一起移）" : "";
  return `只改「${flip.input}」${whole}：從 ${fmt(flip.base)} ${unit} 變成大約 ${fmt(flip.at)} ${unit}${change}，結果就從「${flip.from}」變成「${flip.to}」。其他數字都不動。`;
}

function Chips({ options, value, onPick, label }: { options: string[]; value: string; onPick: (value: string) => void; label: string }) {
  return <div className="chips" role="group" aria-label={label}>{options.map((option) => <button key={option} type="button" className={`chip${value === option ? " on" : ""}`} aria-pressed={value === option} onClick={() => onPick(option)}>{option}</button>)}</div>;
}

function RunSummary({ run, spec }: { run: Run; spec: Spec }) {
  const source = Object.fromEntries(run.sourcing.map((row) => [row.input, row.words]));
  return (
    <>
      <span className="tags"><span>{run.label}</span><span>{run.algorithm.name}・算法第 {run.algorithm.version} 版</span><span>{AUTHOR.system}算的</span></span>
      <p className="mt4"><b>{run.question}</b></p>
      {run.result.simulation && <p className="warn">{spec.not_prediction}。悲觀的結果不代表一定會發生，樂觀的也一樣。</p>}
      <p className="how">公式：{run.formula}</p>
      {run.inputs.map((row) => (
        <div key={row.name} className="row">
          <b>{row.name}</b>
          <span className="q">{fmt(row.value)} {row.unit}
            {others(spec).filter((name) => run.scenarios[name]?.[row.name] !== row.value).map((name) => <span key={name} className="k">　{name}：{fmt(run.scenarios[name][row.name])}</span>)}
            <br /><span className={row.own ? "warn" : "k"}>{source[row.name]}</span></span>
        </div>
      ))}
      <div className="kpis mt8">
        <div className="kpi"><b>{run.result.what}{run.result.simulation ? "：中間 90% 的模擬落在" : "：範圍"}</b><span>{fmt(run.result.range.low)} 到 {fmt(run.result.range.high)} {run.result.range.unit}</span></div>
        {run.result.by_scenario && spec.scenarios.map((name) => run.result.by_scenario![name] && (
          <div key={name} className="kpi"><b>{name}</b><span>{fmt(run.result.by_scenario![name].value)} {run.result.unit}</span><span className="when">{run.result.by_scenario![name].side}</span>
            {run.result.by_scenario![name].benefits_now !== undefined && <span className="when">效益的現值 {fmt(run.result.by_scenario![name].benefits_now)}・成本的現值 {fmt(run.result.by_scenario![name].costs_now)}</span>}</div>
        ))}
        {run.result.simulation && (
          <div className="kpi"><b>一半的模擬在 {fmt(run.result.simulation.value)} {run.result.unit} 以上</b>
            <span className="when">達到你要的最低結果（{fmt(run.result.simulation.threshold)}）的模擬：{fmt(run.result.simulation.chance * 100)}%（抽了 {fmt(run.result.simulation.runs)} 次）</span>
            <span className="when">{run.result.simulation.side}</span></div>
        )}
      </div>
      <p className="mt8"><b>哪一個數字一變，結果就翻過來：</b>{flipWords(run)}</p>
      {run.flip.each.filter((entry) => entry.why && entry.input !== run.flip.input).map((entry) => <p key={entry.input} className="hint">「{entry.input}」沒有單獨改：{entry.why}</p>)}
      <p className="warn">{run.weakest}</p>
      {run.result.not_priced && run.result.not_priced.length > 0 && <><b>換不成金額的，另外列（沒有算進去）</b><ul>{run.result.not_priced.map((row) => <li key={`${row.side}${row.what}`}>{row.side}：{row.what}</li>)}</ul></>}
      {run.result.who_bears && <p><b>誰得到效益、誰付成本：</b>{run.result.who_bears}</p>}
    </>
  );
}

export function ComputePage({ projectId }: { projectId: string }) {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [requests, setRequests] = useState<Doc<Request>[]>([]);
  const [explanations, setExplanations] = useState<Doc<Explanation>[]>([]);
  const [suggestion, setSuggestion] = useState<Doc<Suggestion> | null>(null);
  const [adopts, setAdopts] = useState<Doc<Adopt>[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Doc<Request> | null>(null);
  const [handback, setHandback] = useState<Record<string, string>>({});
  const [adopting, setAdopting] = useState<Record<string, { adopt: string; reason: string }>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const load = async () => {
    const [found, evidence, held, asked, explained, suggested, adopted] = await Promise.all([
      apiFetch<Spec>("/blocks/compute/spec"), apiFetch<{ origins: Origin[] }>(`/projects/${encodeURIComponent(projectId)}/evidence`),
      apiFetch<Run[]>(`/projects/${encodeURIComponent(projectId)}/compute/runs`), docs.list<Request>(projectId, "compute.request"),
      docs.list<Explanation>(projectId, "compute.explanation"), docs.list<Suggestion>(projectId, "compute.suggestion"), docs.list<Adopt>(projectId, "compute.adopt"),
    ]);
    setSpec(found); setOrigins(evidence.origins); setRuns(held); setRequests(asked); setExplanations(explained); setSuggestion(suggested.at(-1) ?? null); setAdopts(adopted);
    setDraft((current) => current ?? draftFor(found, found.algorithms[0]));
  };
  useEffect(() => { load().catch((reason) => setError(humanError(reason))); }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (work: () => Promise<void>, show: (reason: unknown) => string = humanError) => {
    setError(""); setBusy(true);
    try { await work(); await load(); setRefresh((count) => count + 1); } catch (reason) { setError(show(reason)); } finally { setBusy(false); }
  };
  const algorithm = useMemo(() => spec?.algorithms.find((item) => item.id === draft?.algorithm), [spec, draft?.algorithm]);
  const cards = useMemo(() => origins.flatMap((origin) => origin.cards.map((card) => ({ ...card, counts: origin.counts }))), [origins]);
  if (!spec || !draft || !algorithm) return <BlockShell projectId={projectId} code="COMPUTE"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;

  const setRow = (index: number, patch: Partial<DraftInput>) => setDraft({ ...draft, inputs: draft.inputs.map((row, at) => (at === index ? { ...row, ...patch } : row)) });
  const specOf = (key: string) => algorithm.inputs.find((input) => input.key === key)!;
  const save = () => act(async () => {
    const content = toRequest(spec, draft);
    const saved = editing ? await docs.update(projectId, "compute.request", editing, content) : await docs.create(projectId, "compute.request", content);
    setNotices(saved.notices); setEditing(null); setDraft(draftFor(spec, algorithm));
  }, refusal);
  const again = (run: Run) => act(async () => {
    const request = requests.find((doc) => doc.doc_id === run.request);
    if (request) setNotices((await docs.update(projectId, "compute.request", request, request.content)).notices);
  }, refusal);
  const suggest = () => act(async () => {
    const turn = await ai<Suggestion>(projectId, "COMPUTE", "suggest", { question: draft.question });
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
  });
  const explain = (run: Run, goOn = false) => act(async () => {
    const turn = await ai<Explanation>(projectId, "COMPUTE", "explain", { run: run.run_id, ...(goOn ? { go_on: true } : {}) }) as AiTurn<Explanation> & { handback?: string };
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
    setHandback((held) => ({ ...held, [run.run_id]: turn.handback ?? "" }));
  });
  const decide = (run: Run) => act(async () => {
    const choice = adopting[run.run_id];
    const earlier = adopts.find((doc) => doc.content.run === run.run_id);
    const content = { run: run.run_id, adopt: choice.adopt, reason: choice.reason.trim() };
    if (earlier) await docs.update(projectId, "compute.adopt", earlier, content); else await docs.create(projectId, "compute.adopt", content);
    setAdopting((held) => Object.fromEntries(Object.entries(held).filter(([runId]) => runId !== run.run_id)));
  });
  const pick = (runId: string) => setPicked((held) => (held.includes(runId) ? held.filter((item) => item !== runId) : [...held, runId].slice(-2)));
  const compared = picked.map((runId) => runs.find((run) => run.run_id === runId)).filter((run): run is Run => Boolean(run));

  return (
    <BlockShell projectId={projectId} code="COMPUTE" refresh={refresh}>
      <Notices notices={notices} />
      <div className="card cta">
        <h2>{editing ? "改輸入，再算一次" : "你要算什麼"}</h2>
        <p className="how">系統真的去算，不是 AI 用講的。每個數字都要說從哪裡來：選蒐集來的來源卡，或標「{spec.own_words}」。結果會給一個範圍，不只一個數字。</p>
        {editing && <p className="hint">存了會多一次計算，舊的那次留著，可以並排比。</p>}
        <label htmlFor="compute-question">例：拆夥後六個月的收入夠不夠</label>
        <textarea id="compute-question" value={draft.question} maxLength={1000} onChange={(event) => setDraft({ ...draft, question: event.target.value })} />
        <div className="btns mt8"><button className="btn" type="button" disabled={!draft.question.trim() || busy} onClick={suggest}>請 AI 建議算法</button></div>
        {suggestion && (
          <div className="judge">
            <span className="tags"><span>{AUTHOR[suggestion.author]}</span><span>只是建議，不是唯一正確的算法</span></span>
            <ul>{suggestion.content.algorithms.map((item) => <li key={item.id}><b>{spec.algorithms.find((found) => found.id === item.id)?.name}</b>：{item.why}</li>)}</ul>
            {(suggestion.content.ideas ?? []).length > 0 && <><b>情境可以怎麼想</b><ul>{suggestion.content.ideas!.map((idea) => <li key={idea}>{idea}</li>)}</ul></>}
            {suggestion.content.question && <p><b>一個問題：</b>{suggestion.content.question}</p>}
          </div>
        )}

        <b>用哪一種算法</b>
        <Chips options={spec.algorithms.map((item) => item.name)} value={algorithm.name} label="算法"
          onPick={(name) => { const next = spec.algorithms.find((item) => item.name === name)!; setDraft(draftFor(spec, next, draft.question)); }} />
        <p className="how"><span className="tag">{algorithm.label}</span> 公式：{algorithm.formula}</p>
        <p className="hint">算法清單是「{spec.ruleset.title}」第 {spec.ruleset.version} 版，{spec.ruleset.maintainer}維護。</p>

        {draft.inputs.map((row, index) => {
          const input = specOf(row.key);
          const kind = spec.types[input.type];
          const repeated = draft.inputs.filter((item) => item.key === row.key).length;
          return (
            <div key={index} className="station">
              {input.repeat
                ? <><label htmlFor={`name-${index}`}>{input.name}：名字</label><input id={`name-${index}`} className="search" value={row.name} maxLength={60} onChange={(event) => setRow(index, { name: event.target.value })} /></>
                : <h3>{input.name}</h3>}
              {input.hint && <p className="hint">{input.hint}</p>}
              <label htmlFor={`value-${index}`}>{input.spread ? spec.base : "數字"}{kind.fixed_unit ? `（${kind.unit}）` : ""}</label>
              <input id={`value-${index}`} className="search" type="number" inputMode="decimal" step="any" value={row.value} onChange={(event) => setRow(index, { value: event.target.value })} />
              {!kind.fixed_unit && <><label htmlFor={`unit-${index}`}>單位</label><input id={`unit-${index}`} className="search" value={row.unit} maxLength={20} onChange={(event) => setRow(index, { unit: event.target.value })} /></>}
              {input.scenarios !== false && others(spec).map((scenario) => (
                <React.Fragment key={scenario}>
                  <label htmlFor={`${scenario}-${index}`}>{scenario}時（不填＝跟{spec.base}一樣）</label>
                  <input id={`${scenario}-${index}`} className="search" type="number" inputMode="decimal" step="any" value={row.scenarios[scenario] ?? ""}
                    onChange={(event) => setRow(index, { scenarios: { ...row.scenarios, [scenario]: event.target.value } })} />
                </React.Fragment>
              ))}
              <b>這個數字從哪裡來</b>
              <div className="chips" role="group" aria-label={`${input.name} 的來源`}>
                <button type="button" className={`chip${row.own ? " on" : ""}`} aria-pressed={row.own} onClick={() => setRow(index, { own: true, cards: [] })}>{spec.own_words}</button>
                {cards.map((card) => {
                  const on = !row.own && row.cards.includes(card.card);
                  return <button key={card.card} type="button" className={`chip${on ? " on" : ""}`} aria-pressed={on}
                    onClick={() => setRow(index, { own: false, cards: on ? row.cards.filter((item) => item !== card.card) : [...(row.own ? [] : row.cards), card.card] })}>
                    {(card.title || card.url || card.card).slice(0, 30)}{card.counts ? "" : "・不算數"}</button>;
                })}
              </div>
              {cards.length === 0 && <p className="hint">這個案子還沒有來源卡。到「蒐集來源」找回資料，或先標「{spec.own_words}」。</p>}
              {input.repeat && repeated > input.repeat[0] && <button className="btn ghost" type="button" onClick={() => setDraft({ ...draft, inputs: draft.inputs.filter((_, at) => at !== index) })}>拿掉這一項</button>}
              {input.repeat && index === draft.inputs.map((item) => item.key).lastIndexOf(row.key) && repeated < input.repeat[1] && (
                <button className="btn ghost" type="button" onClick={() => setDraft({ ...draft, inputs: [...draft.inputs.slice(0, index + 1), { key: row.key, name: "", value: "", unit: row.unit, own: true, cards: [], scenarios: {} }, ...draft.inputs.slice(index + 1)] })}>再加一項</button>
              )}
            </div>
          );
        })}

        {(algorithm.extras ?? []).includes("not_priced") && (
          <div className="station">
            <h3>換不成金額的東西</h3>
            <p className="hint">例如健康、關係、安全。另外列出來，不硬算成價格。</p>
            {draft.not_priced.map((row, index) => (
              <div key={index} className="field">
                <Chips options={spec.not_priced_sides} value={row.side} label="算成本還是效益" onPick={(side) => setDraft({ ...draft, not_priced: draft.not_priced.map((item, at) => (at === index ? { ...item, side } : item)) })} />
                <input className="search" aria-label="換不成金額的東西" value={row.what} maxLength={200} onChange={(event) => setDraft({ ...draft, not_priced: draft.not_priced.map((item, at) => (at === index ? { ...item, what: event.target.value } : item)) })} />
                <button className="btn ghost" type="button" onClick={() => setDraft({ ...draft, not_priced: draft.not_priced.filter((_, at) => at !== index) })}>拿掉</button>
              </div>
            ))}
            {draft.not_priced.length < 10 && <button className="btn ghost" type="button" onClick={() => setDraft({ ...draft, not_priced: [...draft.not_priced, { side: spec.not_priced_sides[1], what: "" }] })}>加一項</button>}
          </div>
        )}
        {(algorithm.extras ?? []).includes("who_bears") && (
          <><label htmlFor="who-bears">誰得到效益、誰付成本</label><textarea id="who-bears" value={draft.who_bears} maxLength={1000} onChange={(event) => setDraft({ ...draft, who_bears: event.target.value })} /></>
        )}
        <div className="btns mt8">
          <button className="btn primary" type="button" disabled={!draft.question.trim() || busy} onClick={save}>{busy ? "計算中…" : editing ? "改好了，再算一次" : "算"}</button>
          {editing && <button className="btn ghost" type="button" onClick={() => { setEditing(null); setDraft(draftFor(spec, algorithm)); }}>取消</button>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      {compared.length === 2 && (
        <div className="card">
          <div className="top"><h2>並排比</h2><button className="btn ghost" type="button" onClick={() => setPicked([])}>收起來</button></div>
          <div className="grid2">{compared.map((run) => <div key={run.run_id} className="judge"><RunSummary run={run} spec={spec} /></div>)}</div>
        </div>
      )}

      <div className="card">
        <h2>算過的 <small>{runs.length} 次</small></h2>
        {runs.length === 0 && <p className="sub">還沒有算過。</p>}
        {[...runs].reverse().map((run) => {
          const explained = explanations.filter((doc) => doc.content.run === run.run_id).at(-1);
          const choice = adopting[run.run_id];
          return (
            <div key={run.run_id} className="judge">
              <RunSummary run={run} spec={spec} />
              <div className="btns">
                <button className="btn ghost" type="button" disabled={busy} onClick={() => { const request = requests.find((doc) => doc.doc_id === run.request); if (request) { setEditing(request); setDraft(fromRequest(spec, request.content)); } }}>改輸入再算</button>
                <button className="btn ghost" type="button" disabled={busy} onClick={() => again(run)}>用同樣的數字再算一次</button>
                {run.rerun_of && <button className="btn ghost" type="button" onClick={() => setPicked([run.rerun_of!, run.run_id])}>跟上一次並排比</button>}
                <button className={`chip${picked.includes(run.run_id) ? " on" : ""}`} type="button" aria-pressed={picked.includes(run.run_id)} onClick={() => pick(run.run_id)}>選來比較</button>
                <button className="btn" type="button" disabled={busy} onClick={() => explain(run)}>請 AI 用白話解釋</button>
              </div>
              {handback[run.run_id] && (
                <div className="finding warn" role="status"><b>AI 先停下來</b>{handback[run.run_id]}
                  <div className="btns mt8"><button className="btn" type="button" disabled={busy} onClick={() => explain(run, true)}>仍然繼續</button></div></div>
              )}
              {explained && (
                <div className="finding">
                  <span className="tags"><span>{AUTHOR[explained.author]}</span></span>
                  <ul>{explained.content.points.map((point, index) => <li key={index}><span className="tag">{point.part}</span> {point.text}</li>)}</ul>
                  <p><b>AI 認為最影響結果的：</b>「{explained.content.influential}」</p>
                  <p className="hint">這個解釋靠的數字：{explained.content.rests_on.map((name) => `「${name}」`).join("、")}。數字都是系統算的，AI 沒有寫數字。</p>
                </div>
              )}
              {run.adopt && !choice
                ? <p><b>你{run.adopt.adopt}：</b>{run.adopt.reason} <button className="btn ghost" type="button" onClick={() => setAdopting({ ...adopting, [run.run_id]: { ...run.adopt! } })}>改</button></p>
                : (
                  <div className="field">
                    <Chips options={spec.adopt} value={choice?.adopt ?? ""} label="採不採用" onPick={(adopt) => setAdopting({ ...adopting, [run.run_id]: { adopt, reason: choice?.reason ?? "" } })} />
                    {choice && <>
                      <label htmlFor={`reason-${run.run_id}`}>為什麼</label>
                      <textarea id={`reason-${run.run_id}`} value={choice.reason} maxLength={1000} onChange={(event) => setAdopting({ ...adopting, [run.run_id]: { ...choice, reason: event.target.value } })} />
                      <div className="btns"><button className="btn primary" type="button" disabled={!choice.reason.trim() || busy} onClick={() => decide(run)}>存</button></div>
                    </>}
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </BlockShell>
  );
}
