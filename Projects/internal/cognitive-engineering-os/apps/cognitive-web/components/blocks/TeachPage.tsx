"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { AUTHOR, ai, docs, type Doc, type Notice } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { Notices } from "./BlockShell";

export type Lesson = {
  id: string;
  subject: string;
  version: number;
  state: "draft" | "reviewed";
  minutes: number;
  title: string;
  text: string;
  example: string;
  teaches: string[];
  label?: string;
  course?: { package: string; order: number };
};

export type PracticeCase = {
  id: string;
  version: number;
  title: string;
  text: string;
  place: string;
  source: { kind: "publisher" | "source_card"; name: string; checked_on: string };
};

type TeachRun = { lesson: string; lesson_version: number; practice_case: string; role: string; notes?: string };
type AfterActionReview = { predicted: string; happened: string; missed_context?: string; change_next_time?: string };
type Opponent = { challenge: string; question?: string };
type MoveFeedback = { move: string; feedback: string; next_practice?: string };
type Feedback = { move_feedback: MoveFeedback[] };
type Completion = { course: string; lesson_versions: Record<string, number>; at: string };
type CompletionPreference = { keep: boolean; declined?: string[] };
type PracticeResponse = { cases: PracticeCase[]; place: string | null; fallback: boolean; message: string };
type TeachNotice = Notice | { type: "teach_completion"; notice: string };

export const TEACH_ROLES = ["提出者", "反方", "證據稽核者", "決策者", "回顧者"] as const;
const EMPTY_AAR: AfterActionReview = { predicted: "", happened: "", missed_context: "", change_next_time: "" };

const hasText = (value: AfterActionReview) => Object.values(value).some((item) => Boolean(item?.trim()));
const sameRun = (run: Doc<TeachRun> | null, lesson: Lesson | undefined, practiceCase: PracticeCase | undefined, role: string) => Boolean(
  run && lesson && practiceCase && run.content.lesson === lesson.id && run.content.lesson_version === lesson.version
    && run.content.practice_case === practiceCase.id && run.content.role === role,
);

function AuthorTag({ doc }: { doc: Doc }) {
  return <span className="tags"><span>{AUTHOR[doc.author]}</span></span>;
}

function LessonPanel({ lesson }: { lesson: Lesson }) {
  return (
    <section className="card teach-lesson">
      <div className="top">
        <h2>{lesson.title}</h2>
        {lesson.state === "draft" && <span className="tag">草稿</span>}
      </div>
      <div className="status"><span>{lesson.minutes} 分鐘</span><span>第 {lesson.version} 版</span></div>
      <p>{lesson.text}</p>
      <div className="filled"><span className="lab">例子</span>{lesson.example}</div>
      <p className="sub">這堂課會練：{lesson.teaches.join("、")}</p>
    </section>
  );
}

function CasePanel({ practiceCase }: { practiceCase: PracticeCase }) {
  return (
    <div className="filled teach-case">
      <span className="lab">練習案例</span>
      <b>{practiceCase.title}</b>
      <p className="mb0">{practiceCase.text}</p>
      <p className="sub mb0">來源：{practiceCase.source.name}。{practiceCase.source.checked_on === "尚未查核" ? "查核狀態：尚未查核。" : `查核日期：${practiceCase.source.checked_on}。`}</p>
    </div>
  );
}

