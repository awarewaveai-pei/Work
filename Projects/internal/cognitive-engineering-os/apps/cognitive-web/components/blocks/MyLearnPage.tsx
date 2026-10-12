"use client";

// 每天的校準 (LEARN card, yours across cases, outside any case): once a day you write one belief, emotion or decision, the AI
// gives it back as a mirror -- no advice, and it never writes your counterexample -- and you add a counterexample and what
// would change it. You also set the two practices (10 minutes a day, 2 to 3 thinking sprints a week) and keep your own
// habits. Nothing here is copied into a case, and nothing here is scored or compared with anyone.
import Link from "next/link";
import { humanError } from "../../lib/errors";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { ai, docs, type Doc, type Notice } from "../../lib/blocks";
import { DAILY_ABOUT, SPRINTS, sprintsThisWeek, type OpenCase } from "../../lib/learn";
import type { Project } from "../../lib/projects";
import { formatTime } from "../../lib/time";
import { Notices } from "./BlockShell";
import { AuthorTag, Cell, Chips } from "./JudgmentParts";
import { RemindersPanel } from "./RemindersPanel";
import { Missing, Refused, firstMissing, type Failed } from "./PageParts";

type Daily = { about: string; text: string; counterexample?: string; change_condition?: string };
type Practice = { daily?: boolean; weekly_sprints?: number };
type Sprint = { project: string; note?: string };
const EMPTY: Daily = { about: "", text: "" };
const day = (iso: string): string => formatTime(iso).slice(0, 10);   // the person's own day

