"use client";

// ACT 行動與觀察 (contract card): the judgment's one-sentence next step becomes a task card -- your prediction first, then
// the due date, risk, stop and escalate conditions, who owns it. After the task you come back to write what happened:
// weekly for the first month, then monthly, quarterly or yearly. The AI may split the step into smaller undoable ones (you
// pick), point at what cannot be undone and summarise the numbers; it never promises, sets a target or does the step for you.
import Link from "next/link";
import { humanError } from "../../lib/errors";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { ai, docs, type Doc, type Notice } from "../../lib/blocks";
import {
  LONG_RHYTHM, STATUS, collapseFlips, holdAsked, parseNumber, rhythmLine, seriesOf, sparkPoints, taskFromNextStep,
  type Flag, type Note, type Num, type Reminder, type Split, type Task,
} from "../../lib/act";
import { GUARDRAIL_NAME, HOLD, newPeople, type Judgment } from "../../lib/decide";
import { formatTime } from "../../lib/time";
import { BlockShell, Notices } from "./BlockShell";
import { AuthorTag, Cell, Chips, optionalDocs } from "./JudgmentParts";

type Any = Record<string, any>;
const EMPTY: Task = { title: "", prediction: "" };
const PUBLIC_STEPS = "投票、發言、連署、不轉傳";
const compact = (task: Task): Task => Object.fromEntries(Object.entries(task).filter(([, value]) => value !== undefined && value !== "")) as Task;

function TaskForm({ initial, guardrails, onSave, onCancel, busy, label }: { initial: Task; guardrails: string[]; onSave: (task: Task) => void; onCancel?: () => void; busy: boolean; label: string }) {
  const [task, setTask] = useState<Task>(initial);
  const set = (patch: Partial<Task>) => setTask((held) => ({ ...held, ...patch }));
  const holding = holdAsked(guardrails, task);
  const ready = task.title.trim() && task.prediction.trim() && !holding;
  return (
    <div>
      <Cell id="task-title" label="這一步要做什麼"><input id="task-title" className="search" value={task.title} maxLength={300} onChange={(event) => set({ title: event.target.value })} /></Cell>
      <Cell id="task-prediction" label="你先預測：我預期會怎樣" hint="寫成之後對得出來的樣子。「他會讓步一半」對得出來；「應該會好一點」對不出來。">
        <textarea id="task-prediction" value={task.prediction} maxLength={1000} onChange={(event) => set({ prediction: event.target.value })} />
      </Cell>
      <Cell id="task-due" label="期限（選填）"><input id="task-due" className="search" type="date" value={task.due ?? ""} onChange={(event) => set({ due: event.target.value || undefined })} /></Cell>
      <Cell id="task-risk" label="風險：做了可能出什麼事"><textarea id="task-risk" value={task.risk ?? ""} maxLength={1000} onChange={(event) => set({ risk: event.target.value })} /></Cell>
      <Cell id="task-stop" label="行動的停止條件" hint="例：「他再改一次就不談了」。這跟判斷卡上「什麼時候停止分析」是兩件事。"><input id="task-stop" className="search" value={task.stop_condition ?? ""} maxLength={1000} onChange={(event) => set({ stop_condition: event.target.value })} /></Cell>
      <Cell id="task-escalate" label="升級條件" hint="例：「談不攏就找律師」。"><input id="task-escalate" className="search" value={task.escalate_condition ?? ""} maxLength={1000} onChange={(event) => set({ escalate_condition: event.target.value })} /></Cell>
      <Cell id="task-owner" label="誰負責"><input id="task-owner" className="search" value={task.owner ?? ""} maxLength={200} onChange={(event) => set({ owner: event.target.value })} /></Cell>
      <Cell id="task-wish" label="這正好是誰希望我做的？" hint="有人在引導你轉傳、不投票、放棄嗎？先問這一句，再行動。"><input id="task-wish" className="search" value={task.whose_wish ?? ""} maxLength={500} onChange={(event) => set({ whose_wish: event.target.value })} /></Cell>
      <div className="field">
        <b>做了以後，能反悔嗎？</b>
        <Chips options={["能反悔", "不能反悔"] as const} value={task.irreversible === undefined ? "" : task.irreversible ? "不能反悔" : "能反悔"} label="能不能反悔" onPick={(value) => set({ irreversible: value === "不能反悔", ...(value === "能反悔" ? { hold: undefined } : {}) })} />
        {holding && <p className="warn">這個案子有護欄：不能反悔的行動，請先等一下，或請人覆核。</p>}
        {task.irreversible === true && guardrails.includes("wait_or_review") && <Chips options={HOLD} value={task.hold as (typeof HOLD)[number] | undefined} label="先等一下或請人覆核" onPick={(hold) => set({ hold })} />}
      </div>
      <div className="field">
        <b>第一個月之後，你多久回來記一次？</b>
        <p className="hint">前 4 週每週一次，是固定的。之後照你選的。</p>
        <Chips options={LONG_RHYTHM} value={task.long_rhythm as (typeof LONG_RHYTHM)[number] | undefined} label="第一個月之後的節奏" onPick={(long_rhythm) => set({ long_rhythm })} />
      </div>
      <div className="btns mt8">
        <button className="btn primary" type="button" disabled={!ready || busy} onClick={() => onSave(compact({ ...task, title: task.title.trim(), prediction: task.prediction.trim() }))}>{busy ? "存檔中…" : label}</button>
        {onCancel && <button className="btn ghost" type="button" onClick={onCancel}>取消</button>}
      </div>
    </div>
  );
}