export function TeachPage() {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [practiceCases, setPracticeCases] = useState<PracticeCase[]>([]);
  const [caseMessage, setCaseMessage] = useState("");
  const [run, setRun] = useState<Doc<TeachRun> | null>(null);
  const [aarDoc, setAarDoc] = useState<Doc<AfterActionReview> | null>(null);
  const [completions, setCompletions] = useState<Doc<Completion>[]>([]);
  const [completionPreference, setCompletionPreference] = useState<Doc<CompletionPreference> | null>(null);
  const [opponent, setOpponent] = useState<Doc<Opponent> | null>(null);
  const [feedback, setFeedback] = useState<Doc<Feedback> | null>(null);
  const [subject, setSubject] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [practiceCaseId, setPracticeCaseId] = useState("");
  const [role, setRole] = useState<(typeof TEACH_ROLES)[number]>(TEACH_ROLES[0]);
  const [notes, setNotes] = useState("");
  const [aarForm, setAarForm] = useState<AfterActionReview>(EMPTY_AAR);
  const [dirty, setDirty] = useState(false);
  const [skippedLessonId, setSkippedLessonId] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [completionNotice, setCompletionNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [lessonRows, caseResult, runRows, aarRows, completionRows, preferenceRows, opponentRows, feedbackRows] = await Promise.all([
      apiFetch<Lesson[]>("/blocks/teach/lessons"),
      apiFetch<PracticeResponse>("/blocks/teach/practice-cases"),
      docs.list<TeachRun>(null, "teach.run"),
      docs.list<AfterActionReview>(null, "teach.aar"),
      docs.list<Completion>(null, "teach.completion"),
      docs.list<CompletionPreference>(null, "teach.completion_preference"),
      docs.list<Opponent>(null, "teach.opponent"),
      docs.list<Feedback>(null, "teach.feedback"),
    ]);
    const nextRun = runRows.at(-1) ?? null;
    const initialLesson = lessonRows.find((item) => item.id === nextRun?.content.lesson) ?? lessonRows[0];
    setLessons(lessonRows);
    setPracticeCases(caseResult.cases);
    setCaseMessage(caseResult.message);
    setRun(nextRun);
    setAarDoc(aarRows.at(-1) ?? null);
    setAarForm((current) => (hasText(current) ? current : aarRows.at(-1)?.content ?? EMPTY_AAR));
    setCompletions(completionRows);
    setCompletionPreference(preferenceRows.at(-1) ?? null);
    setOpponent(opponentRows.at(-1) ?? null);
    setFeedback(feedbackRows.at(-1) ?? null);
    setSubject((current) => current || initialLesson?.subject || "");
    setLessonId((current) => current || initialLesson?.id || "");
    setPracticeCaseId((current) => current || nextRun?.content.practice_case || caseResult.cases[0]?.id || "");
    setRole((current) => (nextRun?.content.role as (typeof TEACH_ROLES)[number]) || current);
    setNotes((current) => current || nextRun?.content.notes || "");
  };

  useEffect(() => { load().catch((reason) => setError(humanError(reason))); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleLessons = useMemo(() => lessons?.filter((lesson) => lesson.subject === subject) ?? [], [lessons, subject]);
  const lesson = lessons?.find((item) => item.id === lessonId);
  const practiceCase = practiceCases.find((item) => item.id === practiceCaseId);
  const runReady = sameRun(run, lesson, practiceCase, role) && !dirty;
  const subjects = useMemo(() => [...new Set((lessons ?? []).map((item) => item.subject))], [lessons]);

  const act = async (work: () => Promise<void>) => {
    setError(""); setBusy(true);
    try { await work(); await load(); } catch (reason) { setError(humanError(reason)); } finally { setBusy(false); }
  };

  const chooseSubject = (next: string) => {
    const first = lessons?.find((item) => item.subject === next);
    setSubject(next); setLessonId(first?.id ?? ""); setSkippedLessonId(""); setDirty(true); setOpponent(null); setFeedback(null);
  };
  const chooseLesson = (next: string) => { setLessonId(next); setSkippedLessonId(""); setDirty(true); setOpponent(null); setFeedback(null); };
  const chooseCase = (next: string) => { setPracticeCaseId(next); setDirty(true); setOpponent(null); setFeedback(null); };
  const saveRun = () => act(async () => {
    if (!lesson || !practiceCase) return;
    const content: TeachRun = { lesson: lesson.id, lesson_version: lesson.version, practice_case: practiceCase.id, role, notes: notes.trim() };
    const sameLesson = run?.content.lesson === lesson.id && run.content.lesson_version === lesson.version;
    const saved = sameLesson ? await docs.update(null, "teach.run", run!, content) : await docs.create(null, "teach.run", content);
    setRun(saved); setDirty(false); setOpponent(null); setFeedback(null);
    const found = (saved.notices as TeachNotice[]).find((notice) => notice.type === "teach_completion");
    setCompletionNotice(found?.type === "teach_completion" ? found.notice : "");
    setNotices(saved.notices);
  });
  const saveAar = () => act(async () => {
    const content = { predicted: aarForm.predicted.trim(), happened: aarForm.happened.trim(), missed_context: aarForm.missed_context?.trim(), change_next_time: aarForm.change_next_time?.trim() };
    const saved = aarDoc ? await docs.update(null, "teach.aar", aarDoc, content) : await docs.create(null, "teach.aar", content);
    setAarDoc(saved); setAarForm(saved.content); setNotices(saved.notices);
  });
  const askOpponent = () => act(async () => {
    if (!run) return;
    const turn = await ai<Opponent>(null, "TEACH", "opponent", { run: run.doc_id });
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
    else if (turn.saved) setOpponent(turn.saved);
  });
  const askFeedback = () => act(async () => {
    if (!run) return;
    const turn = await ai<Feedback>(null, "TEACH", "feedback_on_moves", { run: run.doc_id });
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
    else if (turn.saved) setFeedback(turn.saved);
  });
  const restart = () => { setNotes(""); setAarForm(EMPTY_AAR); setDirty(true); setOpponent(null); setFeedback(null); setCompletionNotice(""); };
  const switchCase = () => {
    if (practiceCases.length < 2) return;
    const index = practiceCases.findIndex((item) => item.id === practiceCaseId);
    chooseCase(practiceCases[(index + 1) % practiceCases.length].id);
  };
  const toggleCompletionKeeping = () => act(async () => {
    const content = { ...completionPreference?.content, keep: !(completionPreference?.content.keep ?? true) };
    const saved = completionPreference
      ? await docs.update(null, "teach.completion_preference", completionPreference, content)
      : await docs.create(null, "teach.completion_preference", content);
    setCompletionPreference(saved);
  });
  const removeCompletion = (completion: Doc<Completion>) => act(async () => {
    await docs.remove(null, "teach.completion", completion.doc_id);
    setCompletions((current) => current.filter((item) => item.doc_id !== completion.doc_id));
  });

  if (!lessons || !lesson || !practiceCase) return <><div className="crumbs"><Link href="/projects">我的案子</Link> › 課程與演練</div><div className="card"><p>{error || "載入中…"}</p></div></>;

  return (
    <>
      <div className="crumbs"><Link href="/projects">我的案子</Link> › 課程與演練</div>
      <h1>課程與演練</h1>
      <p className="sub">先讀一堂短課，再用低風險案例練一次。練習和真實案例分開存。</p>
      <Notices notices={notices} />
      {completionNotice && <div className="card okline" role="status"><p className="mt0 mb0">{completionNotice}</p></div>}

      <div className="card">
        <h2>先選主題</h2>
        <div className="chips" role="group" aria-label="課程主題">
          {subjects.map((item) => <button key={item} type="button" className={`chip${item === subject ? " on" : ""}`} aria-pressed={item === subject} onClick={() => chooseSubject(item)}>{item}</button>)}
        </div>
        <div className="chips" role="group" aria-label="課程">
          {visibleLessons.map((item) => <button key={item.id} type="button" className={`chip${item.id === lessonId ? " on" : ""}`} aria-pressed={item.id === lessonId} onClick={() => chooseLesson(item.id)}>{item.title}{item.state === "draft" && "（草稿）"}</button>)}
        </div>
      </div>

      <div className="mcards">
        <LessonPanel lesson={lesson} />
        <section className="card teach-practice">
          <h2>練習案例</h2>
          <div className="chips" role="group" aria-label="練習案例">
            {practiceCases.map((item) => <button key={item.id} type="button" className={`chip${item.id === practiceCaseId ? " on" : ""}`} aria-pressed={item.id === practiceCaseId} onClick={() => chooseCase(item.id)}>{item.title}</button>)}
          </div>
          {caseMessage && <p className="hint">{caseMessage}</p>}
          <CasePanel practiceCase={practiceCase} />
          <div className="field">
            <b>這一輪你先當哪個角色</b>
            <div className="chips" role="group" aria-label="練習角色">
              {TEACH_ROLES.map((item) => <button key={item} type="button" className={`chip${item === role ? " on" : ""}`} aria-pressed={item === role} onClick={() => { setRole(item); setDirty(true); setOpponent(null); setFeedback(null); }}>{item}</button>)}
            </div>
            <label htmlFor="teach-notes">寫下你的想法</label>
            <textarea id="teach-notes" value={notes} maxLength={4000} onChange={(event) => { setNotes(event.target.value); setDirty(true); }} />
            <div className="btns"><button className="btn primary" type="button" disabled={busy || !lesson || !practiceCase} onClick={saveRun}>{busy ? "存檔中…" : "存這次練習"}</button></div>
          </div>
          <div className="btns mt8"><button className="btn" type="button" disabled={busy || !runReady} onClick={askOpponent}>請 AI 當練習對手</button><button className="btn" type="button" disabled={busy || !runReady} onClick={askFeedback}>請 AI 看思考動作</button></div>
          <div className="grid mt8">
            <div className="filled"><span className="lab">你寫的</span>{notes.trim() || "還沒有寫下想法。"}</div>
            {(opponent || feedback) && <div className="finding">
              <AuthorTag doc={(opponent ?? feedback)!} />
              {opponent && <><p>{opponent.content.challenge}</p>{opponent.content.question && <p className="hint">AI 問你：{opponent.content.question}</p>}</>}
              {feedback && feedback.content.move_feedback.map((item) => <div key={item.move}><p><b>{item.move}</b>：{item.feedback}</p>{item.next_practice && <p className="hint">下一次可以練：{item.next_practice}</p>}</div>)}
            </div>}
          </div>
        </section>
      </div>

      <div className="card cta">
        <h2>練完後回頭看</h2>
        <p className="how">把你原本怎麼想、後來發生什麼、漏掉的脈絡和下次要改的地方分開寫。</p>
        <label htmlFor="teach-predicted">原本預測什麼</label><textarea id="teach-predicted" value={aarForm.predicted} onChange={(event) => setAarForm({ ...aarForm, predicted: event.target.value })} />
        <label htmlFor="teach-happened">實際發生什麼</label><textarea id="teach-happened" value={aarForm.happened} onChange={(event) => setAarForm({ ...aarForm, happened: event.target.value })} />
        <label htmlFor="teach-missed">漏看的脈絡</label><textarea id="teach-missed" value={aarForm.missed_context ?? ""} onChange={(event) => setAarForm({ ...aarForm, missed_context: event.target.value })} />
        <label htmlFor="teach-change">下次要改什麼</label><textarea id="teach-change" value={aarForm.change_next_time ?? ""} onChange={(event) => setAarForm({ ...aarForm, change_next_time: event.target.value })} />
        <div className="btns mt8"><button className="btn primary" type="button" disabled={busy || !aarForm.predicted.trim() || !aarForm.happened.trim()} onClick={saveAar}>{busy ? "存檔中…" : "存這次回顧"}</button></div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div className="card">
        <h2>你可以自己控制</h2>
        <p>你可以跳過、重來、換案例。</p>
        <div className="btns"><button className="btn ghost" type="button" onClick={() => setSkippedLessonId(lesson.id)}>跳過這堂課</button><button className="btn ghost" type="button" onClick={restart}>重來</button><button className="btn ghost" type="button" onClick={switchCase}>換案例</button></div>
        {skippedLessonId === lesson.id && <p className="hint mb0">這次先跳過這堂課。你仍然可以換一堂再練。</p>}
      </div>

      <div className="card">
        <h2>我已完成的課</h2>
        <p className="sub">完成紀錄預設保留；你可以選擇不留。</p>
        <p className="sub">刪除一門課的紀錄後，那門課不會再自動記下。</p>
        {(completionPreference?.content.declined ?? []).length > 0 && <p className="sub">不再記下的課：{completionPreference?.content.declined?.join("、")}</p>}
        <button className="btn" type="button" onClick={toggleCompletionKeeping}>{completionPreference?.content.keep === false ? "保留完成紀錄" : "不保留完成紀錄"}</button>
        {completions.length === 0 ? <p className="sub mb0">還沒有完成紀錄。</p> : <ul>{completions.map((item) => <li key={item.doc_id}>{item.content.course}：{item.content.at} <button className="btn ghost" type="button" onClick={() => removeCompletion(item)}>刪除這筆紀錄</button></li>)}</ul>}
      </div>
    </>
  );
}
