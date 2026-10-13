"use client";

// COLLAB 共同程序 for one group (cards 20-22; docs/platform/STEP34_SHARED_RULES.md §7-§8): a few people hold one decision
// without anyone being talked over. Write before see: a position, what changed, the interface answers of a round are
// asked for as "mine only" until you saved yours, and nothing of another member's is drawn before then. No count of
// anything is shown and nothing is ranked; the platform offers a procedure, it does not say the decision was fair.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import type { Notice } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { collab, groups, INTERFACE_QUESTIONS, plainNote, type Agreement, type AgreementTable, type Authority, type Dissent, type Group, type GroupPage, type Item, type Shared } from "../../lib/groups";
import { Notices } from "./BlockShell";
import { Cell } from "./JudgmentParts";
import { Missing, Refused, firstMissing, type Failed } from "./PageParts";
import { ProcessFacts } from "./ProcessFacts";

type Position = { round: number; text: string; confidence?: string };
type Change = { round: number; after_reading: "no change" | "changed"; what?: string };
type Answers = { round: number; answers: Array<{ q: string; text: string }> };
type Option = { round: number; text: string; risks?: string; values_tradeoff?: string; evidence_refs?: unknown[] };
type Stance = { option: string; stance: "同意" | "異議"; reason: string };
type Closing = { why_end: string; reopen_if: string; review_on: string; owner: string };
type Proposal = { express_draft?: string; text: string };   // express_draft points into the proposer's own case: never drawn

export const BADGE = "這是程序工具。它不保證公平，也不保證大家真的同意。";
export const WRITE_FIRST = "寫完，才看得到別人的";
const AI_TAG = <span className="tags"><span>AI 寫的</span></span>;

type Loaded = {
  group: Group; round: number; questions: Array<Item<{ text: string; round: number }>>; versions: Record<string, Array<Item<{ text: string }>>>;
  positions: Array<Item<Position>>; changes: Array<Item<Change>>; answers: Array<Item<Answers>>; wrote: { position: boolean; change: boolean; answers: boolean };
  options: Array<Item<Option>>; stances: Array<Item<Stance>>; dissent: Dissent[]; authority: Authority; reopens: Array<Item<{ reason: string }>>;
  closings: Array<Item<Closing>>; restatements: Array<Item<{ about: string; position: string; text: string }>>; confirms: Array<Item<{ restatement: string; verdict: string }>>;
  differences: Array<Item<{ round: number; differences: string[] }>>; agreement: Agreement; consequences: Array<Item<{ decision: string; observed: string }>>;
  reviews: Array<Item<{ text: string }>>; labels: Array<Item<{ label: string }>>; places: Array<Item<{ where: string }>>; proposals: Array<Item<Proposal>>;
  shared: Shared[];
};

/** A kind written before seen: only my own until I wrote mine of this round -- the server sends no more, and the page draws no
 *  more even if it did. */
const blind = <C,>(found: GroupPage, kind: string): [Array<Item<C>>, boolean] => {
  const wrote = Boolean(found.wrote[kind]);
  const items = (found.records[kind] ?? []) as Array<Item<C>>;
  return [wrote ? items : items.filter((item) => item.mine), wrote];
};

