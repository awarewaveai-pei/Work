"use client";

// FACILITATE 帶領 (card 62; docs/platform/STEP34_SHARED_RULES.md §11): a leader trains, leads by the script, sees only what
// participants chose to show, logs each session, and is supervised by someone who is trained and has led. The four things a
// leader never does stay on screen the whole time. The page records how someone leads; it does not judge them, and the AI
// only points (and plays a practice participant) -- whether to change the way of leading is for the leader and the supervisor.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { AUTHOR, ai, blockOf, docs, type Doc, type Notice } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import {
  facilitate, summary, type Assignment, type Consented, type Deviation, type Feedback, type Help, type LogContent, type MaskedAppeal, type MyLink, type PracticeReply, type Pointers,
  type Script, type Scripts, type Standing, type Supervisee, type SupervisedLog,
} from "../../lib/facilitate";
import { groups, type Group, type Member } from "../../lib/groups";
import { Notices } from "./BlockShell";
import type { Lesson, PracticeCase } from "./TeachPage";

const AI_TAG = <span className="tags"><span>{AUTHOR.ai}</span></span>;
const day = (at?: string) => (at ?? "").slice(0, 10);

/** The four things a leader never does (the card's fixed list, from the API): rendered by the page whatever else it shows. */
export function Donts({ items }: { items: string[] }) {
  return (
    <div className="card accent" role="note" aria-label="不能做的事">
      <h2>帶的時候，永遠不做這幾件事</h2>
      <ol>{items.map((item) => <li key={item}>{item}</li>)}</ol>
    </div>
  );
}

/** The script's escalation sentence, with the block's code said as its name (the file says GOVERN). */
const escalationOf = (script: Script) => script.escalation.how.replace(script.escalation.who, blockOf(script.escalation.who)?.name ?? script.escalation.who);

function HelpLines({ help }: { help: Help }) {
  return (
    <div className="filled">
      <span className="lab">求助資源</span>
      <p className="mt0">{help.notice}</p>
      {help.fallback && <p className="hint">{help.fallback}</p>}
      <ul>{help.resources.map((item) => <li key={item.name}><b>{item.name}</b>：{item.contact}</li>)}</ul>
    </div>
  );
}

function useAct(setError: (text: string) => void, reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  return { busy, act: (work: () => Promise<unknown>) => async () => {
    setError(""); setBusy(true);
    try { await work(); await reload(); } catch (reason) { setError(humanError(reason)); } finally { setBusy(false); }
  } };
}

// -- practise with the AI participant ---------------------------------------------------------------------------------

type Turn = { leader: string; reply: Doc<PracticeReply> };

