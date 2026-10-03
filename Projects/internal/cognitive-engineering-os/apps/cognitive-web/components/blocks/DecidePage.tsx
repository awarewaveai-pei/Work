"use client";

// DECIDE 判斷 (contract card): you write the provisional conclusion, the grounds, your confidence, what would change it.
// Every cell is yours. The AI only checks what you wrote (clear? undoable? checkable later?) and gives nothing new once you
// press 「現在我要自己下結論」. The system lists what may be influencing you and asks about eight more; what it listed and
// what you added are kept apart, with the version you save. Every version stays; two can be read side by side.
import React, { useEffect, useMemo, useState } from "react";
import { ai, docs, type Doc, type Notice } from "../../lib/blocks";
import {
  ASKED, ASKED_ANSWER, CREDIBILITY, GUARDRAIL_NAME, HOLD, INTENSITY, PRE_CHECKS, STOP_QUESTIONS, UNWINNABLE, cannotSave, emptyCells, holdAsked, influencesFrom, intensityAdvice, newPeople,
  sealedNow, sourceLine, versionRows, voicesOnMap, withMapFacts, wontChange, type Asked, type CardView, type Check, type Fact, type Judgment, type MapView, type Review, type ThinkCardView,
} from "../../lib/decide";
import { judgmentError } from "../../lib/judgment-errors";
import type { Calibration } from "../../lib/learn";
import { BlockShell, Notices } from "./BlockShell";
import { AuthorTag, Cell, Chips, linesOf, optionalDocs } from "./JudgmentParts";

type Any = Record<string, any>;
type Held = {
  judgment: Doc<Judgment> | null; check: Doc<Check> | null; reviews: Array<Doc<Review>>; seals: number[]; pause: Doc<{ why?: string }> | null;
  intake: Doc<Any> | null; guardrails: string[]; senseIntensity: string; cards: CardView[]; map: MapView | null; thinkCards: ThinkCardView[]; criteria: string[];
  notes: Any | null; updated: string; acted: string[];
};

const compact = (content: Judgment): Judgment => {
  const kept = Object.entries(content).filter(([, value]) => !(value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0) || (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0)));
  return Object.fromEntries(kept) as Judgment;
};
const filled = (answers: Record<string, string> | undefined): Record<string, string> => Object.fromEntries(Object.entries(answers ?? {}).filter(([, value]) => value.trim()));

