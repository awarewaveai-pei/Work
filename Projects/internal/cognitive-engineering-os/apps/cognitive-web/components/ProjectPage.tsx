"use client";

// One project (我的案子 › name): what it is, every analysis in it newest first -- each opens its own result page -- its
// tasks (⑦ 存成任務 or added straight from a card) as cards with a status board and a journal, its rerun reminders
// (到期重跑，或隨時「現在重跑並比較」), how many sources it holds, and its 歷程 (the project's own history, newest first).
// While an analysis runs, the list refreshes itself.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { analysisHref, compareHref, runHref, toolHref, toolLabel } from "../lib/catalog";
import { failureReason, humanError } from "../lib/errors";
import { STANCE, STATUS, TASK_STATUS, holderWord, standing, thisHolder, todayIso, type Analysis, type Project, type Rerun, type Source, type Task, type TaskNumber, type TaskStatus } from "../lib/projects";
import { formatTime } from "../lib/time";
import { TrendChart, type TrendSeries } from "./result/Charts";
import { CaseSlots } from "./blocks/BlockShell";
import { ProcessFacts } from "./blocks/ProcessFacts";

const OPEN: Record<Analysis["status"], string> = { DONE: "看結果 →", PENDING: "看進度 →", FAILED: "看原因 →" };
const TASK_STATUS_LIST = Object.keys(TASK_STATUS) as TaskStatus[];

// GET /projects/{id}/history: the project's own append-only event log, raw (main.py `project_history`).
type HistoryEvent = { event_id: string; event_type: string; occurred_at: string; payload: Record<string, any> };
type NumberDraft = { name: string; value: string; unit: string };
type NoteDraft = { happened: string; thoughts: string; adjustment: string; blocker: string; numbers: NumberDraft[]; next_check: string };
type ChildDraft = { mode: "task" | "plan_change" | null; title: string; due: string; note: string };
const EMPTY_NOTE: NoteDraft = { happened: "", thoughts: "", adjustment: "", blocker: "", numbers: [], next_check: "" };
const EMPTY_CHILD: ChildDraft = { mode: null, title: "", due: "", note: "" };