function NoteForm({ onSave, busy }: { onSave: (note: Omit<Note, "task">) => void; busy: boolean }) {
  const [cells, setCells] = useState({ happened: "", thoughts: "", adjustment: "", blocker: "" });
  const [rows, setRows] = useState([{ name: "", value: "", unit: "" }]);
  const numbers = rows.map((row) => parseNumber(row.name, row.value, row.unit)).filter((item): item is Num => item !== null);
  const ready = Object.values(cells).some((value) => value.trim()) || numbers.length > 0;
  const save = () => {
    const note: Omit<Note, "task"> = { ...Object.fromEntries(Object.entries(cells).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()])), ...(numbers.length ? { numbers } : {}) };
    onSave(note);
    setCells({ happened: "", thoughts: "", adjustment: "", blocker: "" }); setRows([{ name: "", value: "", unit: "" }]);
  };
  return (
    <div className="field">
      <b>記一筆</b>
      <p className="hint">這是你自己報的，系統不查證。</p>
      <label>實際狀況<textarea value={cells.happened} maxLength={2000} onChange={(event) => setCells({ ...cells, happened: event.target.value })} /></label>
      <label>想法<textarea value={cells.thoughts} maxLength={2000} onChange={(event) => setCells({ ...cells, thoughts: event.target.value })} /></label>
      <label>要調整什麼<textarea value={cells.adjustment} maxLength={2000} onChange={(event) => setCells({ ...cells, adjustment: event.target.value })} /></label>
      <label>卡在哪<textarea value={cells.blocker} maxLength={2000} onChange={(event) => setCells({ ...cells, blocker: event.target.value })} /></label>
      <b>實際數字（同一個數字記到兩筆，就畫成趨勢）</b>
      {rows.map((row, index) => (
        <div key={index} className="btns">
          <input className="search" aria-label={`數字 ${index + 1} 的名稱`} placeholder="名稱，例如價格" value={row.name} maxLength={100} onChange={(event) => setRows(rows.map((item, at) => (at === index ? { ...item, name: event.target.value } : item)))} />
          <input className="search" aria-label={`數字 ${index + 1} 的值`} placeholder="數字" inputMode="decimal" value={row.value} onChange={(event) => setRows(rows.map((item, at) => (at === index ? { ...item, value: event.target.value } : item)))} />
          <input className="search" aria-label={`數字 ${index + 1} 的單位`} placeholder="單位（選填）" value={row.unit} maxLength={20} onChange={(event) => setRows(rows.map((item, at) => (at === index ? { ...item, unit: event.target.value } : item)))} />
        </div>
      ))}
      {rows.length < 5 && <div className="btns"><button className="btn ghost" type="button" onClick={() => setRows([...rows, { name: "", value: "", unit: "" }])}>再加一個數字</button></div>}
      <div className="btns mt8"><button className="btn primary" type="button" disabled={!ready || busy} onClick={save}>存這一筆</button></div>
    </div>
  );
}