export function DecidePage({ projectId }: { projectId: string }) {
  const [held, setHeld] = useState<Held | null>(null);
  const [form, setForm] = useState<Judgment>({});
  const [text, setText] = useState({ options: "", affected: "", added: "" });
  const [asked, setAsked] = useState<Record<string, Asked>>({});
  const [versions, setVersions] = useState<Array<Doc<Judgment>>>([]);
  const [pair, setPair] = useState<[number, number]>([1, 2]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [answer, setAnswer] = useState<{ hold: string; reviewer: string; note: string }>({ hold: "", reviewer: "", note: "" });
  const [pauseWhy, setPauseWhy] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const fill = (saved: Doc<Judgment> | null, intake: Doc<Any> | null) => {
    const base: Judgment = saved ? { ...saved.content, revision_reason: "" } : { affected: intake?.content.affected ?? [], facts: [] };   // a new version needs its own reason
    setForm(base);
    setText({ options: (base.options ?? []).join("\n"), affected: (base.affected ?? []).join("\n"), added: (base.influences_added ?? []).join("\n") });
    setAsked(Object.fromEntries((base.influences_asked ?? []).map((item) => [item.who, item])));
  };

  const load = async (): Promise<Held> => {
    const [judgments, checks, reviews, seals, pauses, intakes, guardrails, states, cards, maps, thinkCards, rounds, notes, calibrations, actNotes] = await Promise.all([
      docs.list<Judgment>(projectId, "decide.judgment"), docs.list<Check>(projectId, "decide.check"), docs.list<Review>(projectId, "decide.review"),
      docs.list<{ for_version: number }>(projectId, "decide.seal"), docs.list<{ why?: string }>(projectId, "decide.pause"),
      docs.list<Any>(projectId, "assembler.intake"), docs.list<{ guardrail: string }>(projectId, "govern.guardrail"), docs.list<{ intensity?: string }>(projectId, "sense.state"),
      optionalDocs<CardView["content"]>(projectId, "sense.card"), optionalDocs<MapView>(projectId, "map.map"), optionalDocs<ThinkCardView["content"]>(projectId, "think.card"),
      optionalDocs<{ criteria?: string[] }>(projectId, "think.round"), optionalDocs<Any>(projectId, "context.notes"), optionalDocs<Calibration>(projectId, "learn.calibration"),
      optionalDocs<{ happened?: string }>(projectId, "act.note"),
    ]);
    const next: Held = {
      judgment: judgments.at(-1) ?? null, check: checks.at(-1) ?? null, reviews, seals: seals.map((seal) => seal.content.for_version), pause: pauses.at(-1) ?? null,
      intake: intakes.at(-1) ?? null, guardrails: guardrails.map((doc) => doc.content.guardrail),
      senseIntensity: states.at(-1)?.content.intensity ?? "",   // only the strength: the cards of 外化 are not read here
      cards, map: maps.at(-1)?.content ?? null, thinkCards: thinkCards.map((doc) => ({ author: doc.author, content: doc.content })),
      criteria: [...new Set(rounds.flatMap((round) => round.content.criteria ?? []))],
      notes: notes.at(-1)?.content ?? null,
      updated: calibrations.filter((doc) => doc.content.decision === "出新版判斷" && doc.content.updated_conditions).at(-1)?.content.updated_conditions ?? "",
      acted: actNotes.map((doc) => doc.content.happened ?? "").filter(Boolean).slice(-3),
    };
    setHeld(next);
    if (next.judgment && next.judgment.version > 1) docs.versions<Judgment>(projectId, "decide.judgment", next.judgment.doc_id).then((found) => { setVersions(found); setPair([found.length - 1, found.length]); }).catch(() => undefined);
    return next;
  };
  useEffect(() => { load().then((next) => fill(next.judgment, next.intake)).catch((reason) => setError(judgmentError(reason))); }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const run = (work: () => Promise<void>) => async () => {
    setError(""); setBusy(true);
    try { await work(); await load(); setRefresh((count) => count + 1); } catch (reason) { setError(judgmentError(reason)); } finally { setBusy(false); }
  };

  const judgment = held?.judgment ?? null;
  const nextVersion = (judgment?.version ?? 0) + 1;
  const draft = (): Judgment => compact({
    ...form, options: linesOf(text.options), affected: linesOf(text.affected), influences_added: linesOf(text.added),
    stop_answers: filled(form.stop_answers), pre_checks: filled(form.pre_checks), influences_asked: Object.values(asked).filter((item) => item.answer),
    facts: (form.facts ?? []).filter((fact) => fact.text.trim()),
  });
  const set = (patch: Judgment) => setForm((current) => ({ ...current, ...patch }));
  const setFact = (index: number, patch: Partial<Fact>) => set({ facts: (form.facts ?? []).map((fact, at) => (at === index ? { ...fact, ...patch } : fact)) });
  const addToLines = (key: "options", line: string) => setText((current) => ({ ...current, [key]: linesOf(current[key]).includes(line) ? current[key] : [...linesOf(current[key]), line].join("\n") }));

  const sealed = sealedNow(judgment?.version ?? 0, held?.seals ?? []);
  const voices = useMemo(() => voicesOnMap(held?.map ?? null, held?.cards ?? []), [held]);
  const listed = useMemo(() => influencesFrom({ facts: form.facts ?? [], map: held?.map ?? null, voices, thinkCards: held?.thinkCards ?? [], facilitated: (held?.intake?.content.blocks ?? []).includes("FACILITATE") }), [form.facts, held, voices]);

  const save = run(async () => {
    const content = { ...draft(), influences_listed: listed };
    const saved = judgment ? await docs.update(projectId, "decide.judgment", judgment, content) : await docs.create(projectId, "decide.judgment", content);
    setNotices(saved.notices);
    const added = newPeople(held?.intake?.content.affected ?? [], content.affected ?? []);
    if (added.length && held?.intake) await docs.update(projectId, "assembler.intake", held.intake, { ...held.intake.content, affected: [...(held.intake.content.affected ?? []), ...added] });   // 你補的寫回開案資料
    fill(saved, held?.intake ?? null);
  });
  const seal = run(async () => { await docs.create(projectId, "decide.seal", { for_version: nextVersion }); });
  const pause = run(async () => { await docs.create(projectId, "decide.pause", pauseWhy.trim() ? { why: pauseWhy.trim() } : {}); setPauseWhy(""); });
  const resume = run(async () => { if (held?.pause) await docs.remove(projectId, "decide.pause", held.pause.doc_id); });
  const askCheck = run(async () => {
    const turn = await ai<Check>(projectId, "DECIDE", "check", {}, held?.check);
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
    else setConfirmed([]);
  });
  const check = held?.check ?? null;
  const mine = check ? (held?.reviews ?? []).filter((review) => review.content.check === check.doc_id && review.content.version === check.version).at(-1) ?? null : null;
  const reply = run(async () => {
    if (!check) return;
    const content: Review = { check: check.doc_id, version: check.version, irreversible: confirmed, ...(answer.hold ? { hold: answer.hold } : {}), ...(answer.reviewer.trim() ? { reviewer: answer.reviewer.trim() } : {}), ...(answer.note.trim() ? { note: answer.note.trim() } : {}) };
    await docs.create(projectId, "decide.review", content);
  });

  const reason = cannotSave(form, nextVersion);
  const empty = emptyCells(draft(), nextVersion);
  const guarded = (held?.guardrails ?? []).includes("wait_or_review") && confirmed.length > 0;   // the question stays on the screen while you answer it
  const holding = holdAsked(held?.guardrails ?? [], mine?.content.irreversible ?? confirmed, mine?.content.hold ?? answer.hold);
  const wontChangeNow = wontChange(form.change_condition);
  const unwinnable = held?.map?.unwinnable === true;
  const [left, right] = pair;
  const compared = versions.length >= 2 && versions[left - 1] && versions[right - 1] ? versionRows(versions[left - 1].content, versions[right - 1].content) : [];

  if (!held) return <BlockShell projectId={projectId} code="DECIDE"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;
  const guards = [...new Set(held.guardrails)];
  const norm = held.notes;

  return (
    <BlockShell projectId={projectId} code="DECIDE" refresh={refresh}>
      <Notices notices={notices} />
      {notices.filter((notice) => notice.type === "guardrail").length > 0 && <div className="card accent"><p className="mt0">你寫的東西碰到：{notices.map((notice) => (notice.type === "guardrail" ? notice.category : "")).filter(Boolean).join("、")}。這個案子加了護欄。</p></div>}

      <div className="card">
        <h2>你自己下結論</h2>
        <p className="how">這一塊只有你能填。AI 只檢查你寫得清不清楚、做了能不能反悔、之後能不能回頭對；它不替你填結論，也不替你選。要的是可以修正，不是一次到位。</p>
        <p className="sub">{judgment ? `目前是第 ${judgment.version} 版，舊版都留著。你可以改任何一格，也可以出新的一版。` : "還沒有判斷卡。"}</p>
        {held.pause ? (
          <div className="judge">
            <p className="mt0"><b>你選了「現在先不決定」。</b>{held.pause.content.why ? `你寫的原因：${held.pause.content.why}` : ""}</p>
            <div className="btns"><button className="btn" type="button" disabled={busy} onClick={resume}>撤回，繼續寫</button></div>
          </div>
        ) : (
          <div className="judge">
            <label htmlFor="pause-why">現在還不想下結論？可以先不決定（原因選填）</label>
            <input id="pause-why" className="search" value={pauseWhy} maxLength={1000} onChange={(event) => setPauseWhy(event.target.value)} />
            <div className="btns"><button className="btn ghost" type="button" disabled={busy} onClick={pause}>現在先不決定</button></div>
          </div>
        )}
      </div>

      {guards.length > 0 && <div className="card accent"><p className="mt0">這個案子有護欄：{guards.map((name) => GUARDRAIL_NAME[name] ?? name).join("、")}。</p></div>}

      <div className="card">
        <h2>下判斷前：現在情緒和急迫感多強？</h2>
        <Chips options={INTENSITY} value={form.intensity_now as (typeof INTENSITY)[number] | undefined} onPick={(intensity_now) => set({ intensity_now })} label="現在的強度" />
        {held.senseIntensity && <p className="sub">你在「外化」標的強度是：{held.senseIntensity}。</p>}
        {intensityAdvice(form.intensity_now) && <p className="warn">{intensityAdvice(form.intensity_now)}</p>}
      </div>

      <div className="card">
        <h2>這次可能在影響你的</h2>
        <p className="how">系統列的，和你自己補的，分開記。這不是要你一定改，是要你看得見。</p>
        <h3>系統列的</h3>
        <ul>{listed.slice(0, 8).map((item, index) => <li key={`${item.kind}-${index}`}>{item.text}</li>)}</ul>
        {listed.length > 8 && <details><summary>還有 {listed.length - 8} 項</summary><ul>{listed.slice(8).map((item, index) => <li key={`${item.kind}-${index}`}>{item.text}</li>)}</ul></details>}
        <h3 className="mt12">系統也問你：有沒有在影響這個判斷？</h3>
        {ASKED.map((item) => (
          <div key={item.who} className="field">
            <b>{item.who}</b>
            <p className="hint">{item.hint}</p>
            <Chips options={ASKED_ANSWER} value={asked[item.who]?.answer as (typeof ASKED_ANSWER)[number] | undefined} label={`${item.who}有沒有影響`}
              onPick={(answerValue) => setAsked((current) => ({ ...current, [item.who]: { ...current[item.who], who: item.who, answer: answerValue } }))} />
            {asked[item.who]?.answer === "有" && <input className="search" aria-label={`${item.who}怎麼影響`} placeholder="怎麼影響（選填）" value={asked[item.who]?.note ?? ""} maxLength={300}
              onChange={(event) => setAsked((current) => ({ ...current, [item.who]: { ...current[item.who], note: event.target.value } }))} />}
          </div>
        ))}
        <Cell id="added" label="你自己補的（一行一個）" hint="系統沒列、也沒問到的，例如某個朋友、某本書、某個群組。">
          <textarea id="added" value={text.added} onChange={(event) => setText({ ...text, added: event.target.value })} />
        </Cell>
      </div>

      <div className="card cta">
        <h2>判斷卡</h2>
        <Cell id="conclusion" label="你的暫定結論" hint="一句話寫你現在的結論。AI 不會替你寫。"><textarea id="conclusion" value={form.conclusion ?? ""} maxLength={4000} onChange={(event) => set({ conclusion: event.target.value })} /></Cell>
        <Cell id="problem" label="問題目前怎麼被定義，為什麼這樣定義"><textarea id="problem" value={form.problem_definition ?? ""} maxLength={2000} onChange={(event) => set({ problem_definition: event.target.value })} /></Cell>

        <div className="field">
          <b>已知事實、來源與可信度 <span className="tags"><span>這次沒做查證</span></span></b>
          <p className="hint">系統只告訴你有幾個獨立出處；可不可信，由你標。</p>
          {(form.facts ?? []).map((fact, index) => {
            const line = sourceLine(fact);
            return (
              <div key={index} className="mcard">
                <input className="search" aria-label={`事實 ${index + 1}`} value={fact.text} maxLength={500} onChange={(event) => setFact(index, { text: event.target.value })} />
                <span className={line.warn ? "need" : "k"}>{line.text}</span>
                <Chips options={CREDIBILITY} value={fact.credibility as (typeof CREDIBILITY)[number] | undefined} label={`事實 ${index + 1} 可不可信`} onPick={(credibility) => setFact(index, { credibility })} />
                <div className="btns"><button className="btn ghost" type="button" onClick={() => set({ facts: (form.facts ?? []).filter((_, at) => at !== index) })}>拿掉這一條</button></div>
              </div>
            );
          })}
          <div className="btns">
            <button className="btn" type="button" onClick={() => set({ facts: [...(form.facts ?? []), { text: "", sources: 0, self_said: true }] })}>加一條事實</button>
            {withMapFacts(form.facts ?? [], held.map).length > (form.facts ?? []).length && <button className="btn" type="button" onClick={() => set({ facts: withMapFacts(form.facts ?? [], held.map) })}>把地圖上的事實帶進來</button>}
          </div>
        </div>

        <Cell id="assumptions" label="假設和它的依據"><textarea id="assumptions" value={form.assumptions ?? ""} maxLength={2000} onChange={(event) => set({ assumptions: event.target.value })} /></Cell>
        <Cell id="norm" label="涉及的規範脈絡" hint="適用哪裡的法律、權利與義務、政治／文化／宗教／倫理價值、誰承擔後果。">
          {norm && (
            <div className="carried">
              <b>你在「規範與脈絡」寫的</b>
              {(norm.jurisdictions ?? []).length > 0 && <p className="mt4 mb0">適用哪裡的法律：{norm.jurisdictions.join("、")}</p>}
              {norm.rights_duties && <p className="mt4 mb0">權利與義務：{norm.rights_duties}</p>}
              {norm.norm_origin && <p className="mt4 mb0">規範從哪來：{norm.norm_origin}</p>}
              {norm.stance && <p className="mt4 mb0">你暫定的立場：{norm.stance}</p>}
              {(norm.facets ?? []).filter((item: Any) => item.relevant).length > 0 && <p className="mt4 mb0">你標有關的面向：{(norm.facets as Any[]).filter((item) => item.relevant).map((item) => item.facet).join("、")}</p>}
              {norm.interface && Object.keys(norm.interface).length > 0 && <p className="mt4 mb0">公共議題的五題，你答了 {Object.keys(norm.interface).length} 題。</p>}
            </div>
          )}
          <textarea id="norm" value={form.norm_context ?? ""} maxLength={2000} onChange={(event) => set({ norm_context: event.target.value })} />
        </Cell>
        <Cell id="alt" label="至少一個替代假設或反例"><textarea id="alt" value={form.alternative ?? ""} maxLength={2000} onChange={(event) => set({ alternative: event.target.value })} /></Cell>
        <Cell id="criteria" label="判準和權衡" hint="你用什麼標準比較，各占多重。">
          <span className="tags"><span>這次沒做計算</span></span>
          {held.criteria.length > 0 && (
            <div className="carried">
              <b>你在「共思考」寫的候選判準（按一下放進來）</b>
              <div className="chips">{held.criteria.map((item) => <button key={item} type="button" className="chip" onClick={() => set({ criteria: [form.criteria ?? "", item].filter(Boolean).join("\n") })}>{item}</button>)}</div>
            </div>
          )}
          <textarea id="criteria" value={form.criteria ?? ""} maxLength={2000} onChange={(event) => set({ criteria: event.target.value })} />
        </Cell>
        <Cell id="uncertainty" label="仍然不確定的地方（必填）" hint="真的不知道，就寫「不知道」，那也是一種產出。"><textarea id="uncertainty" value={form.uncertainty ?? ""} maxLength={2000} onChange={(event) => set({ uncertainty: event.target.value })} /></Cell>
        <Cell id="change" label="什麼證據或事件會改變這個結論（必填）" hint="寫「沒有」也可以，系統會標出「這一版不打算改」，不算你做錯。">
          {held.updated && (
            <div className="carried">
              <b>你回顧時寫的更新條件</b><p className="mt4 mb0">{held.updated}</p>
              <div className="btns mt6"><button className="btn" type="button" onClick={() => set({ change_condition: [form.change_condition ?? "", held.updated].filter(Boolean).join("\n") })}>放進這一格</button></div>
            </div>
          )}
          <textarea id="change" value={form.change_condition ?? ""} maxLength={2000} onChange={(event) => set({ change_condition: event.target.value })} />
          {wontChangeNow && <p className="warn">這一版不打算改。你可以之後回來，再想想有沒有什麼會讓你重新考慮。</p>}
        </Cell>
        <Cell id="confidence" label="你的信心有多少（0 到 100，必填）">
          <input id="confidence" className="search" type="number" min={0} max={100} step={1} value={form.confidence ?? ""} onChange={(event) => set({ confidence: event.target.value === "" ? undefined : Number(event.target.value) })} />
        </Cell>

        <h3 className="mt14">什麼時候停止分析？</h3>
        <p className="how">四題都回答，免得一直分析下去。這跟任務卡上「行動的停止條件」是兩件事。</p>
        {STOP_QUESTIONS.map((item) => (
          <Cell key={item.key} id={`stop-${item.key}`} label={item.question}>
            <textarea id={`stop-${item.key}`} value={form.stop_answers?.[item.key] ?? ""} maxLength={1000} onChange={(event) => set({ stop_answers: { ...form.stop_answers, [item.key]: event.target.value } })} />
          </Cell>
        ))}

        {unwinnable && (
          <div className="carried mt10">
            <b>你在「拆解」把這個局標成解不了。</b>
            <p className="mt4">選項裡要列出：退出、止損、換目標，不只有「更努力」。按一下加進選項：</p>
            <Chips options={UNWINNABLE} value={undefined} label="解不了的局的出路" onPick={(way) => addToLines("options", way)} />
          </div>
        )}
        <Cell id="options" label="你比較的選項（一行一個）"><textarea id="options" value={text.options} onChange={(event) => setText({ ...text, options: event.target.value })} /></Cell>

        <h3 className="mt14">下決定前，先問自己四題</h3>
        {PRE_CHECKS.map((item) => (
          <Cell key={item.key} id={`pre-${item.key}`} label={item.question} hint={item.example}>
            <textarea id={`pre-${item.key}`} value={form.pre_checks?.[item.key] ?? ""} maxLength={1000} onChange={(event) => set({ pre_checks: { ...form.pre_checks, [item.key]: event.target.value } })} />
          </Cell>
        ))}

        <Cell id="next" label="下一步（一句話）" hint="例：「先跟他談一次條件」。這一句交給「行動與觀察」；預測、期限、風險和停止條件，寫在那邊的任務卡上。">
          <input id="next" className="search" value={form.next_step ?? ""} maxLength={500} onChange={(event) => set({ next_step: event.target.value })} />
        </Cell>
        <Cell id="deciders" label="誰有決定權" hint="誰會受影響，是開案時你寫的，先帶進來。有新增的人，你補上；存的時候，會一起寫回開案資料。">
          <input id="deciders" className="search" value={form.deciders ?? ""} maxLength={500} onChange={(event) => set({ deciders: event.target.value })} />
          <label htmlFor="affected">誰會受影響（一行一個）</label>
          <textarea id="affected" value={text.affected} onChange={(event) => setText({ ...text, affected: event.target.value })} />
        </Cell>
        {nextVersion > 1 && (
          <Cell id="reason" label="這一版為什麼改（必填）" hint="寫下新資訊，或你想法的改變。">
            {held.acted.length > 0 && <div className="carried"><b>行動之後你記的</b><ul className="mb0">{held.acted.map((line, index) => <li key={index}>{line}</li>)}</ul></div>}
            <textarea id="reason" value={form.revision_reason ?? ""} maxLength={1000} onChange={(event) => set({ revision_reason: event.target.value })} />
          </Cell>
        )}

        {empty.length > 0 && <div className="judge"><b>還空著的格子</b><ul>{empty.map((item) => <li key={item}>{item}</li>)}</ul><p className="sub mb0">空著也可以先存；必填的三格加上情緒強度填了，就能存。</p></div>}
        {reason && <p className="hint">{reason}</p>}
        <div className="btns mt8">
          <button className="btn primary big" type="button" disabled={busy || reason !== null} onClick={save}>{busy ? "存檔中…" : judgment ? `存成第 ${nextVersion} 版` : "存這一版"}</button>
          <button className="btn" type="button" disabled={busy || sealed} onClick={seal}>現在我要自己下結論</button>
        </div>
        {sealed && <p className="sub">你按了「現在我要自己下結論」：這一版 AI 不再給新答案。存下一版之後，才能再請它檢查。</p>}
      </div>

      <div className="card">
        <h2>請 AI 檢查你寫的</h2>
        <p className="how">AI 只指出：哪裡不清楚、哪些做了不能反悔、之後能不能回頭對、超出適用範圍的地方、哪一格還空著、哪裡前後矛盾，最多問你一題。它不改你的卡。</p>
        <div className="btns"><button className="btn" type="button" disabled={!judgment || sealed || busy} onClick={askCheck}>{busy ? "檢查中…" : check ? "再檢查一次" : "請 AI 檢查"}</button></div>
        {!judgment && <p className="hint">先存判斷卡，才能請 AI 檢查。</p>}
        {check && (
          <div className="judge">
            <AuthorTag author={check.author} />
            <p className="sub">這是 AI 對你寫的內容的檢查，你之後改過的地方，要再檢查一次。</p>
            {([["哪裡不清楚", check.content.clarity], ["哪些做了不能反悔，或很難反悔", check.content.reversibility], ["超出適用範圍的地方", check.content.out_of_scope], ["還空著的格子", check.content.gaps], ["前後矛盾", check.content.contradictions]] as Array<[string, string[] | undefined]>)
              .filter(([, items]) => items && items.length > 0).map(([title, items]) => <div key={title}><b>{title}</b><ul>{items!.map((item) => <li key={item}>{item}</li>)}</ul></div>)}
            {check.content.revisitable && <p><b>之後能不能回頭對：</b>{check.content.revisitable}</p>}
            {check.content.question && <p><b>一個問題：</b>{check.content.question}</p>}

            {(check.content.reversibility ?? []).length > 0 && !mine && (
              <div className="field">
                <b>哪些是真的不能反悔？由你確認</b>
                <ul className="check">{check.content.reversibility!.map((item) => (
                  <li key={item}><label><input type="checkbox" checked={confirmed.includes(item)} onChange={(event) => setConfirmed(event.target.checked ? [...confirmed, item] : confirmed.filter((value) => value !== item))} /> {item}</label></li>
                ))}</ul>
                {guarded && (
                  <div className="carried">
                    <b>這個案子有護欄：不能反悔的決定，請先等一下，或請人覆核。</b>
                    <Chips options={HOLD} value={answer.hold as (typeof HOLD)[number] | ""} label="先等一下或請人覆核" onPick={(value) => setAnswer({ ...answer, hold: value })} />
                    {answer.hold === "請人覆核" && <input className="search" aria-label="請誰覆核" placeholder="請誰覆核" value={answer.reviewer} maxLength={200} onChange={(event) => setAnswer({ ...answer, reviewer: event.target.value })} />}
                  </div>
                )}
                <label htmlFor="review-note">你想補一句（選填）</label>
                <input id="review-note" className="search" value={answer.note} maxLength={1000} onChange={(event) => setAnswer({ ...answer, note: event.target.value })} />
                <div className="btns mt8"><button className="btn primary" type="button" disabled={busy || holding} onClick={reply}>存我的確認</button></div>
              </div>
            )}
            {mine && <p><b>你的回應：</b>確認 {mine.content.irreversible?.length ?? 0} 個不能反悔的地方{mine.content.hold ? `，選了「${mine.content.hold}」` : ""}{mine.content.reviewer ? `，請 ${mine.content.reviewer} 覆核` : ""}。</p>}
          </div>
        )}
      </div>

      {versions.length >= 2 && (
        <div className="card">
          <h2>兩個版本並排看</h2>
          <div className="chips" role="group" aria-label="左邊的版本">{versions.map((item) => <button key={`l${item.version}`} type="button" className={`chip${left === item.version ? " on" : ""}`} aria-pressed={left === item.version} onClick={() => setPair([item.version, right])}>左：第 {item.version} 版</button>)}</div>
          <div className="chips" role="group" aria-label="右邊的版本">{versions.map((item) => <button key={`r${item.version}`} type="button" className={`chip${right === item.version ? " on" : ""}`} aria-pressed={right === item.version} onClick={() => setPair([left, item.version])}>右：第 {item.version} 版</button>)}</div>
          <div className="scroll-x">
            <table>
              <thead><tr><th>格子</th><th>第 {left} 版</th><th>第 {right} 版</th></tr></thead>
              <tbody>{compared.map((row) => <tr key={row.label}><td>{row.label}{row.changed ? "（改了）" : ""}</td><td>{row.a}</td><td>{row.b}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {judgment?.content.next_step && <p className="sub">你寫的下一步：「{judgment.content.next_step}」，在「行動與觀察」變成任務卡。</p>}
    </BlockShell>
  );
}