export function ProjectPage({ projectId, names = {} }: { projectId: string; names?: Record<string, string> }) {
  const [project, setProject] = useState<Project | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reruns, setReruns] = useState<Rerun[]>([]);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [projectName, setProjectName] = useState("");   // N-83: the rename control's own field, synced from project.name
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [metricNames, setMetricNames] = useState<Record<string, string[]>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, NoteDraft>>({});
  const [noteBusy, setNoteBusy] = useState<Record<string, boolean>>({});
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({});
  const [childDrafts, setChildDrafts] = useState<Record<string, ChildDraft>>({});
  const [childBusy, setChildBusy] = useState<Record<string, boolean>>({});
  const [childErrors, setChildErrors] = useState<Record<string, string>>({});
  const [rerunNowBusy, setRerunNowBusy] = useState(false);
  const [rerunNowError, setRerunNowError] = useState("");
  const base = `/projects/${encodeURIComponent(projectId)}`;

  const load = () => Promise.all([apiFetch<Project>(base), apiFetch<Analysis[]>(`${base}/analyses`), apiFetch<Task[]>(`${base}/tasks`), apiFetch<Rerun[]>(`${base}/reruns`), apiFetch<HistoryEvent[]>(`${base}/history`)])
    .then(([found, list, held, due, events]) => { setProject(found); setAnalyses(list); setTasks(held); setReruns(due); setHistory(events); });
  useEffect(() => {
    let active = true;
    Promise.all([load(), apiFetch<Source[]>(`${base}/sources`).then((held) => { if (active) setSources(held); })])
      .catch((reason) => { if (active) setLoadError(reason instanceof ApiError && reason.status === 404 ? "找不到這個案子或分析：可能已經刪除，或不在你的帳號裡。" : humanError(reason)); });
    return () => { active = false; };
  }, [base]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Only on first load (not the running-poll's refresh below): a rename in progress must not be clobbered every 5s.
  useEffect(() => { if (project) setProjectName(project.name); }, [project?.project_id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const running = Boolean(analyses?.some((item) => item.status === "PENDING"));
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => { load().catch(() => undefined); }, 5000);
    return () => clearInterval(timer);
  }, [base, running]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Metric name suggestions for 實際數字, from the analysis each task came from (GET /interpretations/{id}
  // result.solutions.metrics[].name) -- fetched once per interpretation_id the project's tasks carry, then cached.
  useEffect(() => {
    const ids = [...new Set(tasks.map((task) => task.interpretation_id).filter((id): id is string => Boolean(id)))].filter((id) => !(id in metricNames));
    if (!ids.length) return;
    let active = true;
    Promise.all(ids.map((id) => apiFetch<{ result?: { solutions?: { metrics?: Array<{ name: string }> } } }>(`/interpretations/${encodeURIComponent(id)}`)
      .then((found) => [id, (found.result?.solutions?.metrics ?? []).map((metric) => metric.name)] as const)
      .catch(() => [id, []] as const)))
      .then((pairs) => { if (active) setMetricNames((held) => ({ ...held, ...Object.fromEntries(pairs) })); });
    return () => { active = false; };
  }, [tasks]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) return <><div className="crumbs"><Link href="/projects">我的案子</Link></div><div className="card"><p className="error">{loadError}</p></div></>;
  if (!project || !analyses) return <div className="card"><p>載入中…</p></div>;
  const word = holderWord(project.is_case);   // 案子 or 分析 (ENTRY_SLICE1 item 7)
  const here = thisHolder(project.is_case);
  const latest = analyses[0];
  const latestDone = analyses.find((item) => item.status === "DONE");
  const methods = project.methods ?? [];
  const today = todayIso();
  const openTasks = tasks.filter((task) => !task.done);
  const dueReruns = reruns.filter((item) => !item.fulfilled_by && item.due <= today);

  const setStatus = async (task: Task, status: TaskStatus) => {
    setActionError("");
    try {
      await apiFetch(`${base}/tasks/${encodeURIComponent(task.task_id)}`, { method: "POST", body: JSON.stringify({ status }) });
      await load();
    } catch (reason) {
      setActionError(humanError(reason));
    }
  };
  // N-84: the plan's owner/due are the user's to fill; a task the plan left blank can still be filled in here, later
  const fillIn = async (task: Task, patch: { owner?: string; due?: string }) => {
    setActionError("");
    try {
      await apiFetch(`${base}/tasks/${encodeURIComponent(task.task_id)}`, { method: "POST", body: JSON.stringify(patch) });
      await load();
    } catch (reason) {
      setActionError(humanError(reason));
    }
  };
  // N-83: the name stays editable after creation (create_project's tool+time default is not a dead end).
  const rename = async () => {
    const name = projectName.trim();
    if (!name || name === project.name) return;
    setRenaming(true); setRenameError("");
    try {
      const updated = await apiFetch<Project>(base, { method: "PATCH", body: JSON.stringify({ name }) });
      setProject(updated); setProjectName(updated.name);
    } catch (reason) { setRenameError(humanError(reason)); }
    finally { setRenaming(false); }
  };
  // N-65: DELETE lived only on a DONE result's ⑨; the project page and 我的案子 had no way in at all.
  const erase = async () => {
    if (!window.confirm(`刪除${word}「${project.name}」？來源與所有產出一起刪掉，留一筆「已抹除」。這不能復原。`)) return;
    setDeleteError("");
    try { await apiFetch(base, { method: "DELETE" }); window.location.assign("/projects"); }
    catch (reason) { setDeleteError(humanError(reason)); }
  };
  // N-85: paste-text add, same shape RunPage's newProject() already sends (Confidential, this app's one classification).
  const addSource = async () => {
    const title = sourceTitle.trim();
    const content = sourceContent.trim();
    if (!title || !content) return;
    setAddingSource(true); setSourceError("");
    try {
      const created = await apiFetch<Source>(`${base}/sources`, { method: "POST", body: JSON.stringify({ title, media_type: "text/plain", data_classification: "Confidential", content }) });
      setSources((held) => [created, ...(held ?? [])]); setSourceTitle(""); setSourceContent("");
    } catch (reason) { setSourceError(humanError(reason)); }
    finally { setAddingSource(false); }
  };

  // 一筆任務紀錄 (寫一筆紀錄): 實際狀況／想法／調整方針／卡住了／實際數字, at least one required (server checks it).
  const draftFor = (taskId: string): NoteDraft => noteDrafts[taskId] ?? EMPTY_NOTE;
  const setDraft = (taskId: string, patch: Partial<NoteDraft>) => setNoteDrafts((held) => ({ ...held, [taskId]: { ...draftFor(taskId), ...patch } }));
  const addNumber = (taskId: string, name: string) => { const rows = draftFor(taskId).numbers; if (rows.length < 5) setDraft(taskId, { numbers: [...rows, { name, value: "", unit: "" }] }); };
  const updateNumber = (taskId: string, index: number, patch: Partial<NumberDraft>) => setDraft(taskId, { numbers: draftFor(taskId).numbers.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  const removeNumber = (taskId: string, index: number) => setDraft(taskId, { numbers: draftFor(taskId).numbers.filter((_, i) => i !== index) });
  const submitNote = async (task: Task) => {
    const draft = draftFor(task.task_id);
    setNoteErrors((held) => ({ ...held, [task.task_id]: "" }));
    setNoteBusy((held) => ({ ...held, [task.task_id]: true }));
    try {
      const numbers = draft.numbers
        .filter((row) => row.name.trim() && row.value.trim() !== "" && !Number.isNaN(Number(row.value)))
        .map((row) => ({ name: row.name.trim(), value: Number(row.value), unit: row.unit.trim() }));
      await apiFetch(`${base}/tasks/${encodeURIComponent(task.task_id)}/notes`, {
        method: "POST", body: JSON.stringify({
          happened: draft.happened.trim(), thoughts: draft.thoughts.trim(), adjustment: draft.adjustment.trim(), blocker: draft.blocker.trim(),
          numbers, ...(draft.next_check ? { next_check: draft.next_check } : {}),
        }),
      });
      setNoteDrafts((held) => ({ ...held, [task.task_id]: EMPTY_NOTE }));
      await load();
    } catch (reason) { setNoteErrors((held) => ({ ...held, [task.task_id]: humanError(reason) })); }
    finally { setNoteBusy((held) => ({ ...held, [task.task_id]: false })); }
  };

  // 從一張任務卡新增任務，或新增一個「調整方案」子任務（自動存一筆調整方針的紀錄）。
  const childDraftFor = (taskId: string): ChildDraft => childDrafts[taskId] ?? EMPTY_CHILD;
  const setChildDraft = (taskId: string, patch: Partial<ChildDraft>) => setChildDrafts((held) => ({ ...held, [taskId]: { ...childDraftFor(taskId), ...patch } }));
  const addChild = async (parent: Task, mode: "task" | "plan_change") => {
    const draft = childDraftFor(parent.task_id);
    const title = draft.title.trim();
    if (!title) return;
    setChildErrors((held) => ({ ...held, [parent.task_id]: "" }));
    setChildBusy((held) => ({ ...held, [parent.task_id]: true }));
    try {
      const due = mode === "task" ? draft.due : today;
      // POST /tasks returns the whole project's tasks, oldest first (repo.tasks()) -- the one just created is the last.
      const created = await apiFetch<Task[]>(`${base}/tasks`, { method: "POST", body: JSON.stringify({ parent_task_id: parent.task_id, kind: mode, tasks: [{ title, due }] }) });
      if (mode === "plan_change" && draft.note.trim()) {
        await apiFetch(`${base}/tasks/${encodeURIComponent(created[created.length - 1].task_id)}/notes`, { method: "POST", body: JSON.stringify({ adjustment: draft.note.trim() }) });
      }
      setChildDrafts((held) => ({ ...held, [parent.task_id]: EMPTY_CHILD }));
      await load();
    } catch (reason) { setChildErrors((held) => ({ ...held, [parent.task_id]: humanError(reason) })); }
    finally { setChildBusy((held) => ({ ...held, [parent.task_id]: false })); }
  };

  // 現在重跑並比較 (always available, not only once due): reuse an open reminder for the latest DONE analysis, or
  // schedule one due today -- either way the rerun stays in this project and the two runs compare side by side.
  const rerunNow = async () => {
    if (!latestDone) return;
    setRerunNowError(""); setRerunNowBusy(true);
    try {
      const open = reruns.find((item) => item.interpretation_id === latestDone.interpretation_id && !item.fulfilled_by);
      const rerunId = open ? open.rerun_id : (await apiFetch<Rerun>(`/interpretations/${encodeURIComponent(latestDone.interpretation_id)}/rerun`, { method: "POST", body: JSON.stringify({ due: today }) })).rerun_id;
      window.location.assign(`${analysisHref(project.project_id, latestDone.interpretation_id)}?rerun=${encodeURIComponent(rerunId)}`);
    } catch (reason) { setRerunNowError(humanError(reason)); setRerunNowBusy(false); }
  };

  // 歷程: the raw event log, plus sources (their own aggregate, not this one) and fulfilled reruns (already read back
  // with both ids), merged into one list, newest first.
  const taskTitle = (id: string) => tasks.find((task) => task.task_id === id)?.title ?? "這個任務";
  const historyLines: Array<{ key: string; at: string; node: React.ReactNode }> = [];
  for (const event of history) {
    const payload = event.payload ?? {};
    const at = event.occurred_at;
    const push = (node: React.ReactNode) => historyLines.push({ key: event.event_id, at, node });
    switch (event.event_type) {
      case "InterpretationRequested": push(<>開始分析：{payload.method_id ? toolLabel(names, payload.method_id) : "工具"}</>); break;
      case "InterpretationCreated": push(<>分析完成：<Link href={analysisHref(project.project_id, payload.interpretation_id)}>看結果 →</Link></>); break;
      case "InterpretationFailed": push(<>分析沒有完成：{failureReason(payload.error)}</>); break;
      case "InterpretationApproved": push(<>核准{payload.by_name ? `：${payload.by_name}` : ""}</>); break;
      case "InterpretationReturned": push(<>退回{payload.reason ? `：${payload.reason}` : ""}</>); break;
      case "RerunScheduled": push(<>排定重跑：{payload.due} 到期</>); break;
      case "ProjectRenamed": push(<>改名為「{payload.name}」</>); break;
      case "TaskCreated": push(<>新增{payload.kind === "plan_change" ? "調整方案" : "任務"}：{payload.title}</>); break;
      case "TaskDone": push(<>{taskTitle(payload.task_id)}：{payload.done ? "標記完成" : "取消完成"}</>); break;
      case "TaskUpdated": if (payload.status) push(<>{taskTitle(payload.task_id)} 狀態改成「{TASK_STATUS[payload.status as TaskStatus] ?? payload.status}」</>); break;
      case "TaskNoted": {
        const parts: string[] = [];
        if (payload.happened) parts.push(`實際狀況：${payload.happened}`);
        if (payload.thoughts) parts.push(`想法：${payload.thoughts}`);
        if (payload.adjustment) parts.push(`調整方針：${payload.adjustment}`);
        if (payload.blocker) parts.push(`卡住了：${payload.blocker}`);
        if ((payload.numbers ?? []).length) parts.push(`實際數字：${(payload.numbers as TaskNumber[]).map((number) => `${number.name} ${number.value}${number.unit || ""}`).join("、")}`);
        push(<>{taskTitle(payload.task_id)} 寫了一筆紀錄{parts.length ? `：${parts.join("；")}` : ""}</>);
        break;
      }
      default: break;
    }
  }
  for (const source of sources ?? []) historyLines.push({ key: `source:${source.source_id}`, at: source.created_at, node: <>新增來源：{source.title}</> });
  for (const item of reruns) if (item.fulfilled_by && item.fulfilled_at) historyLines.push({ key: `rerun:${item.rerun_id}`, at: item.fulfilled_at, node: <>重跑完成，<Link href={compareHref(project.project_id, item.interpretation_id, item.fulfilled_by)}>並排比較 →</Link></> });
  historyLines.sort((a, b) => b.at.localeCompare(a.at));

  // 實際數字 per metric name across every task's journal, charted once a name has at least two values.
  const metricSeries: TrendSeries[] = (() => {
    const byName = new Map<string, TrendSeries>();
    for (const task of tasks) for (const note of task.notes ?? []) for (const number of note.numbers ?? []) {
      const series = byName.get(number.name) ?? { name: number.name, unit: number.unit || "", points: [] };
      series.points.push({ label: note.at.slice(0, 10), value: number.value, citation: "" });
      if (!series.unit && number.unit) series.unit = number.unit;
      byName.set(number.name, series);
    }
    return [...byName.values()].filter((series) => series.points.length >= 2);
  })();

  const renderTask = (task: Task, isChild: boolean): React.ReactNode => {
    const status: TaskStatus = task.status ?? (task.done ? "done" : "not_started");
    const overdue = status !== "done" && Boolean(task.due) && task.due < today;
    const draft = draftFor(task.task_id);
    const child = childDraftFor(task.task_id);
    const suggestions = task.interpretation_id ? metricNames[task.interpretation_id] ?? [] : [];
    const notes = [...(task.notes ?? [])].reverse();
    return <div className={`tcard${isChild ? " child" : ""}`} key={task.task_id}>
      <div className="head"><b>{task.kind === "plan_change" ? "調整方案：" : ""}{task.title}</b>{task.when && <span className="sub">{task.when}</span>}</div>
      <div className="meta">
        <span className={overdue ? "warn" : undefined}>期限：{task.due ? <>{task.due}{overdue ? "（逾期）" : ""}</> : <input aria-label={`期限：${task.title}`} type="date" min={today} onBlur={(event) => { if (event.target.value) fillIn(task, { due: event.target.value }); }} />}</span>
        <span>負責人：{task.owner || <input aria-label={`負責人：${task.title}`} placeholder="待填" onBlur={(event) => { const value = event.target.value.trim(); if (value) fillIn(task, { owner: value }); }} />}</span>
        {task.proof && <span>怎麼證明有效：{task.proof}</span>}
        {task.target && <span>目標：{task.target}</span>}
      </div>
      <div className="btns mt6">{TASK_STATUS_LIST.map((value) => <button type="button" key={value} className={`btn${status === value ? " primary" : ""}`} aria-pressed={status === value} onClick={() => setStatus(task, value)}>{TASK_STATUS[value]}</button>)}</div>
      <details className="mt8"><summary>寫一筆紀錄</summary>
        <div className="mt6"><textarea aria-label={`實際狀況：${task.title}`} placeholder="實際狀況" value={draft.happened} onChange={(event) => setDraft(task.task_id, { happened: event.target.value })} /></div>
        <div className="mt6"><textarea aria-label={`想法：${task.title}`} placeholder="想法" value={draft.thoughts} onChange={(event) => setDraft(task.task_id, { thoughts: event.target.value })} /></div>
        <div className="mt6"><textarea aria-label={`調整方針：${task.title}`} placeholder="調整方針" value={draft.adjustment} onChange={(event) => setDraft(task.task_id, { adjustment: event.target.value })} /></div>
        <div className="mt6"><textarea aria-label={`卡住了：${task.title}`} placeholder="卡住了／需要誰" value={draft.blocker} onChange={(event) => setDraft(task.task_id, { blocker: event.target.value })} /></div>
        {draft.numbers.map((row, index) => <div className="btns mt6" key={index}>
          <input aria-label={`數字名稱 ${index + 1}：${task.title}`} placeholder="名稱" value={row.name} onChange={(event) => updateNumber(task.task_id, index, { name: event.target.value })} />
          <input aria-label={`數值 ${index + 1}：${task.title}`} type="number" step="any" placeholder="數值" value={row.value} onChange={(event) => updateNumber(task.task_id, index, { value: event.target.value })} />
          <input aria-label={`單位 ${index + 1}：${task.title}`} placeholder="單位" value={row.unit} onChange={(event) => updateNumber(task.task_id, index, { unit: event.target.value })} />
          <button type="button" className="btn ghost" onClick={() => removeNumber(task.task_id, index)}>移除這個數字</button>
        </div>)}
        {suggestions.length > 0 && <div className="chips mt6">{suggestions.map((name) => <button type="button" key={name} className="chip" onClick={() => addNumber(task.task_id, name)}>{name}</button>)}</div>}
        <div className="btns mt6">
          <button type="button" className="btn ghost" disabled={draft.numbers.length >= 5} onClick={() => addNumber(task.task_id, "")}>加一個實際數字</button>
          <label className="sub">下次追蹤 <input aria-label={`下次追蹤：${task.title}`} type="date" min={today} value={draft.next_check} onChange={(event) => setDraft(task.task_id, { next_check: event.target.value })} /></label>
        </div>
        <div className="btns mt6"><button type="button" className="btn primary" disabled={noteBusy[task.task_id]} onClick={() => submitNote(task)}>存這筆紀錄</button></div>
        {noteErrors[task.task_id] && <p className="error" role="alert">{noteErrors[task.task_id]}</p>}
      </details>
      {notes.length > 0 && <div className="tnotes mt8">{notes.map((note) => <div className="tnote" key={note.note_id}>
        <div className="sub">{formatTime(note.at)}</div>
        {note.happened && <div><b>實際狀況</b>{note.happened}</div>}
        {note.thoughts && <div><b>想法</b>{note.thoughts}</div>}
        {note.adjustment && <div><b>調整方針</b>{note.adjustment}</div>}
        {note.blocker && <div><b>卡住了</b>{note.blocker}</div>}
        {note.numbers.length > 0 && <div><b>實際數字</b>{note.numbers.map((number) => `${number.name} ${number.value}${number.unit || ""}`).join("、")}</div>}
        {note.next_check && <div className="sub">下次追蹤：{note.next_check}</div>}
      </div>)}</div>}
      <div className="btns mt8">
        <button type="button" className="btn ghost" onClick={() => setChildDraft(task.task_id, { ...EMPTY_CHILD, mode: child.mode === "task" ? null : "task" })}>從這張卡新增任務</button>
        <button type="button" className="btn ghost" onClick={() => setChildDraft(task.task_id, { ...EMPTY_CHILD, mode: child.mode === "plan_change" ? null : "plan_change" })}>調整方案</button>
      </div>
      {child.mode === "task" && <div className="mt6">
        <input aria-label={`新任務標題：${task.title}`} placeholder="新任務標題" value={child.title} onChange={(event) => setChildDraft(task.task_id, { title: event.target.value })} />
        <input aria-label={`新任務期限：${task.title}`} type="date" min={today} value={child.due} onChange={(event) => setChildDraft(task.task_id, { due: event.target.value })} />
        <div className="btns mt6"><button type="button" className="btn primary" disabled={!child.title.trim() || !child.due || childBusy[task.task_id]} onClick={() => addChild(task, "task")}>新增任務</button></div>
        {childErrors[task.task_id] && <p className="error" role="alert">{childErrors[task.task_id]}</p>}
      </div>}
      {child.mode === "plan_change" && <div className="mt6">
        <input aria-label={`調整方案標題：${task.title}`} placeholder="調整方案標題" value={child.title} onChange={(event) => setChildDraft(task.task_id, { title: event.target.value })} />
        <textarea aria-label={`調整方案說明：${task.title}`} placeholder="為什麼要調整" value={child.note} onChange={(event) => setChildDraft(task.task_id, { note: event.target.value })} />
        <div className="btns mt6"><button type="button" className="btn primary" disabled={!child.title.trim() || childBusy[task.task_id]} onClick={() => addChild(task, "plan_change")}>新增調整方案</button></div>
        {childErrors[task.task_id] && <p className="error" role="alert">{childErrors[task.task_id]}</p>}
      </div>}
      {tasks.filter((item) => item.parent_task_id === task.task_id).map((subtask) => renderTask(subtask, true))}
    </div>;
  };

  return <>
    <div className="crumbs"><Link href="/projects">{project.is_case ? "我的案子" : "我的分析"}</Link> › {project.name}</div>
    <div className="card">
      <div className="top">
        <h1>{project.name}</h1>
        <div className="btns">
          <input type="text" aria-label={`${word}名稱`} value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          <button type="button" className="btn ghost" disabled={renaming || !projectName.trim() || projectName.trim() === project.name} onClick={rename}>重新命名</button>
          <button type="button" className="btn ghost" onClick={erase}>刪除{word}</button>
        </div>
      </div>
      {renameError && <p className="error" role="alert">改名沒有成功：{renameError}</p>}
      {deleteError && <p className="error" role="alert">刪除沒有成功：{deleteError}</p>}
      {project.purpose && <div className="sub">{project.purpose}</div>}
      <div className="status">
        <span className="pill">{standing(latest)}</span>
        <span>建立 {formatTime(project.created_at)}</span>
        <span>最後更新 {formatTime(project.updated_at ?? project.created_at)}</span>
        <span>分析 {analyses.length} 次</span>
        <span>任務 {openTasks.length} 個進行中{openTasks.some((task) => task.due && task.due < today) ? `・${openTasks.filter((task) => task.due && task.due < today).length} 個逾期` : ""}</span>
        <span>來源 {sources?.length ?? 0} 筆</span>
      </div>
      {/* The case's 14 slots (one per block) replace the old 建立→蒐集→彙整→分析→報表→核准 bar: the contract card 共用紀錄
          says a personal case does not end in 核准. */}
      <CaseSlots projectId={project.project_id} />
      <div className="btns"><Link className="btn" href={`/projects/${encodeURIComponent(project.project_id)}/start`}>開案資料：目的、風險、誰會受影響、這次走哪幾塊 →</Link></div>
      <div className="how"><b>怎麼讀</b>{here}走到哪：每一次分析（新的在上面）、存下來的任務、到期要重跑的提醒；時間是你這裡的時間，到分鐘。<b>你要做的</b>按「看結果」打開那一次的完整結果；到期的提醒按「重跑並比較」；任務卡上按狀態按鈕更新進度。</div>
      {dueReruns.map((item) => <div className="finding warn" key={item.rerun_id}><b>到期了（{item.due}）：用新資料重跑並比較</b>打開 {formatTime(item.scheduled_at).slice(0, 10)} 排的那一次分析，更新格子裡的數字，按「執行分析」；跑完兩次會並排比較。<div className="btns mt6"><Link className="btn primary" href={`${analysisHref(project.project_id, item.interpretation_id)}?rerun=${encodeURIComponent(item.rerun_id)}`}>重跑並比較 →</Link></div></div>)}
    </div>
    <div className="card">
      <h2>{project.is_case ? "這個案子的分析" : "分析紀錄"}<small>{analyses.length ? `${analyses.length} 次，新的在上面・AI 做的，不是你的判斷` : "還沒有"}</small></h2>
      {analyses.length ? <div className="scroll-x">
        <table>
          <thead><tr><th>開始</th><th>工具</th><th>狀態</th><th>你的判斷</th><th>核准</th><th></th></tr></thead>
          <tbody>{analyses.map((item) => { const redoes = item.revision_of ?? reruns.find((rerun) => rerun.fulfilled_by === item.interpretation_id)?.interpretation_id;
            return <tr key={item.interpretation_id}>
              <td>{formatTime(item.requested_at)}</td>
              <td>{item.method_id ? <Link href={toolHref(item.method_id)}>{toolLabel(names, item.method_id)}</Link> : "—"}{redoes ? <><br /><span className="sub">{item.revision_of ? "依退回原因重做" : "到期重跑"}</span></> : null}</td>
              <td>{STATUS[item.status]}{item.status === "DONE" && item.finished_at ? `（${formatTime(item.finished_at).slice(11)} 完成）` : ""}{item.status === "FAILED" && item.error ? <details><summary>原因</summary>{item.error}</details> : null}</td>
              <td>{item.judgment ? STANCE[item.judgment] : "尚未填"}</td>
              <td>{item.approval?.decision === "approve" ? `已核准（${item.approval.by_name ?? ""}）` : item.approval?.decision === "return" ? "已退回" : item.status === "DONE" ? "尚未核准" : "—"}</td>
              <td><Link className={`btn${item === latest && item.status === "DONE" ? " primary" : ""}`} href={analysisHref(project.project_id, item.interpretation_id)}>{OPEN[item.status]}</Link>{redoes && item.status === "DONE" && <> <Link className="btn ghost" href={compareHref(project.project_id, redoes, item.interpretation_id)}>和上一版比較</Link></>}</td>
            </tr>; })}</tbody>
        </table>
      </div> : <p className="sub">這裡還沒有分析。</p>}
      <div className="btns mt10">
        {methods.map((id) => <Link key={id} className="btn" href={runHref(id, project.project_id)}>在{here}再用「{toolLabel(names, id)}」分析一次</Link>)}
        {!methods.length && <Link className="btn" href="/methods">到「工具」挑一個開始（結果會另存在「我的分析」）</Link>}
      </div>
    </div>
    <div className="card" id="sources">
      <h2>來源<small>{sources ? `${sources.length} 筆` : "載入中"}</small></h2>
      <div className="how"><b>怎麼讀</b>{here}存的外部來源：標題、存入時間；分析會引用這裡的內容。<b>你要做的</b>要新增就貼上文字和標題；要看內容按「看內容」。</div>
      {sources && sources.length > 0 ? <ul>{sources.map((item) => <li key={item.source_id}>{item.title}（{formatTime(item.created_at)}）<a href={`/api/projects/${encodeURIComponent(project.project_id)}/sources/${encodeURIComponent(item.source_id)}/content`} target="_blank" rel="noreferrer">看內容 →</a></li>)}</ul> : <p className="sub">這裡還沒有來源。</p>}
      <details className="mb8"><summary>貼上文字，新增一筆來源</summary>
        <div className="mt6"><input type="text" aria-label="來源標題" placeholder="標題" value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} /></div>
        <div className="mt6"><textarea aria-label="來源內容" placeholder="貼上內容" value={sourceContent} onChange={(event) => setSourceContent(event.target.value)} /></div>
        <div className="btns mt6"><button type="button" className="btn" disabled={addingSource || !sourceTitle.trim() || !sourceContent.trim()} onClick={addSource}>新增來源</button></div>
        {sourceError && <p className="error" role="alert">{sourceError}</p>}
      </details>
    </div>
    <div className="card">
      <h2>任務<small>{tasks.length ? `${openTasks.length} 個進行中・${tasks.length - openTasks.length} 個做完` : "還沒有"}</small></h2>
      <div className="how"><b>怎麼讀</b>⑦ 的行動計畫存下來的任務，和你自己加的：狀態、負責人、期限（逾期標紅）、每一筆紀錄。<b>你要做的</b>按狀態按鈕更新進度；「寫一筆紀錄」留下實際狀況和數字；沒有任務就到分析結果的 ⑦ 按「存成任務」，或在任一張卡下面「從這張卡新增任務」。</div>
      {tasks.length ? <div className="tasks">{tasks.filter((task) => !task.parent_task_id).map((task) => renderTask(task, false))}</div> : <p className="sub mb0">還沒有任務。</p>}
      {actionError && <p className="error" role="alert">任務沒有更新：{actionError}</p>}
    </div>
    {(latestDone || reruns.length > 0) && <div className="card">
      <h2>到期重跑<small>{reruns.filter((item) => !item.fulfilled_by).length} 個等著</small></h2>
      <div className="how"><b>怎麼讀</b>⑦ 排的提醒：到期日、答覆它的那一次分析。<b>你要做的</b>到期時按「重跑並比較」；也可以隨時按「現在重跑並比較」——重跑留在同一個地方，跟這次並排比較，不會另外多開一份。</div>
      {latestDone && <div className="btns mt6"><button type="button" className="btn" disabled={rerunNowBusy} onClick={rerunNow}>現在重跑並比較 →</button></div>}
      {rerunNowError && <p className="error" role="alert">{rerunNowError}</p>}
      {reruns.length > 0 && <ul>{reruns.map((item) => <li key={item.rerun_id}>{item.due}：{item.fulfilled_by ? <>已重跑，<Link href={compareHref(project.project_id, item.interpretation_id, item.fulfilled_by)}>並排比較 →</Link></> : item.due <= today ? <Link href={`${analysisHref(project.project_id, item.interpretation_id)}?rerun=${encodeURIComponent(item.rerun_id)}`}>到期了，重跑並比較 →</Link> : "還沒到期"}</li>)}</ul>}
    </div>}
    {project.is_case && <ProcessFacts path={base} projectId={project.project_id} />}
    <div className="card">
      <h2>歷程<small>{historyLines.length ? `${historyLines.length} 筆，新的在上面` : "還沒有"}</small></h2>
      <div className="how"><b>怎麼讀</b>{here}從建立到現在的每一步，新的在上面。<b>你要做的</b>不用做；想看細節就點連結。</div>
      {historyLines.length ? <ul>{historyLines.map((line) => <li key={line.key}>{formatTime(line.at)}：{line.node}</li>)}</ul> : <p className="sub mb0">還沒有記錄。</p>}
      {metricSeries.length > 0 && <div className="charts mt10">{metricSeries.map((series) => <figure key={series.name}><figcaption><b>{series.name}</b> 隨時間的變化</figcaption><TrendChart series={[series]} cite={() => ""} /></figure>)}</div>}
    </div>
  </>;
}
