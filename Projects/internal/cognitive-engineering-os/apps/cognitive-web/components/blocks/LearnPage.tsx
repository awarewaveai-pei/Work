"use client";

// LEARN 回顧校準 (contract card): you look back. What you thought and how sure you were, next to what you predicted and what
// happened; what the AI said and whether you took it; what you missed; the process apart from luck; whether the AI earned
// your trust; then you decide -- keep the judgment, write a new version, or change method. The page lists what you did
// without the AI; it never scores, grades or ranks you, and the AI never decides for you whether to revise.
import Link from "next/link";
import { humanError } from "../../lib/errors";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { ai, blockOf, docs, type Doc, type Notice } from "../../lib/blocks";
import { GUARDRAIL_NAME, wontChange, type Check, type Judgment, type Review } from "../../lib/decide";
import {
  DECISIONS, DONE_WHEN, NEXT_BLOCKS, PREDICTION_RESULT, REVIEW_CHECKS, TRUST, whatTheAiSaid,
  type Calibration, type Compare, type Move, type Wrong,
} from "../../lib/learn";
import type { Reminder, Task, Note } from "../../lib/act";
import { formatTime } from "../../lib/time";
import { caseEvidence, originName, type Origin } from "../../lib/evidence";
import { BlockShell, Notices } from "./BlockShell";
import { AuthorTag, Cell, Chips, optionalDocs } from "./JudgmentParts";

type Any = Record<string, any>;
type Held = {
  judgments: Array<Doc<Judgment>>; tasks: Array<Doc<Task>>; notes: Array<Doc<Note>>; checks: Array<Doc<Check>>; reviews: Array<Doc<Review>>;
  mirrors: Array<Doc<{ summary: string }>>; senseReviews: Array<Doc<{ mirror: string; version: number; decision: string }>>;
  thinkCards: Array<Doc<{ claim?: string }>>; thinkReactions: Array<Doc<{ card: string; reaction?: string; picked?: boolean }>>; mapReviews: Array<Doc<{ decision: string }>>;
  calibrations: Array<Doc<Calibration>>; revisit: Doc<{ on: string; note?: string }> | null; compare: Doc<Compare> | null; intake: Doc<Any> | null;
  moves: Move[]; unused: Array<{ code: string; open: boolean }>; hints: string[]; due: Reminder[]; habits: Array<Doc<{ keep?: string; change?: string }>>; guardrails: string[];
  origins: Origin[];
};

const clean = (values: Record<string, string> | undefined): Record<string, string> => Object.fromEntries(Object.entries(values ?? {}).filter(([, value]) => value.trim()));
const compact = <T extends Record<string, any>>(content: T): T => Object.fromEntries(Object.entries(content).filter(([, value]) => !(value === undefined || value === "" || (Array.isArray(value) && value.length === 0) || (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)))) as T;