export function CollabPage({ groupId }: { groupId: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<Failed>(null);
  const [busy, setBusy] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [said, setSaid] = useState("");   // the last hand-back or a plain answer from the AI turn
  const [notHeard, setNotHeard] = useState<string[] | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: event.target.value });

  // One request for the whole page (2026-10-13: ~24 requests in four waves took 9 s over a slow link), again after every action.
  const load = async () => {
    const found = await collab.page(groupId);
    const of = <C,>(kind: string) => (found.records[kind] ?? []) as Array<Item<C>>;
    const [positions, position] = blind<Position>(found, "collab.position");
    const [changes, change] = blind<Change>(found, "collab.change");
    const [answers, answered] = blind<Answers>(found, "collab.interface_answers");
    setData({ group: found.group, round: found.round, questions: of("collab.question"), versions: found.versions as Loaded["versions"], positions, changes, answers,
      wrote: { position, change, answers: answered }, options: of("collab.option"), stances: of("collab.stance"), dissent: found.dissent, authority: found.authority,
      reopens: of("collab.reopen"), closings: of("collab.closing"), restatements: of("collab.restatement"), confirms: of("collab.confirm"), differences: of("collab.differences"),
      agreement: found.agreement, consequences: of("collab.consequence"), reviews: of("collab.review"), labels: of("collab.label"), places: of("collab.place"),
      proposals: of("collab.proposal"), shared: found.shared });
  };
  useEffect(() => { load().catch((reason) => setError(humanError(reason))); }, [groupId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // `at`: the card that sent it; its refusal is shown there (PageParts.Refused)
  const run = (at: string, work: () => Promise<unknown>) => async () => {
    setFailed(null); setBusy(true);
    try { await work(); await load(); } catch (reason) { setFailed({ at, text: humanError(reason) }); } finally { setBusy(false); }
  };
  const write = <C,>(at: string, kind: string, content: C, keys: string[] = []) => run(at, async () => {
    const saved = await collab.create(groupId, kind, content);
    setNotices(saved.notices);
    setForm(Object.fromEntries(Object.entries(form).filter(([key]) => !keys.includes(key))));
  });

  if (!data) return <><div className="crumbs"><Link href="/groups">我的群組</Link></div><div className="card"><p>{error || "載入中…"}</p></div></>;
  const { group, round } = data;
  const convener = group.my_role === "convener";
  const thisRound = <C extends { round: number }>(items: Array<Item<C>>) => items.filter((item) => item.content.round === round);
  const seen = [...data.reopens, ...data.stances.filter((item) => item.content.stance === "異議")].map((item) => `${item.doc_id}@${item.version}`);
  const held = (group.members ?? []).filter((member) => member.review_state === "pending_review");
  const question = data.questions.filter((item) => item.content.round === round).at(-1);
  const myStance = (option: string) => data.stances.find((item) => item.mine && item.content.option === option);
  const optionText = (option: string) => data.options.find((item) => item.doc_id === option)?.content.text ?? "（方案已刪除）";

  const ask = (action: string, context: Record<string, unknown>) => run("ai", async () => {
    const turn = await collab.ai(groupId, action, { seen, ...context });
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
    setSaid(turn.handback ?? (turn.saved?.waiting ? "轉述先給本人看。本人確認說得對之後，大家才看得到。" : ""));
  });
  const restateAll = run("ai", async () => {
    for (const item of thisRound(data.positions)) {
      const turn = await collab.ai(groupId, "restate_positions", { seen, position: item.doc_id });
      if (turn.handback || turn.stopped) { setSaid(turn.handback ?? turn.notice ?? ""); return; }
    }
    setSaid("轉述先給每位本人看。本人確認說得對之後，大家才看得到。");
  });

  return (
    <>
      <div className="crumbs"><Link href="/groups">我的群組</Link> › {group.name}</div>
      <h1>{group.name}</h1>
      <p className="tags"><span>{BADGE}</span></p>
      {group.held_notice && <div className="card accent"><p className="mt0">{group.held_notice}</p></div>}
      {group.status === "closed" && <p className="sub">這個群組已經結束。還可以寫回顧、決定之後的後果，也還可以要求重開。</p>}
      <Notices notices={notices} />
      {error && <div className="card accent" role="alert"><p className="mt0">{error}</p></div>}

      <div className="card">
        <h2>這次要決定的問題（第 {round} 輪）</h2>
        {data.questions.map((item) => (
          <div key={item.doc_id}>
            <p className="sub mt0">第 {item.content.round} 輪：每一種寫法都留著。</p>
            {(data.versions[item.doc_id] ?? [item]).map((version) => <p key={version.version}>{version.content.text}<span className="sub">（{version.who}寫的）</span></p>)}
          </div>
        ))}
        <Cell id="question-text" label={question ? "寫另一種問法" : "寫下這次要決定的問題"}><textarea id="question-text" value={form.question ?? ""} maxLength={2000} onChange={set("question")} /></Cell>
        <div className="btns">
          <button className="btn" type="button" disabled={busy || !(form.question ?? "").trim()}
            onClick={question ? run("question", async () => { await collab.update(groupId, "collab.question", question, { text: form.question.trim(), round }); setForm({ ...form, question: "" }); })
              : write("question", "collab.question", { text: (form.question ?? "").trim(), round }, ["question"])}>存這個問法</button>
          {question && <button className="btn ghost" type="button" disabled={busy || !(form.question ?? "").trim()} onClick={write("question", "collab.question", { text: (form.question ?? "").trim(), round: round + 1 }, ["question"])}>用這個問法開新的一輪</button>}
        </div>
        <Refused failed={failed} at="question" />
      </div>

      <div className="card">
        <h2>寫自己的立場</h2>
        {!data.wrote.position && <p className="how">{WRITE_FIRST}</p>}
        {!data.wrote.position && (
          <>
            <Cell id="position-text" label="你的立場"><textarea id="position-text" value={form.position ?? ""} maxLength={4000} onChange={set("position")} /></Cell>
            <Cell id="position-confidence" label="你有多確定" hint="用你自己的話寫。"><input id="position-confidence" value={form.confidence ?? ""} maxLength={200} onChange={set("confidence")} /></Cell>
            <div className="btns"><button className="btn primary" type="button" disabled={busy || !(form.position ?? "").trim()}
              onClick={write("position", "collab.position", { round, text: (form.position ?? "").trim(), ...(form.confidence?.trim() ? { confidence: form.confidence.trim() } : {}) }, ["position", "confidence"])}>存我的立場</button></div>
            <Refused failed={failed} at="position" />
          </>
        )}
        {data.wrote.position && (
          <div className="mcards">
            {thisRound(data.positions).map((item) => <div key={item.doc_id} className="mcard"><b>{item.who}</b><p className="mt0">{item.content.text}</p>{item.content.confidence && <p className="sub mt0">多確定：{item.content.confidence}</p>}</div>)}
          </div>
        )}
      </div>

      {data.wrote.position && (
        <div className="card">
          <h2>你想法有沒有變</h2>
          {!data.wrote.change && (
            <>
              <div className="btns" role="group" aria-label="想法有沒有變">
                <button type="button" className={`chip${form.change === "no change" ? " on" : ""}`} aria-pressed={form.change === "no change"} onClick={() => setForm({ ...form, change: "no change" })}>沒變</button>
                <button type="button" className={`chip${form.change === "changed" ? " on" : ""}`} aria-pressed={form.change === "changed"} onClick={() => setForm({ ...form, change: "changed" })}>有變</button>
              </div>
              <Cell id="change-what" label="寫一句：哪裡變了，或為什麼沒變"><input id="change-what" value={form.what ?? ""} maxLength={500} onChange={set("what")} /></Cell>
              <div className="btns"><button className="btn" type="button" disabled={busy || !form.change}
                onClick={write("change", "collab.change", { round, after_reading: form.change, ...(form.what?.trim() ? { what: form.what.trim() } : {}) }, ["change", "what"])}>存這一句</button></div>
              <Missing why={!form.change && "先選想法沒變，還是有變。"} />
              <Refused failed={failed} at="change" />
            </>
          )}
          {data.wrote.change && thisRound(data.changes).map((item) => <p key={item.doc_id}><b>{item.who}</b>：{item.content.after_reading === "changed" ? "有變" : "沒變"}{item.content.what ? `。${item.content.what}` : ""}</p>)}
        </div>
      )}

      <div className="card">
        <h2>從個人的判斷，走向共同的理解</h2>
        {!data.wrote.answers && <p className="how">請獨立回答五個問題，完成並儲存後，再看看其他人有哪些不同的觀點。</p>}
        {!data.wrote.answers && (
          <>
            {INTERFACE_QUESTIONS.map((q, index) => <Cell key={q} id={`answer-${index}`} label={q} hint={plainNote(q)}><textarea id={`answer-${index}`} value={form[`answer-${index}`] ?? ""} maxLength={2000} onChange={set(`answer-${index}`)} /></Cell>)}
            <div className="btns"><button className="btn" type="button" disabled={busy || !INTERFACE_QUESTIONS.every((_, index) => (form[`answer-${index}`] ?? "").trim())}
              onClick={write("answers", "collab.interface_answers", { round, answers: INTERFACE_QUESTIONS.map((q, index) => ({ q, text: (form[`answer-${index}`] ?? "").trim() })) },
                INTERFACE_QUESTIONS.map((_, index) => `answer-${index}`))}>存我的回答</button></div>
            <Missing why={!INTERFACE_QUESTIONS.every((_, index) => (form[`answer-${index}`] ?? "").trim()) && `五題都要寫才能存：還有 ${INTERFACE_QUESTIONS.filter((_, index) => !(form[`answer-${index}`] ?? "").trim()).length} 題沒寫。`} />
            <Refused failed={failed} at="answers" />
          </>
        )}
        {data.wrote.answers && INTERFACE_QUESTIONS.map((q) => (
          <div key={q}><p className="mt8 mb0"><b>{q}</b></p><p className="hint">{plainNote(q)}</p>
            {thisRound(data.answers).flatMap((item) => item.content.answers.filter((answer) => answer.q === q).map((answer) => <p key={item.doc_id} className="mt0">{item.who}：{answer.text}</p>))}
          </div>
        ))}
      </div>

      {data.proposals.length > 0 && (
        <div className="card">
          <h2>提案</h2>
          <div className="mcards">
            {data.proposals.map((item) => (
              <div key={item.doc_id} className="mcard">
                {item.content.text.split("\n").filter((line) => line.trim()).map((line, index) => <p key={index} className="mt0">{line}</p>)}
                <p className="sub mt0">{item.who}交來的提案</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.shared.length > 0 && (
        <div className="card">
          <h2>分享給這個群組的紀錄</h2>
          <p className="how">成員自己同意分享的才會出現在這裡。沒分享的案子，這裡看不到。</p>
          <div className="mcards">
            {data.shared.map((item, index) => (
              <div key={index} className="mcard">
                <b>{item.who}分享的{item.title}</b>
                {item.lines.map((line, at) => <p key={at} className="mt0">{line}</p>)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>方案（並排，不排先後）</h2>
        <div className="mcards">
          {data.options.filter((item) => item.content.round === round).map((item) => {
            const mine = myStance(item.doc_id);
            const others = data.stances.filter((stance) => !stance.mine && stance.content.option === item.doc_id);
            return (
              <div key={item.doc_id} className="mcard">
                <b>{item.content.text}</b>
                {item.content.risks && <p className="mt0">風險：{item.content.risks}</p>}
                {item.content.values_tradeoff && <p className="mt0">要在哪些價值之間取捨：{item.content.values_tradeoff}</p>}
                <p className="sub mt0">{item.who}提的</p>
                {mine && <p className="mt0">你：{mine.content.stance}。{mine.content.reason}</p>}
                <div className="btns" role="group" aria-label={`對「${item.content.text}」`}>
                  {(["同意", "異議"] as const).map((value) => <button key={value} type="button" className={`chip${form[`stance-${item.doc_id}`] === value ? " on" : ""}`}
                    aria-pressed={form[`stance-${item.doc_id}`] === value} onClick={() => setForm({ ...form, [`stance-${item.doc_id}`]: value })}>{value}</button>)}
                </div>
                <Cell id={`reason-${item.doc_id}`} label="理由"><textarea id={`reason-${item.doc_id}`} value={form[`reason-${item.doc_id}`] ?? ""} maxLength={2000} onChange={set(`reason-${item.doc_id}`)} /></Cell>
                <div className="btns"><button className="btn" type="button" disabled={busy || !form[`stance-${item.doc_id}`] || !(form[`reason-${item.doc_id}`] ?? "").trim()}
                  onClick={run(`option-${item.doc_id}`, async () => {
                    const content = { option: item.doc_id, stance: form[`stance-${item.doc_id}`] as Stance["stance"], reason: form[`reason-${item.doc_id}`].trim() };
                    const saved = mine ? await collab.update(groupId, "collab.stance", mine, content) : await collab.create(groupId, "collab.stance", content);
                    setNotices(saved.notices);
                  })}>{mine ? "改我的意見" : "存我的意見"}</button></div>
                <Missing why={(form[`stance-${item.doc_id}`] || (form[`reason-${item.doc_id}`] ?? "").trim()) && firstMissing([!form[`stance-${item.doc_id}`], "先選同意或異議。"], [!(form[`reason-${item.doc_id}`] ?? "").trim(), "寫理由。"])} />
                <Refused failed={failed} at={`option-${item.doc_id}`} />
                {!mine && <p className="sub mt0">標了你的意見，才看得到別人對這個方案的意見。</p>}
                {others.map((stance) => <p key={stance.doc_id} className="mt0">{stance.who}：{stance.content.stance}。{stance.content.reason}</p>)}
              </div>
            );
          })}
        </div>
        <Cell id="option-text" label="提一個方案"><textarea id="option-text" value={form.option ?? ""} maxLength={2000} onChange={set("option")} /></Cell>
        <Cell id="option-risks" label="風險"><textarea id="option-risks" value={form.risks ?? ""} maxLength={2000} onChange={set("risks")} /></Cell>
        <Cell id="option-values" label="要在哪些價值之間取捨"><textarea id="option-values" value={form.values ?? ""} maxLength={2000} onChange={set("values")} /></Cell>
        <div className="btns"><button className="btn" type="button" disabled={busy || !(form.option ?? "").trim()}
          onClick={write("option", "collab.option", { round, text: (form.option ?? "").trim(), ...(form.risks?.trim() ? { risks: form.risks.trim() } : {}), ...(form.values?.trim() ? { values_tradeoff: form.values.trim() } : {}) }, ["option", "risks", "values"])}>存這個方案</button></div>
        <Refused failed={failed} at="option" />
      </div>

      <div className="card">
        <h2>保留的異議</h2>
        <p className="how">異議和理由會一直留著，不會被多數蓋掉。</p>
        {data.dissent.map((item) => <p key={item.doc_id}>{item.who}對「{optionText(item.option)}」：{item.reason}</p>)}
        <Cell id="label" label="你的異議要怎麼署名" hint="寫一個名字，或按「用匿名」。"><input id="label" value={form.label ?? data.labels.find((item) => item.mine)?.content.label ?? ""} maxLength={40} onChange={set("label")} /></Cell>
        <div className="btns">
          <button className="btn" type="button" disabled={busy || !(form.label ?? "").trim()} onClick={run("label", async () => {
            const mine = data.labels.find((item) => item.mine);
            if (mine) await collab.update(groupId, "collab.label", mine, { label: form.label.trim() }); else await collab.create(groupId, "collab.label", { label: form.label.trim() });
          })}>存署名</button>
          <button className="btn ghost" type="button" disabled={busy} onClick={run("label", async () => {
            const mine = data.labels.find((item) => item.mine);
            if (mine) await collab.update(groupId, "collab.label", mine, { label: "匿名" }); else await collab.create(groupId, "collab.label", { label: "匿名" });
          })}>用匿名</button>
        </div>
        <Refused failed={failed} at="label" />
      </div>

      <div className="card">
        <h2>授權</h2>
        <p className="how">授權給誰、範圍多大，都寫清楚。每個人只能收回自己那一份。</p>
        {data.authority.current.map((item) => (
          <div key={`${item.to}-${item.scope}`}>
            <p>{item.to}代表 {item.grantors.join("、")}：{item.scope}</p>
            {item.my_share && <div className="btns"><button className="btn ghost" type="button" disabled={busy} onClick={run("authority", () => collab.revoke(groupId, item.my_share as string))}>收回我那一份</button></div>}
          </div>
        ))}
        {data.authority.renegotiate.map((item) => <p key={`${item.at}-${item.to}`} className="warn">{item.taken_back_by}收回了給{item.to}的那一份（{item.scope}）：{item.notice}。</p>)}
        <div className="btns" role="group" aria-label="授權給誰">
          {(group.members ?? []).map((member) => <button key={member.identity_id} type="button" className={`chip${form.to === member.identity_id ? " on" : ""}`} aria-pressed={form.to === member.identity_id}
            onClick={() => setForm({ ...form, to: member.identity_id })}>{member.display_name}</button>)}
        </div>
        <Cell id="scope" label="範圍"><textarea id="scope" value={form.scope ?? ""} maxLength={1000} onChange={set("scope")} /></Cell>
        <div className="btns"><button className="btn" type="button" disabled={busy || !form.to || !(form.scope ?? "").trim()} onClick={write("authority", "collab.authority", { to: form.to, scope: (form.scope ?? "").trim() }, ["to", "scope"])}>給這份授權</button></div>
        <Missing why={(form.to || (form.scope ?? "").trim()) && firstMissing([!form.to, "先選授權給誰。"], [!(form.scope ?? "").trim(), "寫授權的範圍。"])} />
        <Refused failed={failed} at="authority" />
      </div>

      <div className="card">
        <h2>結束討論</h2>
        {data.closings.map((item) => <div key={item.doc_id}><p>為什麼結束：{item.content.why_end}</p><p>什麼情況重新開：{item.content.reopen_if}</p><p>哪一天回頭檢討：{item.content.review_on}</p><p>負責的人：{item.content.owner}</p></div>)}
        {convener && (
          <>
            <Cell id="why-end" label="為什麼結束"><textarea id="why-end" value={form.why_end ?? ""} maxLength={2000} onChange={set("why_end")} /></Cell>
            <Cell id="reopen-if" label="什麼情況重新開"><textarea id="reopen-if" value={form.reopen_if ?? ""} maxLength={2000} onChange={set("reopen_if")} /></Cell>
            <Cell id="review-on" label="哪一天回頭檢討"><input id="review-on" type="date" value={form.review_on ?? ""} onChange={set("review_on")} /></Cell>
            <Cell id="owner" label="負責的人"><input id="owner" value={form.owner ?? ""} maxLength={200} onChange={set("owner")} /></Cell>
            <div className="btns"><button className="btn" type="button" disabled={busy || !["why_end", "reopen_if", "review_on", "owner"].every((key) => (form[key] ?? "").trim())}
              onClick={write("closing", "collab.closing", { why_end: (form.why_end ?? "").trim(), reopen_if: (form.reopen_if ?? "").trim(), review_on: form.review_on ?? "", owner: (form.owner ?? "").trim() }, ["why_end", "reopen_if", "review_on", "owner"])}>存結束的條件</button></div>
            <Missing why={!["why_end", "reopen_if", "review_on", "owner"].every((key) => (form[key] ?? "").trim()) && "四項都要寫：為什麼結束、什麼情況重新開、哪一天回頭檢討、負責的人。"} />
            <Refused failed={failed} at="closing" />
          </>
        )}
        {!convener && !data.closings.length && <p className="sub">召集人寫結束的條件。四項都要寫：為什麼結束、什麼情況重新開、哪一天回頭檢討、負責的人。</p>}
      </div>

      <div className="card">
        <h2>要求重開</h2>
        <p className="how">任何人都可以要求重開，召集人不能拒絕。</p>
        {data.reopens.map((item) => <p key={item.doc_id}>{item.who}：{item.content.reason}</p>)}
        <Cell id="reopen" label="為什麼要重開"><textarea id="reopen" value={form.reopen ?? ""} maxLength={2000} onChange={set("reopen")} /></Cell>
        <div className="btns"><button className="btn" type="button" disabled={busy || !(form.reopen ?? "").trim()} onClick={write("reopen", "collab.reopen", { reason: (form.reopen ?? "").trim() }, ["reopen"])}>要求重開</button></div>
        <Refused failed={failed} at="reopen" />
      </div>

      <div className="card">
        <h2>大家怎麼看</h2>
        <p className="how">不看人數。要平常想法不同的人都同意，才算大家都同意；有人異議就不算。也會排除標得最多的少數人，再看一次。</p>
        <AgreementView table={data.agreement} optionText={optionText} />
        {!data.agreement.insufficient && <><h3>排除標得最多的人之後</h3>{data.agreement.heaviest_left_out ? <AgreementView table={data.agreement.without_heaviest} optionText={optionText} /> : <p className="sub">不到 10 個人，沒有排除誰，結果一樣。</p>}</>}
        {(data.agreement.held.length > 0 || held.length > 0) && <p className="sub">還在等召集人確認的人，不算進來：{(held.length ? held.map((member) => member.display_name) : data.agreement.held).join("、")}。</p>}
      </div>

      {held.length > 0 && (
        <div className="card">
          <h2>等確認的成員</h2>
          {held.map((member) => (
            <div key={member.identity_id}>
              <p>{member.display_name}：{member.notice ?? "還在等召集人確認。確認之前，他看不到別人寫的東西，意見也不算進大家的看法。"}</p>
              {convener && <div className="btns"><button className="btn" type="button" disabled={busy} onClick={run(`member-${member.identity_id}`, () => groups.confirm(groupId, member.identity_id))}>確認是本人</button></div>}
              <Refused failed={failed} at={`member-${member.identity_id}`} />
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>請 AI 幫忙</h2>
        <p className="how">AI 只整理分歧、轉述立場、指出誰還沒說話。它不代表任何一方，不宣布大家已經同意，不藏起少數意見，不給人排先後。</p>
        <div className="btns">
          <button className="btn" type="button" disabled={busy || !data.wrote.position} onClick={ask("organise_differences", { round })}>整理大家的分歧</button>
          <button className="btn" type="button" disabled={busy || !data.wrote.position} onClick={restateAll}>轉述每個人的立場</button>
          <button className="btn" type="button" disabled={busy} onClick={run("ai", async () => setNotHeard((await collab.notHeard(groupId, round)).not_heard))}>誰還沒說話</button>
        </div>
        <Missing why={!data.wrote.position && "先寫你自己的立場，才能請 AI 整理分歧或轉述立場。"} />
        <Refused failed={failed} at="ai" />
        {said && <p className="warn">{said}</p>}
        {notHeard && <p><span className="tags"><span>系統</span></span>{notHeard.length ? `這一輪還沒寫立場的：${notHeard.join("、")}。` : "這一輪每個人都寫了立場。"}</p>}
        {data.differences.filter((item) => item.content.round === round).slice(-1).map((item) => <div key={item.doc_id}>{AI_TAG}{item.content.differences.map((line) => <p key={line} className="mt0">{line}</p>)}</div>)}
        {[...data.restatements].sort((x, y) => Number(y.mine) - Number(x.mine)).map((item) => {
          const answer = data.confirms.find((confirm) => confirm.mine && confirm.content.restatement === item.doc_id);
          return (
            <div key={item.doc_id} className="mt8">
              {AI_TAG}<p className="mt0">{item.mine ? "AI 轉述你的立場：" : "AI 轉述的立場："}{item.content.text}</p>
              {item.mine && (answer ? <p className="sub mt0">你說：{answer.content.verdict}</p> : (
                <div className="btns">
                  <button className="btn" type="button" disabled={busy} onClick={write(`restate-${item.doc_id}`, "collab.confirm", { restatement: item.doc_id, verdict: "說得對" })}>說得對</button>
                  <button className="btn ghost" type="button" disabled={busy} onClick={write(`restate-${item.doc_id}`, "collab.confirm", { restatement: item.doc_id, verdict: "說錯了" })}>說錯了</button>
                </div>
              ))}
              <Refused failed={failed} at={`restate-${item.doc_id}`} />
            </div>
          );
        })}
      </div>

      <div className="card">
        <h2>決定之後</h2>
        <p className="how">把決定的後果寫回來，下一輪會看到。</p>
        {data.consequences.map((item) => <p key={item.doc_id}>{item.who}：決定「{item.content.decision}」之後，{item.content.observed}</p>)}
        {data.reviews.map((item) => <p key={item.doc_id}>{item.who}的回顧：{item.content.text}</p>)}
        <Cell id="decision" label="當時決定了什麼"><input id="decision" value={form.decision ?? ""} maxLength={2000} onChange={set("decision")} /></Cell>
        <Cell id="observed" label="之後看到什麼"><textarea id="observed" value={form.observed ?? ""} maxLength={4000} onChange={set("observed")} /></Cell>
        <div className="btns"><button className="btn" type="button" disabled={busy || !(form.decision ?? "").trim() || !(form.observed ?? "").trim()}
          onClick={write("after", "collab.consequence", { decision: (form.decision ?? "").trim(), observed: (form.observed ?? "").trim() }, ["decision", "observed"])}>存後果</button></div>
        <Refused failed={failed} at="after" />
        <Cell id="review" label="回頭看，寫一段回顧"><textarea id="review" value={form.review ?? ""} maxLength={4000} onChange={set("review")} /></Cell>
        <div className="btns"><button className="btn" type="button" disabled={busy || !(form.review ?? "").trim()} onClick={write("review", "collab.review", { text: (form.review ?? "").trim() }, ["review"])}>存回顧</button></div>
        <Refused failed={failed} at="review" />
      </div>

      <ProcessFacts path={`/groups/${encodeURIComponent(groupId)}`} stamp={data} />

      <div className="card">
        <h2>我在哪裡</h2>
        <p className="how">只有你自己和負責安全的部分看得到。需要求助時，用它找你那裡的資源。</p>
        {data.places.filter((item) => item.mine).map((item) => <p key={item.doc_id}>你寫的：{item.content.where}</p>)}
        {!data.places.some((item) => item.mine) && (
          <>
            <Cell id="where" label="你在哪裡"><input id="where" value={form.where ?? ""} maxLength={200} onChange={set("where")} /></Cell>
            <div className="btns"><button className="btn" type="button" disabled={busy || !(form.where ?? "").trim()} onClick={write("place", "collab.place", { where: (form.where ?? "").trim() }, ["where"])}>存</button></div>
            <Refused failed={failed} at="place" />
          </>
        )}
      </div>
    </>
  );
}

function AgreementView({ table, optionText }: { table: AgreementTable; optionText: (option: string) => string }) {
  if (table.insufficient) return <p>{table.why}</p>;
  return (
    <>
      {Object.entries(table.options).map(([option, row]) => (
        <div key={option}>
          <p className="mt8"><b>{optionText(option)}</b>：{row.agreed_across ? "想法不同的人都同意。" : "還不是大家都同意。"}</p>
          {row.objections.map((reason) => <p key={reason} className="mt0">有人異議：{reason}</p>)}
        </div>
      ))}
    </>
  );
}