export function MyLearnPage() {
  const [dailies, setDailies] = useState<Array<Doc<Daily>> | null>(null);
  const [mirror, setMirror] = useState<Doc<{ summary: string }> | null>(null);
  const [practice, setPractice] = useState<Doc<Practice> | null>(null);
  const [sprints, setSprints] = useState<Array<Doc<Sprint>>>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [hints, setHints] = useState<string[]>([]);
  const [habits, setHabits] = useState<Array<Doc<{ keep?: string; change?: string }>>>([]);
  const [form, setForm] = useState<Daily>(EMPTY);
  const [setting, setSetting] = useState<Practice>({});
  const [chosen, setChosen] = useState("");
  const [open, setOpen] = useState<OpenCase[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<Failed>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const today = day(new Date().toISOString());
  const load = async () => {
    const [cards, mirrors, practices, sprintDocs, list, patterns, habitDocs] = await Promise.all([
      docs.list<Daily>(null, "learn.daily"), docs.list<{ summary: string }>(null, "learn.daily_mirror"), docs.list<Practice>(null, "learn.practice"), docs.list<Sprint>(null, "learn.sprint"),
      apiFetch<Project[]>("/projects"), apiFetch<{ hints: string[] }>("/me/learn/patterns"), docs.list<{ keep?: string; change?: string }>(null, "learn.habit"),
    ]);
    setDailies(cards); setMirror(mirrors.at(-1) ?? null); setPractice(practices.at(-1) ?? null); setSprints(sprintDocs); setProjects(list); setHints(patterns.hints); setHabits(habitDocs);
    return { cards, practice: practices.at(-1) ?? null };
  };
  useEffect(() => {
    load().then((found) => {
      const todays = found.cards.filter((card) => day(card.at) === today).at(-1);
      setForm(todays ? todays.content : EMPTY);
      setSetting(found.practice?.content ?? {});
    }).catch((reason) => setError(humanError(reason)));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // `at`: the button group that sent it; its refusal is shown there (PageParts.Refused)
  const run = (at: string, work: () => Promise<void>) => async () => {
    setFailed(null); setBusy(true);
    try { await work(); await load(); setRefresh((count) => count + 1); } catch (reason) { setFailed({ at, text: humanError(reason) }); } finally { setBusy(false); }
  };
  const todays = dailies?.filter((card) => day(card.at) === today).at(-1) ?? null;
  const save = run("today", async () => {
    const content = Object.fromEntries(Object.entries({ ...form, text: form.text.trim() }).filter(([, value]) => value !== undefined && value !== "")) as Daily;
    const saved = todays ? await docs.update(null, "learn.daily", todays, content) : await docs.create(null, "learn.daily", content);
    setNotices(saved.notices);
    setOpen((saved.notices as unknown as OpenCase[]).filter((notice) => notice.type === "suggest_case"));
  });
  const askMirror = run("mirror", async () => {
    if (!todays) return;
    const turn = await ai<{ summary: string }>(null, "LEARN", "mirror", { card: todays.doc_id }, mirror);
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
  });
  const savePractice = run("practice", async () => {
    const content = { daily: setting.daily === true, weekly_sprints: setting.weekly_sprints ?? 0 };
    if (practice) await docs.update(null, "learn.practice", practice, content); else await docs.create(null, "learn.practice", content);
  });
  const saveSprint = run("sprint", async () => { await docs.create(null, "learn.sprint", { project: chosen }); });
  const removeSprint = (sprint: Doc<Sprint>) => run("sprint", async () => { await docs.remove(null, "learn.sprint", sprint.doc_id); })();

  if (!dailies) return <><div className="crumbs"><Link href="/projects">我的案子</Link> › 每天的校準</div><div className="card"><p>{error || "載入中…"}</p></div></>;
  const mirrored = mirror && todays && mirror.at >= todays.at;   // a mirror made after the card's last version belongs to it
  const doneThisWeek = sprintsThisWeek(sprints.map((sprint) => day(sprint.at)), today);

  return (
    <>
      <div className="crumbs"><Link href="/projects">我的案子</Link> › 每天的校準</div>
      <h1>每天的校準</h1>
      <p className="sub">這裡是你自己的，不用開案子，別人看不到，也不跟任何人比。</p>
      <Notices notices={notices} />
      <RemindersPanel key={refresh} />

      <div className="card cta">
        <h2>今天的 10 分鐘</h2>
        <p className="how">寫一個你相信的事、一種情緒，或一個決定。AI 當鏡子，把你寫的整理回來給你看；它不給建議，也不替你寫反例。反例和「什麼會改變它」，由你寫。</p>
        <div className="field">
          <b>這是一個</b>
          <Chips options={DAILY_ABOUT} value={form.about as (typeof DAILY_ABOUT)[number] | undefined} label="信念、情緒或決定" onPick={(about) => setForm({ ...form, about })} />
        </div>
        <Cell id="daily-text" label="寫下來"><textarea id="daily-text" value={form.text} maxLength={1000} onChange={(event) => setForm({ ...form, text: event.target.value })} /></Cell>
        <Cell id="daily-counter" label="你補一個反例" hint="有沒有哪一次，不是這樣？"><textarea id="daily-counter" value={form.counterexample ?? ""} maxLength={1000} onChange={(event) => setForm({ ...form, counterexample: event.target.value })} /></Cell>
        <Cell id="daily-change" label="什麼會改變它"><textarea id="daily-change" value={form.change_condition ?? ""} maxLength={1000} onChange={(event) => setForm({ ...form, change_condition: event.target.value })} /></Cell>
        <div className="btns mt8"><button className="btn primary big" type="button" disabled={busy || !form.about || !form.text.trim()} onClick={save}>{busy ? "存檔中…" : todays ? "存修改" : "存今天這張"}</button></div>
        <Missing why={firstMissing([!form.about, "先選這是一個信念、情緒，還是決定。"], [!form.text.trim(), "寫下來，才能存。"])} />
        <Refused failed={failed} at="today" />
        {open.map((item) => (
          <div key={item.categories.join()} className="card accent mt12">
            <p className="mt0">{item.notice}</p>
            <div className="btns"><Link className="btn" href="/projects">到「我的案子」開案子</Link></div>
          </div>
        ))}
        {todays && (
          <div className="judge">
            <div className="btns"><button className="btn" type="button" disabled={busy} onClick={askMirror}>{busy ? "整理中…" : mirror ? "請 AI 再當一次鏡子" : "請 AI 當鏡子"}</button></div>
            <Refused failed={failed} at="mirror" />
            {mirror && mirrored && <><AuthorTag author={mirror.author} /><p>{mirror.content.summary}</p></>}
            {mirror && !mirrored && <p className="sub">你改過這張卡，這是之前的整理。再請 AI 整理一次，就是新的。</p>}
          </div>
        )}
      </div>

      <div className="card">
        <h2>你設的兩件固定做的事</h2>
        <div className="field">
          <b>每天 10 分鐘認知校準</b>
          <Chips options={["要", "不要"] as const} value={setting.daily === undefined ? "" : setting.daily ? "要" : "不要"} label="每天校準" onPick={(value) => setSetting({ ...setting, daily: value === "要" })} />
        </div>
        <div className="field">
          <b>每週 30 分鐘的思考衝刺，幾次</b>
          <div className="chips" role="group" aria-label="每週衝刺幾次">{SPRINTS.map((count) => <button key={count} type="button" className={`chip${(setting.weekly_sprints ?? 0) === count ? " on" : ""}`} aria-pressed={(setting.weekly_sprints ?? 0) === count} onClick={() => setSetting({ ...setting, weekly_sprints: count })}>{count === 0 ? "不設" : `${count} 次`}</button>)}</div>
        </div>
        <p className="hint">設了，提醒會出現在「我的案子」首頁。</p>
        <div className="btns"><button className="btn" type="button" disabled={busy} onClick={savePractice}>存這兩件</button></div>
        <Refused failed={failed} at="practice" />
      </div>

      <div className="card">
        <h2>這週的思考衝刺<small>這週記了 {doneThisWeek} 次</small></h2>
        <p className="how">挑一個你真的在處理的案子，照「共思考」的 25 分鐘循環走一輪。</p>
        {projects.length === 0 ? <p className="sub">你還沒有案子。</p> : (
          <div className="chips" role="group" aria-label="挑一個案子">{projects.map((project) => <button key={project.project_id} type="button" className={`chip${chosen === project.project_id ? " on" : ""}`} aria-pressed={chosen === project.project_id} onClick={() => setChosen(project.project_id)}>{project.name}</button>)}</div>
        )}
        <div className="btns">
          {chosen && <Link className="btn" href={`/projects/${encodeURIComponent(chosen)}/think`}>去共思考</Link>}
          <button className="btn primary" type="button" disabled={!chosen || busy} onClick={saveSprint}>記下這次衝刺</button>
        </div>
        <Missing why={projects.length > 0 && !chosen && "先挑一個案子。"} />
        <Refused failed={failed} at="sprint" />
        {sprints.slice(-5).map((sprint) => (
          <p key={sprint.doc_id} className="sub mb0">{formatTime(sprint.at)}　{projects.find((project) => project.project_id === sprint.content.project)?.name ?? "（案子已刪除）"}　<button className="btn ghost" type="button" disabled={busy} onClick={() => removeSprint(sprint)}>刪掉這筆</button></p>
        ))}
      </div>

      <div className="card">
        <h2>跨案子的慣性</h2>
        {hints.length === 0 ? <p className="sub mb0">還看不到。要有兩個案子，出現同樣的做法，才會提醒你。</p> : hints.map((hint) => <p key={hint} className="warn mt0">{hint}</p>)}
        {habits.slice(-5).map((item) => <p key={item.doc_id} className="sub mb0">你寫的：{item.content.keep && <>保留「{item.content.keep}」　</>}{item.content.change && <>改變「{item.content.change}」</>}</p>)}
      </div>

      {dailies.length > 0 && (
        <div className="card">
          <h2>以前的卡</h2>
          {dailies.slice(-7).reverse().map((card) => <details key={card.doc_id}><summary>{formatTime(card.at)}・{card.content.about}</summary><p>{card.content.text}</p>{card.content.counterexample && <p className="sub">反例：{card.content.counterexample}</p>}{card.content.change_condition && <p className="sub">什麼會改變它：{card.content.change_condition}</p>}</details>)}
        </div>
      )}
    </>
  );
}