export function LearnPage({ projectId }: { projectId: string }) {
  const [held, setHeld] = useState<Held | null>(null);
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState<Partial<Calibration>>({});
  const [wrong, setWrong] = useState<Wrong[]>([{ source: "", why: "" }]);
  const [habit, setHabit] = useState({ keep: "", change: "" });
  const [day, setDay] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const fill = (calibration: Doc<Calibration> | null) => {
    setForm(calibration ? calibration.content : {});
    setWrong(calibration?.content.wrong_sources?.length ? calibration.content.wrong_sources : [{ source: "", why: "" }]);
  };

  const load = async (): Promise<Held> => {
    const id = encodeURIComponent(projectId);
    const [judgments, tasks, notes, checks, reviews, mirrors, senseReviews, thinkCards, thinkReactions, mapReviews, calibrations, revisits, compares, intakes, guardrails, moves, unused, patterns, due, habits, evidence] = await Promise.all([
      docs.list<Judgment>(projectId, "decide.judgment"), docs.list<Task>(projectId, "act.task"), docs.list<Note>(projectId, "act.note"), docs.list<Check>(projectId, "decide.check"), docs.list<Review>(projectId, "decide.review"),
      docs.list<{ summary: string }>(projectId, "sense.mirror"), docs.list<{ mirror: string; version: number; decision: string }>(projectId, "sense.review"),
      optionalDocs<{ claim?: string }>(projectId, "think.card"), optionalDocs<{ card: string; reaction?: string; picked?: boolean }>(projectId, "think.reaction"), optionalDocs<{ decision: string }>(projectId, "map.review"),
      docs.list<Calibration>(projectId, "learn.calibration"), docs.list<{ on: string; note?: string }>(projectId, "learn.revisit"), docs.list<Compare>(projectId, "learn.compare"), docs.list<Any>(projectId, "assembler.intake"),
      docs.list<{ guardrail: string }>(projectId, "govern.guardrail"),
      apiFetch<{ moves: Move[] }>(`/projects/${id}/learn/moves`), apiFetch<{ unused: Array<{ code: string; open: boolean }> }>(`/projects/${id}/learn/unused_blocks`),
      apiFetch<{ hints: string[] }>("/me/learn/patterns"), apiFetch<Reminder[]>(`/projects/${id}/act/reminders?utc_offset=${-new Date().getTimezoneOffset()}`),
      docs.list<{ keep?: string; change?: string }>(null, "learn.habit"),
      caseEvidence(projectId),   // the case's origins: a wrong one is named by its pages (GATHER shows it on that origin)
    ]);
    const next: Held = {
      judgments: await versionsOf(judgments), tasks, notes, checks, reviews, mirrors, senseReviews, thinkCards, thinkReactions, mapReviews, calibrations, revisit: revisits.at(-1) ?? null, compare: compares.at(-1) ?? null,
      intake: intakes.at(-1) ?? null, moves: moves.moves, unused: unused.unused, hints: patterns.hints, due: due.filter((item) => item.kind === "review"), habits, guardrails: [...new Set(guardrails.map((doc) => doc.content.guardrail))],
      origins: evidence.origins.filter((origin) => !origin.pending),
    };
    setHeld(next);
    return next;
  };
  // Every version of the judgment, oldest first (舊版不刪): the review is of one of them.
  const versionsOf = async (current: Array<Doc<Judgment>>): Promise<Array<Doc<Judgment>>> => (current.length ? docs.versions<Judgment>(projectId, "decide.judgment", current[0].doc_id) : []);

  useEffect(() => {
    load().then((next) => {
      const latest = next.judgments.at(-1)?.version ?? 0;
      setVersion(latest);
      fill(next.calibrations.filter((doc) => doc.content.judgment_version === latest).at(-1) ?? null);
      setDay(next.revisit?.content.on ?? "");
    }).catch((reason) => setError(humanError(reason)));
  }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const run = (work: () => Promise<void>) => async () => {
    setError(""); setBusy(true);
    try { await work(); await load(); setRefresh((count) => count + 1); } catch (reason) { setError(humanError(reason)); } finally { setBusy(false); }
  };
  const set = (patch: Partial<Calibration>) => setForm((current) => ({ ...current, ...patch }));
  const pick = (next: Held, chosen: number) => { setVersion(chosen); fill(next.calibrations.filter((doc) => doc.content.judgment_version === chosen).at(-1) ?? null); };

  const mine = held?.calibrations.filter((doc) => doc.content.judgment_version === version).at(-1) ?? null;
  const save = run(async () => {
    const content = compact({ ...form, judgment_version: version, outcome: (form.outcome ?? "").trim(), review_checks: clean(form.review_checks), trust: clean(form.trust), wrong_sources: wrong.filter((item) => item.source.trim()).map((item) => compact({ source: item.source.trim(), why: item.why?.trim(), cards: item.cards })) }) as Calibration;
    const saved = mine ? await docs.update(projectId, "learn.calibration", mine, content) : await docs.create(projectId, "learn.calibration", content);
    setNotices(saved.notices);
    await apiFetch(`/projects/${encodeURIComponent(projectId)}/learn/history`, { method: "POST" });   // this case's line in your own history, written by the platform
  });
  const writeHistory = run(async () => { await apiFetch(`/projects/${encodeURIComponent(projectId)}/learn/history`, { method: "POST" }); });
  const askCompare = run(async () => {
    const turn = await ai<Compare>(projectId, "LEARN", "compare", version ? { judgment_version: version } : {}, held?.compare);
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
  });
  const saveDay = run(async () => {
    if (held?.revisit) await docs.update(projectId, "learn.revisit", held.revisit, { on: day });
    else await docs.create(projectId, "learn.revisit", { on: day });
  });
  const saveHabit = run(async () => { await docs.create(null, "learn.habit", compact({ keep: habit.keep.trim(), change: habit.change.trim(), project: projectId })); setHabit({ keep: "", change: "" }); });

  if (!held) return <BlockShell projectId={projectId} code="LEARN"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;
  const judgment = held.judgments.find((item) => item.version === version) ?? null;
  const said = whatTheAiSaid({ checks: held.checks, reviews: held.reviews, mirrors: held.mirrors, senseReviews: held.senseReviews, thinkCards: held.thinkCards, thinkReactions: held.thinkReactions, mapReviews: held.mapReviews });
  const noAct = !(held.intake?.content.blocks ?? []).includes("ACT");
  const afterJudgment = held.notes.filter((note) => held.tasks.some((task) => task.doc_id === note.content.task));
  const ready = (form.outcome ?? "").trim() !== "";
  const unused = held.unused;
  const guarded = notices.filter((notice) => notice.type === "guardrail");

  return (
    <BlockShell projectId={projectId} code="LEARN" refresh={refresh}>
      <Notices notices={notices} />
      {guarded.length > 0 && <div className="card accent"><p className="mt0">你寫的東西碰到：{guarded.map((notice) => (notice.type === "guardrail" ? notice.category : "")).join("、")}。這個案子加了護欄。</p></div>}
      {held.guardrails.length > 0 && <div className="card accent"><p className="mt0">這個案子有護欄：{held.guardrails.map((name) => GUARDRAIL_NAME[name] ?? name).join("、")}。</p></div>}

      {held.due.length > 0 && <div className="card okline"><h2>到期了</h2>{held.due.map((item) => <p key={item.since} className="mt0">{item.text}<span className="sub">（從 {item.since} 起）</span></p>)}</div>}

      <div className="card">
        <h2>回頭對</h2>
        <p className="how">預測跟結果差在哪？你當初怎麼想、信心多少；AI 當時給了什麼，你採納還是拒絕；後來發生了什麼。看的是你想的過程，不給你的想法打分數，也不排名。一次結果的好壞，不代表判斷的好壞。</p>
        {noAct && (
          <div className="judge">
            <label htmlFor="revisit">這次的組合沒有「行動與觀察」。你選一天，再回來重看，系統照那一天提醒你。</label>
            <input id="revisit" className="search" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
            <div className="btns"><button className="btn" type="button" disabled={!day || busy} onClick={saveDay}>{held.revisit ? "改這一天" : "記下這一天"}</button></div>
          </div>
        )}
        {!noAct && <p className="sub">要延後回顧，到「行動與觀察」改任務的期限。</p>}
        {held.judgments.length > 1 && (
          <>
            <p className="sub mb0">這次回顧的是判斷卡的哪一版：</p>
            <div className="chips" role="group" aria-label="回顧哪一版">{held.judgments.map((item) => <button key={item.version} type="button" className={`chip${version === item.version ? " on" : ""}`} aria-pressed={version === item.version} onClick={() => pick(held, item.version)}>第 {item.version} 版</button>)}</div>
          </>
        )}
      </div>

      <div className="card">
        <h2>並排看</h2>
        <div className="scroll-x">
          <table>
            <thead><tr><th>項目</th><th>當初</th><th>後來</th></tr></thead>
            <tbody>
              <tr><td>結論和信心</td><td>{judgment ? <>{judgment.content.conclusion || "（沒寫結論）"}　信心 {judgment.content.confidence}%</> : "這個案子沒有判斷卡"}</td><td>{mine?.content.outcome ?? "還沒寫"}</td></tr>
              <tr><td>預測和結果</td>
                <td>{held.tasks.length ? held.tasks.map((task) => <p key={task.doc_id} className="mt0 mb0">{task.content.prediction}</p>) : "沒有任務卡的預測"}</td>
                <td>{mine?.content.prediction_result ?? "還沒標"}{afterJudgment.length > 0 && afterJudgment.map((note) => <p key={note.doc_id} className="sub mb0">{formatTime(note.at)}：{note.content.happened ?? ""}{(note.content.numbers ?? []).map((item) => `　${item.name} ${item.value}${item.unit ?? ""}`).join("")}</p>)}</td></tr>
              <tr><td>下判斷前的情緒強度</td><td>{judgment?.content.intensity_now ?? "沒標"}</td><td>{mine?.content.prediction_result ? `預測${mine.content.prediction_result}` : "還沒標預測有沒有對上"}</td></tr>
              <tr><td>什麼會改變結論</td><td>{judgment?.content.change_condition ?? "沒寫"}{wontChange(judgment?.content.change_condition) && <span className="tags"><span>這一版不打算改</span></span>}</td><td>{mine?.content.updated_conditions ?? "還沒寫"}</td></tr>
              {held.intake?.content.done_when && <tr><td>開案時的完成條件</td><td>{held.intake.content.done_when}</td><td>{mine?.content.done_when_met ?? "還沒標"}</td></tr>}
            </tbody>
          </table>
        </div>
        {!judgment && held.thinkCards.length > 0 && <p className="sub">沒有判斷卡時，對照你的思考卡：{held.thinkCards.slice(0, 5).map((card) => card.content.claim).filter(Boolean).join("；")}</p>}

        <h3 className="mt12">AI 當時給了什麼，你採納了嗎</h3>
        {said.length === 0 ? <p className="sub">這個案子裡，還沒有 AI 給過的東西。</p> : (
          <div className="scroll-x">
            <table>
              <thead><tr><th>來自</th><th>誰寫的</th><th>它說</th><th>你的回應</th></tr></thead>
              <tbody>{said.map((row, index) => <tr key={index}><td>{row.from}</td><td><AuthorTag author={row.author as Doc["author"]} /></td><td>{row.said}</td><td>{row.took}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <div className="btns mt8"><button className="btn" type="button" disabled={busy || (!held.judgments.length && !held.tasks.length)} onClick={askCompare}>{busy ? "整理中…" : held.compare ? "請 AI 再整理一次前後比較" : "請 AI 整理前後比較"}</button></div>
        <p className="hint">AI 只把前後擺出來，不給分數、不排名、不改寫當初的紀錄，也不替你決定要不要修正。</p>
        {held.compare && (
          <div className="judge">
            <AuthorTag author={held.compare.author} />
            <p>{held.compare.content.side_by_side}</p>
            {(held.compare.content.done_well ?? []).length > 0 && <><b>這次你想得好的地方</b><ul>{held.compare.content.done_well!.map((item) => <li key={item}>{item}</li>)}</ul></>}
            {held.compare.content.practice && <p><b>下次可以練的一處：</b>{held.compare.content.practice}</p>}
          </div>
        )}
      </div>

      <div className="card cta">
        <h2>你的回顧</h2>
        <Cell id="outcome" label="實際發生了什麼（必填）"><textarea id="outcome" value={form.outcome ?? ""} maxLength={3000} onChange={(event) => set({ outcome: event.target.value })} /></Cell>
        <div className="field">
          <b>當初的預測，對上了嗎</b>
          <Chips options={PREDICTION_RESULT} value={form.prediction_result as (typeof PREDICTION_RESULT)[number] | undefined} label="預測對上了嗎" onPick={(prediction_result) => set({ prediction_result })} />
          <input className="search" aria-label="預測和結果差在哪" placeholder="差在哪（選填）" value={form.prediction_note ?? ""} maxLength={1000} onChange={(event) => set({ prediction_note: event.target.value })} />
        </div>
        <Cell id="missed" label="當時漏看了什麼"><textarea id="missed" value={form.missed ?? ""} maxLength={2000} onChange={(event) => set({ missed: event.target.value })} /></Cell>

        <h3 className="mt14">回顧的四個檢查題</h3>
        {REVIEW_CHECKS.map((item) => (
          <Cell key={item.key} id={`check-${item.key}`} label={item.question} hint={item.example}>
            <textarea id={`check-${item.key}`} value={form.review_checks?.[item.key] ?? ""} maxLength={1000} onChange={(event) => set({ review_checks: { ...form.review_checks, [item.key]: event.target.value } })} />
          </Cell>
        ))}
        <p className="how">分開看兩層：這一步有沒有做好（清得掉），和整件事有沒有往解決的方向走（守得住）。</p>
        <Cell id="step" label="這一步有沒有做好"><textarea id="step" value={form.step_done ?? ""} maxLength={2000} onChange={(event) => set({ step_done: event.target.value })} /></Cell>
        <Cell id="direction" label="整件事有沒有往解決的方向走"><textarea id="direction" value={form.direction ?? ""} maxLength={2000} onChange={(event) => set({ direction: event.target.value })} /></Cell>

        <h3 className="mt14">過程和運氣，分開寫</h3>
        <p className="how">例：他讓步了，可能是你談得好，也可能只是運氣。</p>
        <Cell id="process" label="過程：我做對、做錯了什麼"><textarea id="process" value={form.process ?? ""} maxLength={2000} onChange={(event) => set({ process: event.target.value })} /></Cell>
        <Cell id="luck" label="運氣：哪些不是我做的"><textarea id="luck" value={form.luck ?? ""} maxLength={2000} onChange={(event) => set({ luck: event.target.value })} /></Cell>
        {held.intake?.content.done_when && (
          <div className="field">
            <b>開案時你寫的完成條件：{held.intake.content.done_when}</b>
            <Chips options={DONE_WHEN} value={form.done_when_met as (typeof DONE_WHEN)[number] | undefined} label="做到了沒有" onPick={(done_when_met) => set({ done_when_met })} />
          </div>
        )}

        <h3 className="mt14">還信不信 AI？五個面向</h3>
        <p className="how">信任不是喜歡系統，也不是因為它講得流暢。每一格只寫你看到的。</p>
        {TRUST.map((item) => (
          <Cell key={item.key} id={`trust-${item.key}`} label={item.name} hint={item.question}>
            <textarea id={`trust-${item.key}`} value={form.trust?.[item.key] ?? ""} maxLength={1000} onChange={(event) => set({ trust: { ...form.trust, [item.key]: event.target.value } })} />
          </Cell>
        ))}
        <Cell id="delegate" label="哪些事還交給 AI，哪些不交" hint="要改，回「協作合約」改。例：你已經會自己找反例，下一輪就讓 AI 等你寫完再挑戰。"><textarea id="delegate" value={form.delegate_note ?? ""} maxLength={1000} onChange={(event) => set({ delegate_note: event.target.value })} /></Cell>

        <div className="field">
          <b>當時哪個出處錯了（選填）</b>
          <p className="hint">標出來，以後同一個出處再出現時，會提醒你。系統不會自動降低它的分量。{held && held.origins.length > 0 ? "這個案子找回來的出處，直接點；不在裡面的，寫它的名字。" : ""}</p>
          {wrong.map((item, index) => (
            <div key={index} className="btns">
              {held && held.origins.length > 0 && (
                <div className="chips" role="group" aria-label={`錯的出處 ${index + 1} 是哪一個`}>
                  {held.origins.map((origin) => {
                    const on = origin.cards.some((card) => (item.cards ?? []).includes(card.card));   // by its pages: a regroup does not lose it
                    // a second press takes the pick back; typing a name instead drops the cards
                    return <button key={origin.origin_id} type="button" className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => setWrong(wrong.map((entry, at) => (at !== index ? entry : on ? { source: "", why: entry.why } : { ...entry, source: originName(origin), cards: origin.cards.map((card) => card.card) })))}>{originName(origin)}</button>;
                  })}
                </div>
              )}
              <input className="search" aria-label={`錯的出處 ${index + 1}`} placeholder="哪個出處" value={item.cards?.length ? "" : item.source} maxLength={300} onChange={(event) => setWrong(wrong.map((entry, at) => (at === index ? { source: event.target.value, why: entry.why } : entry)))} />
              <input className="search" aria-label={`錯的出處 ${index + 1} 為什麼`} placeholder="錯在哪" value={item.why ?? ""} maxLength={500} onChange={(event) => setWrong(wrong.map((entry, at) => (at === index ? { ...entry, why: event.target.value } : entry)))} />
            </div>
          ))}
          <div className="btns"><button className="btn ghost" type="button" onClick={() => setWrong([...wrong, { source: "", why: "" }])}>再加一個</button></div>
        </div>

        <h3 className="mt14">你決定</h3>
        <Chips options={DECISIONS} value={form.decision as (typeof DECISIONS)[number] | undefined} label="維持、出新版，還是換方法" onPick={(decision) => set({ decision })} />
        {form.decision === "出新版判斷" && <Cell id="updated" label="更新後的判斷條件" hint="存好之後，到「判斷」出新的一版，會看到這一句。"><textarea id="updated" value={form.updated_conditions ?? ""} maxLength={2000} onChange={(event) => set({ updated_conditions: event.target.value })} /></Cell>}
        {form.decision === "換方法再做一輪" && <Cell id="other" label="換什麼方法" hint="「拆解」會讀到這一句。"><input id="other" className="search" value={form.other_method ?? ""} maxLength={500} onChange={(event) => set({ other_method: event.target.value })} /></Cell>}
        <p className="hint">要不要修正，由你決定。AI 不替你決定。</p>

        <div className="field">
          <b>還沒用過的積木：哪一塊，可能改變結果？</b>
          <p className="hint">挑下一輪想加的；你同意，才會加。</p>
          <div className="chips" role="group" aria-label="下一輪要加的積木">
            {unused.filter((item) => (NEXT_BLOCKS as readonly string[]).includes(item.code)).map((item) => {
              const on = (form.next_blocks ?? []).includes(item.code);
              const block = blockOf(item.code);
              return <button key={item.code} type="button" className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => set({ next_blocks: on ? (form.next_blocks ?? []).filter((code) => code !== item.code) : [...(form.next_blocks ?? []), item.code] })}>{block?.name ?? item.code}{item.open ? "" : `（第 ${block?.step} 步開）`}</button>;
            })}
          </div>
        </div>

        <div className="btns mt8"><button className="btn primary big" type="button" disabled={!ready || busy} onClick={save}>{busy ? "存檔中…" : mine ? "存修改" : "存這次回顧"}</button></div>
        {!ready && <p className="hint">先寫「實際發生了什麼」，才能存。</p>}
      </div>

      <div className="card">
        <h2>你自己做到的</h2>
        <p className="how">下面是這個案子裡，你不靠 AI、自己做到的思考動作。只給你看，不打分數、不排名、不跟別人比。</p>
        {held.moves.length === 0 ? <p className="sub">這個案子裡，還看不到你不靠 AI 做到的動作。</p> : <ul>{held.moves.map((item) => <li key={item.item}><b>{item.item}</b>　{item.seen}</li>)}</ul>}
        {held.hints.map((hint) => <p key={hint} className="warn">{hint}</p>)}
        <div className="btns"><button className="btn" type="button" disabled={busy} onClick={writeHistory}>把這個案子記進我的歷程</button></div>
      </div>

      <div className="card">
        <h2>下次要保留或改變的思考習慣</h2>
        <p className="how">這是你自己的，跨案子都看得到，別人看不到。</p>
        {held.habits.slice(-3).map((item) => <p key={item.doc_id} className="mt0">{item.content.keep && <>保留：{item.content.keep}　</>}{item.content.change && <>改變：{item.content.change}</>}</p>)}
        <Cell id="keep" label="要保留的"><input id="keep" className="search" value={habit.keep} maxLength={1000} onChange={(event) => setHabit({ ...habit, keep: event.target.value })} /></Cell>
        <Cell id="change" label="要改變的"><input id="change" className="search" value={habit.change} maxLength={1000} onChange={(event) => setHabit({ ...habit, change: event.target.value })} /></Cell>
        <div className="btns"><button className="btn" type="button" disabled={busy || !(habit.keep.trim() || habit.change.trim())} onClick={saveHabit}>記下來</button></div>
      </div>

      {error && <p className="error">{error}</p>}
      <p className="sub">每天 10 分鐘的校準卡、每週的思考衝刺，在 <Link href="/me/learn">我的校準</Link>，不用開案子。</p>
    </BlockShell>
  );
}