function Practice({ scripts }: { scripts: Script[] }) {
  const usable = scripts.filter((item) => item.usable);
  const [cases, setCases] = useState<PracticeCase[]>([]);
  const [scriptId, setScriptId] = useState(usable[0]?.id ?? "");
  const [step, setStep] = useState(1);
  const [caseId, setCaseId] = useState("");
  const [say, setSay] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { apiFetch<{ cases: PracticeCase[] }>("/blocks/teach/practice-cases").then((found) => { setCases(found.cases); setCaseId((current) => current || found.cases[0]?.id || ""); }).catch((reason) => setError(humanError(reason))); }, []);
  const script = usable.find((item) => item.id === scriptId);
  const practiceCase = cases.find((item) => item.id === caseId);
  const chooseScript = (id: string) => { setScriptId(id); setStep(1); setTurns([]); };
  const send = async () => {
    if (!script || !practiceCase) return;
    setError(""); setBusy(true);
    try {
      const turn = await ai<PracticeReply>(null, "FACILITATE", "play_participant", {
        script: script.id, step, practice_case: practiceCase.id, say: say.trim(), earlier: turns.slice(-6).map((item) => ({ leader: item.leader, participant: item.reply.content.reply })),
      });
      if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
      else if (turn.saved) { setTurns([...turns, { leader: say.trim(), reply: turn.saved }]); setSay(""); setNotices([]); }
    } catch (reason) { setError(humanError(reason)); } finally { setBusy(false); }
  };
  return (
    <section className="card">
      <h2>和 AI 練習</h2>
      <p className="sub">AI 扮演一位練習的參與者，讓你先練一步。它不帶人，也不評價你。這裡沒有真的參與者的資料。</p>
      {!script ? <p>現在還沒有審過、可以拿來練習的帶領稿。</p> : (
        <>
          <div className="chips" role="group" aria-label="練習用的帶領稿">
            {usable.map((item) => <button key={item.id} type="button" className={`chip${item.id === scriptId ? " on" : ""}`} aria-pressed={item.id === scriptId} onClick={() => chooseScript(item.id)}>{item.subject_name}</button>)}
          </div>
          <div className="chips" role="group" aria-label="練習哪一步">
            {script.steps.map((_, index) => <button key={index} type="button" className={`chip${index + 1 === step ? " on" : ""}`} aria-pressed={index + 1 === step} onClick={() => setStep(index + 1)}>第 {index + 1} 步</button>)}
          </div>
          <p className="mb0">{script.steps[step - 1].what}</p>
          <div className="chips" role="group" aria-label="練習案例">
            {cases.map((item) => <button key={item.id} type="button" className={`chip${item.id === caseId ? " on" : ""}`} aria-pressed={item.id === caseId} onClick={() => setCaseId(item.id)}>{item.title}</button>)}
          </div>
          {practiceCase && <div className="filled"><span className="lab">練習案例</span><b>{practiceCase.title}</b><p className="mb0">{practiceCase.text}</p></div>}
          {turns.map((item) => (
            <div key={item.reply.doc_id}>
              <div className="filled"><span className="lab">你說</span>{item.leader}</div>
              <div className="finding">{AI_TAG}<b>AI 扮演的練習參與者</b>{item.reply.content.reply}</div>
            </div>
          ))}
          <Notices notices={notices} />
          <div className="field">
            <label htmlFor="practice-say">你要對參與者說什麼</label>
            <textarea id="practice-say" value={say} maxLength={2000} onChange={(event) => setSay(event.target.value)} />
            <div className="btns"><button className="btn primary" type="button" disabled={busy || !say.trim() || !practiceCase} onClick={send}>{busy ? "等它回答…" : "說說看"}</button></div>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

// -- the leader's own area: the course, the supervisors, the feedback, whom I supervise ------------------------------------

function Course({ standing, lessons, ran }: { standing: Standing; lessons: Lesson[]; ran: Set<string> }) {
  return (
    <section className="card">
      <h2>帶領者的課</h2>
      <p className="sub">上完這幾堂課，才能被設成帶領者。上完之後，要有人邀請你當帶領者。</p>
      <ol>{lessons.map((lesson) => <li key={lesson.id}>{lesson.title}{lesson.state === "draft" && <span className="tag">草稿</span>}：{ran.has(`${lesson.id}/${lesson.version}`) ? "做過了" : "還沒做"}</li>)}</ol>
      <p className={standing.facilitator ? "okline" : "hint"}>{standing.facilitator ? "你上完了課，可以被設成帶領者。" : "還沒上完。到「課程與演練」把每堂課各練一次。"}</p>
      <Link className="btn" href="/me/teach">到「課程與演練」上課</Link>
    </section>
  );
}

function Supervisors({ links, reload, setError }: { links: MyLink[]; reload: () => Promise<void>; setError: (text: string) => void }) {
  const [email, setEmail] = useState("");
  const { busy, act } = useAct(setError, reload);
  return (
    <section className="card">
      <h2>我的督導</h2>
      <p className="sub">督導要上完帶領者的課，也要帶過。系統只查有沒有，不看內容。督導可以你自己找，也可以由單位指派。</p>
      {links.length === 0 ? <p>你還沒有督導。</p> : (
        <ul>{links.map((link) => (
          <li key={link.doc_id}>
            {link.supervisor_name}（{link.assigned_by === "unit" ? "單位指派" : "我自己找的"}）{link.stands ? "" : "，現在不能用：他可能不再符合督導的條件"}
            {link.written_by_me && <> <button className="btn ghost" type="button" disabled={busy} onClick={act(() => facilitate.dropSupervisor(link.doc_id))}>收回</button></>}
          </li>
        ))}</ul>
      )}
      <div className="field">
        <label htmlFor="supervisor-email">督導的信箱</label>
        <input id="supervisor-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <div className="btns"><button className="btn" type="button" disabled={busy || !email.trim()} onClick={act(async () => { await facilitate.findSupervisor(email.trim()); setEmail(""); })}>請他當我的督導</button></div>
      </div>
    </section>
  );
}

function FeedbackList({ items }: { items: Feedback[] }) {
  return (
    <section className="card">
      <h2>督導給我的回饋</h2>
      <p className="sub">只有你和寫的督導看得到。</p>
      {items.length === 0 ? <p>還沒有回饋。</p> : items.map((item) => <div key={item.doc_id} className="filled"><span className="lab">{item.supervisor_name}　{day(item.at)}</span>{item.feedback}</div>)}
    </section>
  );
}

function Supervise({ people, scripts }: { people: Supervisee[]; scripts: Script[] }) {
  const [chosen, setChosen] = useState<Supervisee | null>(null);
  const [logs, setLogs] = useState<SupervisedLog[]>([]);
  const [appeals, setAppeals] = useState<MaskedAppeal[]>([]);
  const [mine, setMine] = useState<Doc<{ supervisee: string; feedback: string }>[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const choose = async (person: Supervisee) => {
    setError(""); setChosen(person); setLogs([]); setAppeals([]);
    try {
      const [found, heard, written] = await Promise.all([facilitate.logs(person.supervisee), facilitate.appeals(person.supervisee), docs.list<{ supervisee: string; feedback: string }>(null, "facilitate.supervision")]);
      setLogs(found); setAppeals(heard); setMine(written.filter((item) => item.content.supervisee === person.supervisee));
    } catch (reason) { setError(humanError(reason)); }
  };
  const save = async () => {
    if (!chosen) return;
    setError(""); setBusy(true);
    try { const saved = await docs.create(null, "facilitate.supervision", { supervisee: chosen.supervisee, feedback: text.trim() }); setMine([...mine, saved]); setText(""); }
    catch (reason) { setError(humanError(reason)); } finally { setBusy(false); }
  };
  const nameOf = (id: string) => scripts.find((item) => item.id === id)?.subject_name ?? id;
  return (
    <section className="card">
      <h2>我督導的人</h2>
      <p className="sub">你看得到他們的帶領紀錄，和參與者對他們帶法的異議（沒有具名的，看不到是誰提的）。別的你都看不到。</p>
      {people.length === 0 ? <p>現在沒有人找你當督導。</p> : (
        <div className="chips" role="group" aria-label="我督導的人">
          {people.map((person) => <button key={person.supervisee} type="button" className={`chip${chosen?.supervisee === person.supervisee ? " on" : ""}`} aria-pressed={chosen?.supervisee === person.supervisee} onClick={() => choose(person)}>{person.name}</button>)}
        </div>
      )}
      {chosen && (
        <>
          <h3>{chosen.name} 的帶領紀錄</h3>
          {logs.length === 0 ? <p>還沒有紀錄。</p> : logs.map((log) => (
            <div key={log.doc_id} className="filled">
              <span className="lab">{nameOf(log.content.script)}　第 {log.content.script_version} 版　{day(log.at)}</span>
              {log.content.followed && <p className="mt0">照稿做了：{log.content.followed}</p>}
              {(log.content.deviated ?? []).map((item, index) => <p key={index} className="mb0">沒照稿：{item.what}（為什麼：{item.why}）</p>)}
            </div>
          ))}
          <h3>參與者的異議</h3>
          {appeals.length === 0 ? <p>沒有異議。</p> : appeals.map((appeal) => (
            <div key={appeal.doc_id} className="filled">
              <span className="lab">{appeal.named && appeal.author_name ? `具名：${appeal.author_name}` : "沒有具名"}　{appeal.on}</span>
              {appeal.text}
            </div>
          ))}
          <h3>寫回饋</h3>
          {mine.map((item) => <div key={item.doc_id} className="filled"><span className="lab">我寫過的　{day(item.at)}</span>{item.content.feedback}</div>)}
          <div className="field">
            <label htmlFor="supervision-feedback">給 {chosen.name} 的回饋</label>
            <textarea id="supervision-feedback" value={text} maxLength={4000} onChange={(event) => setText(event.target.value)} />
            <div className="btns"><button className="btn primary" type="button" disabled={busy || !text.trim()} onClick={save}>存回饋</button></div>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function Personal({ scripts }: { scripts: Scripts }) {
  const [data, setData] = useState<{ standing: Standing; lessons: Lesson[]; ran: Set<string>; links: MyLink[]; feedback: Feedback[]; people: Supervisee[]; leading: Group[] } | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    const [standing, lessons, runs, links, feedback, people, mine] = await Promise.all([
      facilitate.standing(), apiFetch<Lesson[]>("/blocks/teach/lessons"), docs.list<{ lesson: string; lesson_version: number }>(null, "teach.run"),
      facilitate.supervisors(), facilitate.feedback(), facilitate.supervisees(), groups.list(),
    ]);
    setData({ standing, lessons: lessons.filter((lesson) => lesson.course?.package === "facilitator").sort((a, b) => (a.course?.order ?? 0) - (b.course?.order ?? 0)),
      ran: new Set(runs.map((run) => `${run.content.lesson}/${run.content.lesson_version}`)), links, feedback, people, leading: mine.filter((group) => group.my_role === "facilitator") });
  };
  useEffect(() => { load().catch((reason) => setError(humanError(reason))); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <div className="card"><p>{error || "載入中…"}</p></div>;
  return (
    <>
      <Course standing={data.standing} lessons={data.lessons} ran={data.ran} />
      <section className="card">
        <h2>我帶的群組</h2>
        {data.leading.length === 0 ? <p>你現在沒有帶任何群組。</p> : <ul>{data.leading.map((group) => <li key={group.group_id}><Link href={`/groups/${encodeURIComponent(group.group_id)}/lead`}>{group.name}</Link></li>)}</ul>}
      </section>
      <Practice scripts={scripts.scripts} />
      <Supervisors links={data.links} reload={load} setError={setError} />
      <FeedbackList items={data.feedback} />
      {(data.standing.supervisor || data.people.length > 0) && <Supervise people={data.people} scripts={scripts.scripts} />}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

// -- inside one group -----------------------------------------------------------------------------------------------------

function Lead({ groupId, scripts, participants }: { groupId: string; scripts: Script[]; participants: Member[] }) {
  const usable = scripts.filter((item) => item.usable);
  const [scriptId, setScriptId] = useState(usable[0]?.id ?? "");
  const [step, setStep] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [picking, setPicking] = useState(false);
  const [help, setHelp] = useState<Help | null>(null);
  const [error, setError] = useState("");
  const script = usable.find((item) => item.id === scriptId);
  const chooseScript = (id: string) => { setScriptId(id); setStep(0); setStopped(false); setHelp(null); };
  const stop = () => { setStopped(true); setPicking(true); setHelp(null); setError(""); };
  const ask = async (participant: string | null) => {
    setError("");
    try { setHelp(await facilitate.stop(groupId, participant)); setPicking(false); } catch (reason) { setError(humanError(reason)); }
  };
  const resume = () => { setStopped(false); setPicking(false); setHelp(null); };
  return (
    <section className="card">
      <h2>帶領稿</h2>
      {!script ? <p>現在還沒有審過、可以拿來帶的帶領稿。{scripts.length > 0 && "草稿只能讀，不能拿來帶。"}</p> : (
        <>
          <div className="chips" role="group" aria-label="帶領稿">
            {usable.map((item) => <button key={item.id} type="button" className={`chip${item.id === scriptId ? " on" : ""}`} aria-pressed={item.id === scriptId} onClick={() => chooseScript(item.id)}>{item.subject_name}</button>)}
          </div>
          <p className="status"><span>第 {step + 1} 步／共 {script.steps.length} 步</span><span>大約 {script.steps[step].minutes} 分鐘</span><span>第 {script.version} 版</span></p>
          <p>{script.steps[step].what}</p>
          <div className={stopped ? "cant" : "filled"} role={stopped ? "alert" : undefined} aria-label="停止訊號">
            <b>停止訊號</b>
            <ul className="mb0">{script.steps[step].stop_signals.map((signal) => <li key={signal}>{signal}</li>)}</ul>
          </div>
          <div className="btns mt8">
            <button className="btn" type="button" disabled={stopped || step === 0} onClick={() => setStep(step - 1)}>上一步</button>
            <button className="btn" type="button" disabled={stopped || step >= script.steps.length - 1} onClick={() => setStep(step + 1)}>下一步</button>
            {!stopped && <button className="btn primary" type="button" onClick={stop}>參與者要停</button>}
          </div>
          {stopped && (
            <div className="cant mt8">
              <b>這一步先停下來。</b>
              <p className="mb0">{escalationOf(script)}</p>
              {picking && (
                <>
                  <p>誰要停？不點名也可以。</p>
                  <div className="chips" role="group" aria-label="誰要停">
                    {participants.map((person) => <button key={person.identity_id} type="button" className="chip" onClick={() => ask(person.identity_id)}>{person.display_name}</button>)}
                    <button type="button" className="chip" onClick={() => ask(null)}>不點名</button>
                  </div>
                </>
              )}
              {help && <HelpLines help={help} />}
              <div className="btns mt8"><button className="btn ghost" type="button" onClick={resume}>回到帶領稿</button></div>
            </div>
          )}
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function Shared({ groupId }: { groupId: string }) {
  const [data, setData] = useState<Consented | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { facilitate.consented(groupId).then(setData).catch((reason) => setError(humanError(reason))); }, [groupId]);
  return (
    <section className="card">
      <h2>參與者同意給你看的</h2>
      <p className="sub">只有參與者自己選了給你看的，才在這裡。沒選的，你看不到。</p>
      {!data ? <p>{error || "載入中…"}</p> : data.participants.length === 0 ? <p>這個群組還沒有參與者。</p> : data.participants.map((person) => (
        <div key={person.identity_id} className="filled">
          <span className="lab">{person.name}{person.led && <span className="tag">寫了由你帶</span>}</span>
          {person.shared.length === 0 ? <p className="mb0">還沒有分享任何東西。</p> : <ul className="mb0">{person.shared.map((item) => <li key={`${item.kind}-${item.doc_id}`}><b>{item.title}</b>：{summary(item.content)}</li>)}</ul>}
        </div>
      ))}
    </section>
  );
}

function Log({ groupId, scripts }: { groupId: string; scripts: Script[] }) {
  const [logs, setLogs] = useState<Doc<LogContent>[]>([]);
  const [editing, setEditing] = useState<Doc<LogContent> | null>(null);
  const [scriptId, setScriptId] = useState(scripts[0]?.id ?? "");
  const [followed, setFollowed] = useState("");
  const [deviated, setDeviated] = useState<Deviation[]>([]);
  const [dirty, setDirty] = useState(false);
  const [pointers, setPointers] = useState<Doc<Pointers> | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = async () => setLogs((await docs.list<LogContent>(null, "facilitate.log")).filter((item) => item.content.group_id === groupId));
  useEffect(() => { mine().catch((reason) => setError(humanError(reason))); }, [groupId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const open = (log: Doc<LogContent> | null) => {
    setEditing(log); setPointers(null); setDirty(false);
    setScriptId(log?.content.script ?? scriptId); setFollowed(log?.content.followed ?? ""); setDeviated(log?.content.deviated ?? []);
  };
  const edit = <T,>(set: (value: T) => void) => (value: T) => { set(value); setDirty(true); };
  const script = scripts.find((item) => item.id === scriptId);
  const save = async () => {
    if (!script) return;
    setError(""); setBusy(true);
    const clean = deviated.map((item) => ({ what: item.what.trim(), why: item.why.trim() })).filter((item) => item.what || item.why);
    const content: LogContent = { group_id: groupId, script: script.id, script_version: script.version, ...(followed.trim() ? { followed: followed.trim() } : {}), ...(clean.length ? { deviated: clean } : {}) };
    try {
      const saved = editing ? await docs.update(null, "facilitate.log", editing, content) : await docs.create(null, "facilitate.log", content);
      setNotices(saved.notices); setEditing(saved); setDirty(false); await mine();
    } catch (reason) { setError(humanError(reason)); } finally { setBusy(false); }
  };
  const point = async () => {
    if (!editing) return;
    setError(""); setBusy(true);
    try {
      const turn = await ai<Pointers>(null, "FACILITATE", "point_at_deviations", { log: editing.doc_id });
      if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
      else if (turn.saved) setPointers(turn.saved);
    } catch (reason) { setError(humanError(reason)); } finally { setBusy(false); }
  };
  const setItem = (index: number, key: keyof Deviation, value: string) => edit(setDeviated)(deviated.map((item, at) => (at === index ? { ...item, [key]: value } : item)));
  return (
    <section className="card">
      <h2>寫帶領紀錄</h2>
      <p className="sub">每帶完一次寫一份：照稿做了哪些、哪裡沒照稿、為什麼。不要寫參與者的名字和他們說的話。沒照稿不一定是錯，寫下理由，你和督導一起看。</p>
      {logs.length > 0 && (
        <div className="chips" role="group" aria-label="我寫過的紀錄">
          {logs.map((log) => <button key={log.doc_id} type="button" className={`chip${editing?.doc_id === log.doc_id ? " on" : ""}`} aria-pressed={editing?.doc_id === log.doc_id} onClick={() => open(log)}>{day(log.created_at ?? log.at)}</button>)}
          <button type="button" className="chip" onClick={() => open(null)}>新的一次</button>
        </div>
      )}
      <div className="chips" role="group" aria-label="這次帶的帶領稿">
        {scripts.map((item) => <button key={item.id} type="button" className={`chip${item.id === scriptId ? " on" : ""}`} aria-pressed={item.id === scriptId} onClick={() => edit(setScriptId)(item.id)}>{item.subject_name}</button>)}
      </div>
      <div className="field">
        <label htmlFor="log-followed">照稿做了哪些</label>
        <textarea id="log-followed" value={followed} maxLength={4000} onChange={(event) => edit(setFollowed)(event.target.value)} />
      </div>
      <div className="field">
        <b>哪裡沒照稿</b>
        {deviated.map((item, index) => (
          <div key={index}>
            <label htmlFor={`log-what-${index}`}>哪裡沒照稿</label>
            <input id={`log-what-${index}`} value={item.what} onChange={(event) => setItem(index, "what", event.target.value)} />
            <label htmlFor={`log-why-${index}`}>為什麼</label>
            <input id={`log-why-${index}`} value={item.why} onChange={(event) => setItem(index, "why", event.target.value)} />
            <button className="btn ghost" type="button" onClick={() => edit(setDeviated)(deviated.filter((_, at) => at !== index))}>拿掉這一項</button>
          </div>
        ))}
        <div className="btns"><button className="btn" type="button" disabled={deviated.length >= 30} onClick={() => edit(setDeviated)([...deviated, { what: "", why: "" }])}>再加一項</button></div>
      </div>
      <Notices notices={notices} />
      <div className="btns mt8">
        <button className="btn primary" type="button" disabled={busy || !script || (!followed.trim() && !deviated.some((item) => item.what.trim()))} onClick={save}>{busy ? "存檔中…" : "存紀錄"}</button>
        <button className="btn" type="button" disabled={busy || !editing || dirty} onClick={point}>請 AI 指出可能偏離的地方</button>
      </div>
      {pointers && (
        <div className="finding">
          {AI_TAG}
          {(pointers.content.pointers ?? []).length === 0
            ? <p>AI 這次沒有指出可能偏離的地方。這不代表沒有。</p>
            : (pointers.content.pointers ?? []).map((item) => <div key={`${item.n}-${item.dont}`}><p className="mb0"><b>{item.line}</b></p><p>{item.text}</p></div>)}
          <p className="hint mb0">{pointers.content.handback}</p>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function Unit({ groupId, group }: { groupId: string; group: Group }) {
  const [items, setItems] = useState<Assignment[]>([]);
  const [leader, setLeader] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const load = async () => setItems(await facilitate.assignments(groupId));
  useEffect(() => { load().catch((reason) => setError(humanError(reason))); }, [groupId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const { busy, act } = useAct(setError, load);
  const leaders = (group.members ?? []).filter((member) => member.role === "facilitator");
  const convener = group.my_role === "convener";
  return (
    <section className="card">
      <h2>單位指派的督導</h2>
      {items.length === 0
        ? <p>{convener ? "你還沒有為這個群組的帶領者指派督導。" : "單位還沒有指派督導給你。你也可以自己找督導，在「帶領」頁。"}</p>
        : <ul>{items.map((item) => (
          <li key={item.doc_id}>
            {convener ? `${item.supervisee_name} 的督導：` : "你的督導："}{item.supervisor_name}{item.stands ? "" : "（現在不能用：他可能不再符合督導的條件）"}
            {convener && item.written_by_me && <> <button className="btn ghost" type="button" disabled={busy} onClick={act(() => facilitate.unassign(groupId, item.doc_id))}>收回</button></>}
          </li>
        ))}</ul>}
      {convener && leaders.length > 0 && (
        <div className="field">
          <b>指派督導給</b>
          <div className="chips" role="group" aria-label="指派給哪位帶領者">
            {leaders.map((member) => <button key={member.identity_id} type="button" className={`chip${leader === member.identity_id ? " on" : ""}`} aria-pressed={leader === member.identity_id} onClick={() => setLeader(member.identity_id)}>{member.display_name}</button>)}
          </div>
          <label htmlFor="assign-email">督導的信箱</label>
          <input id="assign-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <div className="btns"><button className="btn" type="button" disabled={busy || !leader || !email.trim()} onClick={act(async () => { await facilitate.assign(groupId, leader, email.trim()); setEmail(""); })}>指派</button></div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function GroupLead({ groupId, scripts }: { groupId: string; scripts: Scripts }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { Promise.all([groups.get(groupId), facilitate.standing()]).then(([found, mine]) => { setGroup(found); setStanding(mine); }).catch((reason) => setError(humanError(reason))); }, [groupId]);
  if (!group || !standing) return <div className="card"><p>{error || "載入中…"}</p></div>;
  const leads = group.my_role === "facilitator" && standing.facilitator;
  const usable = scripts.scripts.filter((item) => item.usable);
  return (
    <>
      <p className="sub">群組：{group.name}</p>
      {leads ? (
        <>
          <Lead groupId={groupId} scripts={scripts.scripts} participants={(group.members ?? []).filter((member) => member.role === "participant")} />
          <Shared groupId={groupId} />
          {usable.length > 0 ? <Log groupId={groupId} scripts={usable} /> : <section className="card"><h2>寫帶領紀錄</h2><p>現在還沒有審過、可以拿來帶的帶領稿，所以還不能寫帶領紀錄。</p></section>}
        </>
      ) : <div className="card"><p>{group.my_role === "facilitator"
        ? <>你現在不符合帶領者的條件（要上完帶領者的課），所以不能用這一頁帶領。到<Link href="/lead">「帶領」頁</Link>看課。</>
        : "這一頁的帶領功能，只給這個群組的帶領者。"}</p></div>}
      {(leads || group.my_role === "convener") && <Unit groupId={groupId} group={group} />}
    </>
  );
}

export function FacilitatePage({ groupId }: { groupId?: string }) {
  const [scripts, setScripts] = useState<Scripts | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { facilitate.scripts().then(setScripts).catch((reason) => setError(humanError(reason))); }, []);
  return (
    <>
      <div className="crumbs"><Link href="/projects">我的專案</Link> › {groupId ? <><Link href={`/groups/${encodeURIComponent(groupId)}`}>群組</Link> › </> : null}帶領</div>
      <h1>帶領</h1>
      <p className="sub">帶別人想，但不替人想。帶領稿是起點，不是唯一正確的帶法。這一頁只記你怎麼帶，不評價你。</p>
      {!scripts ? <div className="card"><p>{error || "載入中…"}</p></div> : (
        <>
          <Donts items={scripts.donts} />
          {groupId ? <GroupLead groupId={groupId} scripts={scripts} /> : <Personal scripts={scripts} />}
        </>
      )}
    </>
  );
}