function Trend({ notes }: { notes: Array<Doc<Note>> }) {
  const found = seriesOf(notes);
  if (!found.length) return null;
  return (
    <div className="charts">
      {found.map((series) => (
        <figure key={series.name}>
          <figcaption><b>{series.name}</b>：{series.points.map((point) => `${point.value}${series.unit}`).join(" → ")}</figcaption>
          {series.trend
            ? <svg viewBox="0 0 240 60" role="img" aria-label={`${series.name}的趨勢，從 ${series.points[0].value} 到 ${series.points.at(-1)!.value}`}><polyline className="axis" fill="none" strokeWidth="2" points={sparkPoints(series.points.map((point) => point.value))} /></svg>
            : <p className="sub mb0">只記了一次，還看不出趨勢。</p>}
          {series.trend && <p className="sub mb0">{series.points[0].on} 到 {series.points.at(-1)!.on}</p>}
        </figure>
      ))}
    </div>
  );
}

export function ActPage({ projectId }: { projectId: string }) {
  const [judgment, setJudgment] = useState<Doc<Judgment> | null>(null);
  const [tasks, setTasks] = useState<Array<Doc<Task>> | null>(null);
  const [notes, setNotes] = useState<Array<Doc<Note>>>([]);
  const [intake, setIntake] = useState<Doc<Any> | null>(null);
  const [guardrails, setGuardrails] = useState<string[]>([]);
  const [split, setSplit] = useState<Doc<Split> | null>(null);
  const [flag, setFlag] = useState<Doc<Flag> | null>(null);
  const [trend, setTrend] = useState<Doc<{ summary: string; unclear?: string[] }> | null>(null);
  const [due, setDue] = useState<Reminder[]>([]);
  const [history, setHistory] = useState<Record<string, Array<Doc<Task>>>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Task>(EMPTY);
  const [formKey, setFormKey] = useState(0);
  const [person, setPerson] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const load = async () => {
    const [judgments, taskDocs, noteDocs, intakes, guards, splits, flags, trends, reminders] = await Promise.all([
      optionalDocs<Judgment>(projectId, "decide.judgment"), docs.list<Task>(projectId, "act.task"), docs.list<Note>(projectId, "act.note"), docs.list<Any>(projectId, "assembler.intake"),
      docs.list<{ guardrail: string }>(projectId, "govern.guardrail"), docs.list<Split>(projectId, "act.split"), docs.list<Flag>(projectId, "act.flag"), docs.list<{ summary: string; unclear?: string[] }>(projectId, "act.trend"),
      apiFetch<Reminder[]>(`/projects/${encodeURIComponent(projectId)}/act/reminders?utc_offset=${-new Date().getTimezoneOffset()}`),
    ]);
    setJudgment(judgments.at(-1) ?? null); setTasks(taskDocs); setNotes(noteDocs); setIntake(intakes.at(-1) ?? null);
    setGuardrails([...new Set(guards.map((doc) => doc.content.guardrail))]);
    setSplit(splits.at(-1) ?? null); setFlag(flags.at(-1) ?? null); setTrend(trends.at(-1) ?? null); setDue(reminders);
  };
  useEffect(() => { load().catch((reason) => setError(humanError(reason))); }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const run = (work: () => Promise<void>) => async () => {
    setError(""); setBusy(true);
    try { await work(); await load(); setRefresh((count) => count + 1); } catch (reason) { setError(humanError(reason)); } finally { setBusy(false); }
  };
  const doing = async (work: () => Promise<void>) => run(work)();
  const crisis = (turn: { stopped?: string; notice?: string; resources?: Array<{ name: string; contact: string }> }) => { if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]); };

  const nextStep = judgment?.content.next_step?.trim() ?? "";
  const publicIssue = intake?.content.purpose === "公共議題判斷" || intake?.content.package === "公共議題判斷";
  const affected: string[] = intake?.content.affected ?? [];
  const start = (patch: Partial<Task>) => { setDraft({ ...EMPTY, ...patch }); setFormKey((count) => count + 1); };

  const createTask = (task: Task) => doing(async () => { setNotices((await docs.create(projectId, "act.task", { ...task, status: "未開始" })).notices); setDraft(EMPTY); setFormKey((count) => count + 1); });
  const updateTask = (doc: Doc<Task>, content: Task) => doing(async () => { setNotices((await docs.update(projectId, "act.task", doc, content)).notices); setEditing(null); setHistory((held) => { const { [doc.doc_id]: _gone, ...rest } = held; return rest; }); });
  const saveNote = (task: Doc<Task>, note: Omit<Note, "task">) => doing(async () => { setNotices((await docs.create(projectId, "act.note", { task: task.doc_id, ...note })).notices); });
  const addPerson = () => doing(async () => {
    const added = newPeople(affected, [person]);
    if (added.length && intake) await docs.update(projectId, "assembler.intake", intake, { ...intake.content, affected: [...affected, ...added] });
    setPerson("");
  });
  const askSplit = run(async () => { const turn = await ai<Split>(projectId, "ACT", "split", {}, split); crisis(turn); });
  const askFlag = run(async () => { const turn = await ai<Flag>(projectId, "ACT", "flag", {}, flag); crisis(turn); });
  const askTrend = run(async () => { const turn = await ai<{ summary: string }>(projectId, "ACT", "trend", {}, trend); crisis(turn); });
  const openHistory = async (doc: Doc<Task>) => {
    if (history[doc.doc_id]) return;
    try { const found = await docs.versions<Task>(projectId, "act.task", doc.doc_id); setHistory((held) => ({ ...held, [doc.doc_id]: found })); } catch (reason) { setError(humanError(reason)); }
  };

  if (!tasks) return <BlockShell projectId={projectId} code="ACT"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;
  const numbered = notes.some((note) => (note.content.numbers ?? []).length > 0);

  return (
    <BlockShell projectId={projectId} code="ACT" refresh={refresh}>
      <Notices notices={notices} />
      {notices.filter((notice) => notice.type === "guardrail").length > 0 && <div className="card accent"><p className="mt0">你寫的東西碰到：{notices.map((notice) => (notice.type === "guardrail" ? notice.category : "")).filter(Boolean).join("、")}。這個案子加了護欄。</p></div>}
      {guardrails.length > 0 && <div className="card accent"><p className="mt0">這個案子有護欄：{guardrails.map((name) => GUARDRAIL_NAME[name] ?? name).join("、")}。</p></div>}

      {due.length > 0 && (
        <div className="card okline">
          <h2>該回來看了</h2>
          {due.map((item) => <p key={`${item.kind}-${item.since}`} className="mt0"><Link href={item.path}>{item.text}</Link><span className="sub">（從 {item.since} 起）</span></p>)}
        </div>
      )}

      <div className="card">
        <h2>走一小步，然後看結果</h2>
        <p className="how">這一步要最小、能反悔、你自己負得起責任。AI 可以幫你拆小、提醒哪裡不能反悔、整理數字；它不替你承諾、不替你定目標數字、不替你去做。判斷權是你的，後果也是你的。</p>
        {publicIssue && <p className="sub">公共議題的行動，是參與的一步：{PUBLIC_STEPS}。行動前先問：這正好是誰希望我做的？</p>}
        {nextStep ? (
          <div className="judge">
            <p className="mt0"><b>你在「判斷」寫的下一步：</b>{nextStep}</p>
            <div className="btns">
              <button className="btn primary" type="button" onClick={() => start(taskFromNextStep(nextStep))}>用這一句開任務卡</button>
              <button className="btn" type="button" disabled={busy} onClick={askSplit}>{busy ? "拆解中…" : split ? "再拆一次" : "請 AI 拆成更小、能反悔的步驟"}</button>
            </div>
            <p className="hint">拆小步需要協作合約准 AI「提出選項」。</p>
          </div>
        ) : <p className="sub">判斷卡上還沒有「下一步」。你也可以直接在下面寫任務卡。</p>}
        {split && (split.content.options ?? []).length > 0 && (
          <div className="judge">
            <AuthorTag author={split.author} />
            <p className="sub">由你挑，AI 不替你選。</p>
            <div className="mcards">{split.content.options.map((option) => (
              <div key={option.step} className="mcard">
                <b>{option.step}</b>
                {option.why_small && <span className="k">為什麼比較小：{option.why_small}</span>}
                <span className={option.reversible ? "k" : "need"}>{option.reversible ? `能反悔${option.undo ? `：${option.undo}` : ""}` : "不能反悔"}</span>
                <div className="btns"><button className="btn" type="button" onClick={() => start({ title: option.step.slice(0, 300), from_next_step: nextStep, irreversible: !option.reversible })}>用這一步開任務卡</button></div>
              </div>
            ))}</div>
          </div>
        )}
      </div>

      <div className="card cta">
        <h2>任務卡</h2>
        <p className="how">誰會受影響，沿用開案時寫的：{affected.length ? affected.join("、") : "還沒寫"}。</p>
        <TaskForm key={formKey} initial={draft} guardrails={guardrails} busy={busy} label="存這張任務卡" onSave={createTask} />
        <div className="field">
          <label htmlFor="more-person">這一步多出來的受影響的人（選填）</label>
          <input id="more-person" className="search" value={person} maxLength={200} onChange={(event) => setPerson(event.target.value)} />
          <div className="btns"><button className="btn" type="button" disabled={!person.trim() || !intake || busy} onClick={addPerson}>補進開案資料</button></div>
        </div>
      </div>

      {tasks.length === 0 && <div className="card"><p className="sub mb0">還沒有任務卡。</p></div>}
      {tasks.map((task) => {
        const mine = notes.filter((note) => note.content.task === task.doc_id);
        const folded = history[task.doc_id] ? collapseFlips(history[task.doc_id]) : [];
        return (
          <div key={task.doc_id} className="card">
            {editing === task.doc_id ? (
              <TaskForm initial={task.content} guardrails={guardrails} busy={busy} label="存修改" onSave={(content) => updateTask(task, content)} onCancel={() => setEditing(null)} />
            ) : (
              <div className="tcard">
                <div className="head"><h3>{task.content.title}</h3><span className="tags"><span>{task.content.status ?? "未開始"}</span></span></div>
                <div className="meta"><span>期限：{task.content.due ?? "沒定"}</span><span>負責：{task.content.owner || "沒寫"}</span><span>{rhythmLine(task.content.long_rhythm)}</span></div>
                <p className="mb8"><b>我的預測：</b>{task.content.prediction}</p>
                {task.content.risk && <p className="mt0 mb8"><b>風險：</b>{task.content.risk}</p>}
                {task.content.stop_condition && <p className="mt0 mb8"><b>停止條件：</b>{task.content.stop_condition}</p>}
                {task.content.escalate_condition && <p className="mt0 mb8"><b>升級條件：</b>{task.content.escalate_condition}</p>}
                {task.content.whose_wish && <p className="mt0 mb8"><b>這正好是誰希望我做的：</b>{task.content.whose_wish}</p>}
                {task.content.irreversible && <p className="warn mt0 mb8">不能反悔{task.content.hold ? `；你選了「${task.content.hold}」` : ""}</p>}
                <div className="chips" role="group" aria-label="狀態">{STATUS.map((status) => (
                  <button key={status} type="button" className={`chip${(task.content.status ?? "未開始") === status ? " on" : ""}`} aria-pressed={(task.content.status ?? "未開始") === status} disabled={busy}
                    onClick={() => updateTask(task, { ...task.content, status })}>{status}</button>
                ))}</div>
                <div className="btns"><button className="btn ghost" type="button" onClick={() => setEditing(task.doc_id)}>改期限、內容或換做法</button></div>
                <details onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) openHistory(task); }}>
                  <summary>這張卡的歷程（每一版都留著）</summary>
                  {folded.map((run) => (
                    <div key={run.shown.version} className="tnote">
                      <b>第 {run.shown.version} 版</b>{formatTime(run.shown.at)}・狀態：{run.shown.content.status ?? "未開始"}・期限：{run.shown.content.due ?? "沒定"}
                      {run.earlier.length > 0 && (
                        <details><summary>中間還有 {run.earlier.length} 次很快的改動</summary>
                          {run.earlier.map((item) => <p key={item.version} className="sub mb0">第 {item.version} 版・{formatTime(item.at)}・狀態：{item.content.status ?? "未開始"}</p>)}
                        </details>
                      )}
                    </div>
                  ))}
                </details>
              </div>
            )}
            <h3 className="mt12">觀察紀錄</h3>
            <div className="tnotes">{mine.length === 0 && <p className="sub mb0">還沒有紀錄。</p>}{mine.map((note) => (
              <div key={note.doc_id} className="tnote">
                <b>{formatTime(note.at)}</b>
                {note.content.happened && <span>實際狀況：{note.content.happened}　</span>}
                {note.content.thoughts && <span>想法：{note.content.thoughts}　</span>}
                {note.content.adjustment && <span>調整：{note.content.adjustment}　</span>}
                {note.content.blocker && <span>卡住：{note.content.blocker}　</span>}
                {(note.content.numbers ?? []).length > 0 && <span>數字：{note.content.numbers!.map((item) => `${item.name} ${item.value}${item.unit ?? ""}`).join("、")}</span>}
              </div>
            ))}</div>
            <Trend notes={mine} />
            <NoteForm busy={busy} onSave={(note) => saveNote(task, note)} />
          </div>
        );
      })}

      {tasks.length > 0 && (
        <div className="card">
          <h2>請 AI 幫忙看</h2>
          <p className="how">AI 只指出哪裡不能反悔、會影響到誰，和你記的數字怎麼走；它不決定你做不做，也不給你定目標。</p>
          <div className="btns">
            <button className="btn" type="button" disabled={busy} onClick={askFlag}>{flag ? "再看一次哪裡不能反悔" : "看哪裡不能反悔"}</button>
            <button className="btn" type="button" disabled={busy || !numbered} onClick={askTrend}>{trend ? "再整理一次趨勢" : "整理數字的趨勢"}</button>
          </div>
          {!numbered && <p className="hint">要有紀錄記了數字，才能整理趨勢。</p>}
          {flag && (
            <div className="judge">
              <AuthorTag author={flag.author} />
              {(flag.content.irreversible ?? []).length > 0 ? <><b>做了不能反悔</b><ul>{flag.content.irreversible!.map((item) => <li key={item}>{item}</li>)}</ul></> : <p className="sub">AI 沒有指出不能反悔的地方。</p>}
              {(flag.content.affects_others ?? []).length > 0 && <><b>會影響到誰</b><ul>{flag.content.affects_others!.map((item) => <li key={item}>{item}</li>)}</ul></>}
              <p className="sub mb0">要不要照做，由你決定；任務卡上「能不能反悔」也由你勾。</p>
            </div>
          )}
          {trend && (
            <div className="judge">
              <AuthorTag author={trend.author} />
              <p>{trend.content.summary}</p>
              {(trend.content.unclear ?? []).length > 0 && <><b>只記了一次、看不出趨勢</b><ul>{trend.content.unclear!.map((item) => <li key={item}>{item}</li>)}</ul></>}
            </div>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <p className="sub">到期的時候，會提醒你回「回顧校準」，把當初的預測和實際發生的並排看。</p>
    </BlockShell>
  );
}
