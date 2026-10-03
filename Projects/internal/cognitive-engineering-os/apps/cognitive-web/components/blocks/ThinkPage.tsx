"use client";

// THINK 共思考 (contract card): you write the problem and your own version first; only then can the AI help, in the role you
// pick. Its answers are cards and short replies, each marked as the AI's and as 「它自己說的」 (no outside source yet). You react to
// every card, pick three, add at least two of your own, and end with one line on how you thought. The constants below copy
// ai_lego/core/domain/kinds/think.py and ai_lego/platform/ai_actions/think.py (test_block_think compares them).
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../../lib/api";
import { AUTHOR, ai, docs, type Doc, type Notice } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { BlockShell, Notices } from "./BlockShell";
import { ALWAYS, GRANTABLE_WORDS } from "./CollabPermissions";

export const ROLES = ["鏡子", "發散夥伴", "蘇格拉底引導者", "反方教練", "證據稽核者", "決策教練", "後設學習教練"] as const;
export const MODES = ["鏡像", "發散", "挑戰", "查證", "收斂", "只問問題"] as const;
export const OWN_TYPES = ["觀察", "假設或替代解釋", "我不知道", "會改變判斷的證據條件", "判準或行動選擇", "對思考方式的反思"] as const;
export const REACTIONS = ["共鳴", "反感", "不理解"] as const;
export const STANCES = ["修正", "維持", "暫停"] as const;
export const RESPONSES = ["確認", "改寫", "否定"] as const;
export const MAX_PICKED = 3;
export const MIN_OWN_CARDS = 2;
export const STREAK_REMINDER = 2;
export const ROUND_MINUTES = 25;

// action -> the role and mode it is, the permission it needs (the engine refuses it without), and what its answer is called
export const ACTIONS: Record<string, { role: string; mode: string; needs: string; title: string }> = {
  mirror: { role: "鏡子", mode: "鏡像", needs: "organize", title: "AI 當鏡子整理回來的" },
  look_back: { role: "後設學習教練", mode: "鏡像", needs: "organize", title: "回看你怎麼想" },
  diverge: { role: "發散夥伴", mode: "發散", needs: "propose_options", title: "不同的方向" },
  counter: { role: "反方教練", mode: "挑戰", needs: "counter", title: "最強的反方" },
  audit: { role: "證據稽核者", mode: "查證", needs: "organize", title: "拆開來看" },
  criteria: { role: "決策教練", mode: "收斂", needs: "propose_options", title: "判準和檢查你的選擇" },
  direct_advice: { role: "決策教練", mode: "收斂", needs: "direct_advice", title: "直接給的建議" },
  socratic: { role: "蘇格拉底引導者", mode: "只問問題", needs: "ask", title: "一個問題" },
  ask_conclusion: { role: "決策教練", mode: "只問問題", needs: "ask", title: "請你自己下結論" },
};
// 七張指令卡: one click picks the mode and the role
export const COMMANDS: Array<{ title: string; action: string; focus?: string }> = [
  { title: "先幫我看見我在想什麼", action: "mirror" },
  { title: "和我一起發散，但不要替我決定", action: "diverge" },
  { title: "請當最強的反方", action: "counter" },
  { title: "幫我把直覺變成可檢查的判斷", action: "audit", focus: "checkable" },
  { title: "幫我看這個選擇跟我有什麼關係", action: "socratic" },
  { title: "幫我拆開事實、法律與價值", action: "audit", focus: "separate" },
  { title: "現在要求我自己下結論", action: "ask_conclusion" },
];
const LATER = [{ title: "建立判準、檢查我的選擇", action: "criteria" }, { title: "回看我怎麼想", action: "look_back" }];
const OWN_HINTS: Record<string, string> = {
  觀察: "你看到、聽到、碰到了什麼？",
  假設或替代解釋: "還有哪些可能的解釋？你現在假設的是什麼？",
  我不知道: "哪裡你真的不知道？寫「我不知道」也算一個產出。",
  會改變判斷的證據條件: "看到什麼，你就會改變想法？",
  判準或行動選擇: "你會用什麼標準來選？或者你想怎麼做？",
  對思考方式的反思: "你剛才是怎麼想這件事的？",
};
// 25 分鐘一輪，七個回合；`action` = the command card this phase suggests
export const PHASES = [
  { from: 0, to: 3, name: "先有自己的版本", hint: "AI 先不說話。你先寫問題和自己的版本。", action: "" },
  { from: 3, to: 6, name: "鏡像", hint: "請 AI 把你寫的整理回來給你看。", action: "mirror" },
  { from: 6, to: 11, name: "發散", hint: "請 AI 給 8 到 15 個不同的方向。", action: "diverge" },
  { from: 11, to: 15, name: "挑戰", hint: "請 AI 針對你最有把握的說法，提出最強的反例。", action: "counter" },
  { from: 15, to: 20, name: "建立判準", hint: "把選項放進判準、風險、證據和時間尺度。", action: "criteria" },
  { from: 20, to: 23, name: "人做選擇", hint: "你自己選三張卡。AI 只檢查你的選擇清不清楚、能不能反悔、之後能不能回頭看。", action: "criteria" },
  { from: 23, to: 25, name: "回看自己怎麼想", hint: "寫下這次我是怎麼想的。AI 可以指出兩個強項和一個下次練習點。", action: "look_back" },
] as const;

export type Round = { problem: string; own?: string[]; role?: string; mode?: string; criteria?: string[]; reflection?: string };
export type Card = {
  claim: string; mechanism?: string; benefit?: string; risk?: string; assumption?: string; premise?: string; fails_when?: string; round: string; role?: string; method?: string;
  sourced?: string; batch?: string; batch_index?: number;
};
/** Your answer to one card, kept apart from the card so an AI card stays the AI's until you change its words. */
export type Reaction = { card: string; reaction?: string; reason?: string; stance?: string; picked?: boolean };
type Reply = { round: string; action: string; role: string; sections?: Array<{ title: string; items: string[] }>; question?: string; premise?: string; fails_when?: string; handback?: string; sourced: string };
type Batch = { round: string; action: string; role: string; cards?: unknown[]; question?: string; handback?: string; sourced: string };
type Answer = { reply: string; response: string; note?: string };
type Loaded = { rounds: Doc<Round>[]; cards: Doc<Card>[]; reactions: Doc<Reaction>[]; batches: Doc<Batch>[]; replies: Doc<Reply>[]; answers: Doc<Answer>[]; permissions: string[]; emotion: { emotion: string; intensity: string } | null };
const CARD_TEXT = ["claim", "mechanism", "benefit", "risk", "assumption", "premise", "fails_when"] as const;
const CARD_LABEL: Record<string, string> = { claim: "主張", mechanism: "機制", benefit: "可能好處", risk: "風險", assumption: "要驗證的假設", premise: "前提和適用條件", fails_when: "可能怎麼失敗" };

/** Which of the seven phases a number of seconds into the round falls in (after 25 minutes it stays in the last). */
export function phaseAt(seconds: number): number {
  const minutes = Math.max(0, seconds) / 60;
  const found = PHASES.findIndex((phase) => minutes >= phase.from && minutes < phase.to);
  return found === -1 ? PHASES.length - 1 : found;
}

export const ownItem = (type: string, text: string) => `${type}：${text.trim()}`;
export function splitOwn(item: string): { type: string; text: string } {
  const label = OWN_TYPES.find((type) => item.startsWith(`${type}：`));
  return label ? { type: label, text: item.slice(label.length + 1).trim() } : { type: "", text: item.trim() };
}
/** The server's rule too: an own item counts when something is written after its type label. */
export const hasOwn = (items: string[] | undefined) => (items ?? []).some((item) => splitOwn(item).text !== "");

export type PickHistory = { pickedAt: string; aiAsIs: boolean };
/** A pick from its reaction's versions (when it was last put on, the card's words being the AI's until you change them); null while it is not picked. */
export function pickHistory(versions: Doc<Reaction>[], card: Doc<Card>): PickHistory | null {
  let pickedAt: string | null = null;
  for (const version of versions) pickedAt = version.content.picked ? pickedAt ?? version.at : null;
  return pickedAt ? { pickedAt, aiAsIs: card.author === "ai" } : null;
}
/** How many of the most recent picks, in a row, are AI cards taken without changing a word. */
export function unchangedStreak(picks: PickHistory[]): number {
  const ordered = [...picks].sort((a, b) => a.pickedAt.localeCompare(b.pickedAt));
  let count = 0;
  for (let index = ordered.length - 1; index >= 0 && ordered[index].aiAsIs; index--) count++;
  return count;
}

const THINK_ERRORS: Record<string, string> = {
  THINK_OWN_VERSION_REQUIRED: "先寫下你自己的版本（至少一項）並存下來，AI 才會回。",
  THINK_ROUND_REQUIRED: "先存下這一輪的問題，再請 AI 幫忙。",
  AI_ANSWER_INVALID: "AI 這次的回答不符合規定的格式，再按一次即可。",
};
export function thinkError(reason: unknown): string {
  const code = reason instanceof ApiError && typeof reason.detail === "string" ? /^[A-Z][A-Z0-9_]*/.exec(reason.detail)?.[0] : undefined;
  return (code && THINK_ERRORS[code]) || humanError(reason);
}

/** A reaction with nothing left in it (no reaction, reason, stance or pick) is not kept. */
const tidy = (content: Reaction): Reaction | null => {
  const kept = Object.fromEntries(Object.entries(content).filter(([, value]) => value !== undefined && value !== "" && value !== false)) as Reaction;
  return kept.reaction || kept.reason || kept.stance || kept.picked ? kept : null;
};

function Chips<T extends string>({ options, value, onPick, label, disabled }: { options: readonly T[]; value: T | "" | undefined; onPick: (value: T) => void; label: string; disabled?: (option: T) => boolean }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => <button key={option} type="button" className={`chip${value === option ? " on" : ""}`} aria-pressed={value === option} disabled={disabled?.(option)} onClick={() => onPick(option)}>{option}</button>)}
    </div>
  );
}

function CardForm({ initial, onSave, onCancel, busy }: { initial: Card; onSave: (card: Card) => void; onCancel?: () => void; busy: boolean }) {
  const [card, setCard] = useState<Card>(initial);
  const set = (patch: Partial<Card>) => setCard((held) => ({ ...held, ...patch }));
  return (
    <div className="field">
      {(["claim", "mechanism", "benefit", "risk", "assumption"] as const).map((field) => (
        <React.Fragment key={field}>
          <label htmlFor={`card-${field}`}>{CARD_LABEL[field]}{field === "claim" ? "" : "（選填）"}</label>
          <textarea id={`card-${field}`} value={card[field] ?? ""} maxLength={1000} onChange={(event) => set({ [field]: event.target.value })} />
        </React.Fragment>
      ))}
      <div className="btns mt8">
        <button className="btn primary" type="button" disabled={!card.claim.trim() || busy} onClick={() => onSave({ ...card, claim: card.claim.trim() })}>{busy ? "存檔中…" : "存這張卡"}</button>
        {onCancel && <button className="btn ghost" type="button" onClick={onCancel}>取消</button>}
      </div>
    </div>
  );
}

function Timer({ clock, setClock }: { clock: { shown: boolean; running: boolean; seconds: number }; setClock: React.Dispatch<React.SetStateAction<{ shown: boolean; running: boolean; seconds: number }>> }) {
  useEffect(() => {
    if (!clock.running) return;
    const tick = setInterval(() => setClock((held) => (held.seconds + 1 >= ROUND_MINUTES * 60 ? { ...held, seconds: ROUND_MINUTES * 60, running: false } : { ...held, seconds: held.seconds + 1 })), 1000);
    return () => clearInterval(tick);
  }, [clock.running, setClock]);
  const phase = PHASES[phaseAt(clock.seconds)];
  const mm = String(Math.floor(clock.seconds / 60)).padStart(2, "0");
  const ss = String(clock.seconds % 60).padStart(2, "0");
  if (!clock.shown) return <div className="card"><div className="btns"><span className="sub">計時關著。</span><button className="btn ghost" type="button" onClick={() => setClock({ shown: true, running: false, seconds: 0 })}>打開計時</button></div></div>;
  return (
    <div className="card">
      <div className="top"><h2>25 分鐘一輪 <small>{mm}:{ss}</small></h2>
        <div className="btns">
          <button className="btn" type="button" onClick={() => setClock((held) => ({ ...held, running: !held.running }))}>{clock.running ? "暫停" : clock.seconds ? "繼續" : "開始計時"}</button>
          <button className="btn ghost" type="button" onClick={() => setClock({ shown: true, running: false, seconds: 0 })}>重來</button>
          <button className="btn ghost" type="button" onClick={() => setClock({ shown: false, running: false, seconds: 0 })}>關掉計時</button>
        </div>
      </div>
      <ol className="check">{PHASES.map((item, index) => <li key={item.name}>{index === phaseAt(clock.seconds) ? <b>{item.from}–{item.to} 分　{item.name}（現在）</b> : <>{item.from}–{item.to} 分　{item.name}</>}</li>)}</ol>
      <p className="how">{phase.hint}{clock.seconds >= ROUND_MINUTES * 60 ? " 25 分鐘到了，可以繼續，也可以停在這裡。" : " 計時只是提醒，你可以跳過任何一段，隨時停。"}</p>
    </div>
  );
}

export function ThinkPage({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [pick, setPick] = useState("");           // "" = the newest round, "new" = a blank one
  const [problem, setProblem] = useState("");
  const [own, setOwn] = useState<string[]>([]);
  const [ownType, setOwnType] = useState<string>(OWN_TYPES[0]);
  const [ownText, setOwnText] = useState("");
  const [criteria, setCriteria] = useState<string[]>([]);
  const [criterion, setCriterion] = useState("");
  const [reflection, setReflection] = useState("");
  const [target, setTarget] = useState(0);
  const [role, setRole] = useState("");
  const [mode, setMode] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(0);
  const [rewrite, setRewrite] = useState<{ reply: string; note: string } | null>(null);
  const [armed, setArmed] = useState(false);
  const [streak, setStreak] = useState(0);
  const [clock, setClock] = useState({ shown: true, running: false, seconds: 0 });
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const load = async () => {
    const [rounds, cards, reactions, batches, replies, answers, contract, state] = await Promise.all([
      docs.list<Round>(projectId, "think.round"), docs.list<Card>(projectId, "think.card"), docs.list<Reaction>(projectId, "think.reaction"), docs.list<Batch>(projectId, "think.batch"), docs.list<Reply>(projectId, "think.reply"),
      docs.list<Answer>(projectId, "think.response"), docs.list<{ permissions?: string[] }>(projectId, "collab_contract.terms"), docs.list<{ emotion: string; intensity: string }>(projectId, "sense.state"),
    ]);
    setData({ rounds, cards, reactions, batches, replies, answers, permissions: contract.at(-1)?.content.permissions ?? [], emotion: state.at(-1)?.content ?? null });
  };
  useEffect(() => { load().catch((reason) => setError(thinkError(reason))); }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const current = data && pick !== "new" ? data.rounds.find((round) => round.doc_id === pick) ?? data.rounds.at(-1) ?? null : null;
  const roundId = current?.doc_id;
  useEffect(() => {
    setProblem(current?.content.problem ?? ""); setOwn(current?.content.own ?? []); setCriteria(current?.content.criteria ?? []); setReflection(current?.content.reflection ?? "");
    setRole(current?.content.role ?? ""); setMode(current?.content.mode ?? ""); setTarget(0); setRewrite(null); setArmed(false);
  }, [roundId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // every pick still on a card of the case, with the card it points at; the streak reads the AI's cards among them
  const picks = (data?.reactions ?? []).flatMap((reaction) => {
    const card = data?.cards.find((item) => item.doc_id === reaction.content.card);
    return reaction.content.picked && card ? [{ reaction, card }] : [];
  });
  const pickedKey = picks.map(({ reaction, card }) => `${reaction.doc_id}:${reaction.version}:${card.author}`).join(",");
  useEffect(() => {
    let active = true;
    Promise.all(picks.map(({ reaction, card }) => docs.versions<Reaction>(projectId, "think.reaction", reaction.doc_id).then((versions) => pickHistory(versions, card))))
      .then((all) => { if (active) setStreak(unchangedStreak(all.filter((item): item is PickHistory => item !== null))); })
      .catch((reason) => { if (active) setError(thinkError(reason)); });
    return () => { active = false; };
  }, [pickedKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ``work`` may return something to run once the reload has landed (e.g. switch to the round it just made)
  const act = async (work: () => Promise<(() => void) | void>) => {
    setError(""); setBusy(true);
    try { const after = await work(); await load(); setRefresh((count) => count + 1); after?.(); } catch (reason) { setError(thinkError(reason)); } finally { setBusy(false); }
  };

  if (!data) return <BlockShell projectId={projectId} code="THINK"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;

  const granted = (needs: string) => (ALWAYS as readonly string[]).includes(needs) || data.permissions.includes(needs);
  const roundCards = data.cards.filter((card) => card.content.round === roundId);
  const roundReplies = data.replies.filter((reply) => reply.content.round === roundId);
  const roundBatches = data.batches.filter((batch) => batch.content.round === roundId);
  const savedOwn = hasOwn(current?.content.own);
  const frozen = savedOwn && roundReplies.length + roundBatches.length > 0;   // once the AI has answered your version, it stays as you wrote it
  const reactionOf = (card: Doc<Card>) => data.reactions.find((item) => item.content.card === card.doc_id);
  const picked = roundCards.filter((card) => reactionOf(card)?.content.picked);
  const ownCards = roundCards.filter((card) => card.author === "user");
  const phase = PHASES[phaseAt(clock.seconds)];
  const suggestion = clock.shown && (clock.running || clock.seconds > 0) ? phase.action : "";
  const ownItems = (current?.content.own ?? []).map(splitOwn).filter((item) => item.text);

  const blocked = (action: string): string => {
    const needs = ACTIONS[action].needs;
    if (!current) return "先存下這一輪的問題和你的版本";
    if (action !== "direct_advice" && !savedOwn) return "先寫並存下你自己的版本";
    if (!granted(needs)) return `協作合約沒有准「${GRANTABLE_WORDS[needs]}」`;
    return "";
  };
  const saveRound = (patch: Partial<Round>) => act(async () => {
    const content = { ...current?.content, ...patch } as Round;
    const saved = current ? await docs.update(projectId, "think.round", current, content) : await docs.create(projectId, "think.round", content);
    setNotices(saved.notices);
    return current ? undefined : () => setPick(saved.doc_id);
  });
  const ask = (action: string, context: Record<string, unknown> = {}) => act(async () => {
    const facets = ACTIONS[action];
    if (current && (current.content.role !== facets.role || current.content.mode !== facets.mode)) await docs.update(projectId, "think.round", current, { ...current.content, role: facets.role, mode: facets.mode });
    const turn = await ai(projectId, "THINK", action, { round: roundId, ...context });
    if (turn.stopped) { setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]); return; }
    if (turn.saved?.kind === "think.batch") await apiFetch(`/projects/${encodeURIComponent(projectId)}/think/expand`, { method: "POST", body: JSON.stringify({ batch: turn.saved.doc_id }) });
  });
  // ``patch`` goes onto the card's one reaction; clearing the last thing in it removes the reaction
  const react = (card: Doc<Card>, patch: Partial<Reaction>) => act(async () => {
    const held = reactionOf(card);
    const content = tidy({ ...(held?.content ?? { card: card.doc_id }), ...patch });
    if (!content) { if (held) await docs.remove(projectId, "think.reaction", held.doc_id); return; }
    const saved = held ? await docs.update(projectId, "think.reaction", held, content) : await docs.create(projectId, "think.reaction", content);
    setNotices(saved.notices);
  });
  const removeCard = async (card: Doc<Card>) => {
    const held = reactionOf(card);
    if (held) await docs.remove(projectId, "think.reaction", held.doc_id);
    await docs.remove(projectId, "think.card", card.doc_id);
  };
  const saveOwnCard = (card: Card, doc?: Doc<Card>) => act(async () => {
    const saved = doc ? await docs.update(projectId, "think.card", doc, { ...doc.content, ...card }) : await docs.create(projectId, "think.card", { ...card, round: roundId! });
    setNotices(saved.notices); setEditing(null);
    if (!doc) setAdding((count) => count + 1);
  });
  const answer = (reply: Doc<Reply>, response: (typeof RESPONSES)[number], note = "") => act(async () => {
    await docs.create(projectId, "think.response", { reply: reply.doc_id, response, ...(note.trim() ? { note: note.trim() } : {}) });
    setRewrite(null);
  });
  const removeRound = () => act(async () => {
    if (!current) return;
    const replyIds = new Set(roundReplies.map((reply) => reply.doc_id));
    for (const item of data.answers.filter((entry) => replyIds.has(entry.content.reply))) await docs.remove(projectId, "think.response", item.doc_id);
    for (const item of roundReplies) await docs.remove(projectId, "think.reply", item.doc_id);
    for (const item of roundBatches) await docs.remove(projectId, "think.batch", item.doc_id);
    for (const item of roundCards) await removeCard(item);
    await docs.remove(projectId, "think.round", current.doc_id);
    return () => setPick("");
  });

  const facetsFor = (chosenRole: string, chosenMode: string) => Object.entries(ACTIONS).find(([, facets]) => facets.role === chosenRole && facets.mode === chosenMode)?.[0] ?? "";
  const chosen = role && mode ? facetsFor(role, mode) : "";
  const roleNeeds = (name: string) => Object.values(ACTIONS).filter((facets) => facets.role === name).map((facets) => facets.needs);
  const commandCard = (title: string, action: string, focus?: string) => {
    const facets = ACTIONS[action];
    const reason = blocked(action);
    return (
      <div key={title} className={`mcard${suggestion === action ? " now" : ""}`}>
        <b>{title}</b>
        <span className="k">模式：{facets.mode}・角色：{facets.role}</span>
        {reason && <span className="need">{reason}</span>}
        <div className="btns"><button className="btn" type="button" disabled={Boolean(reason) || busy} onClick={() => ask(action, { ...(focus ? { focus } : {}), ...(action === "counter" ? { target } : {}) })}>開始</button></div>
      </div>
    );
  };
  const messageFor = (reply: Doc<Reply>) => data.answers.filter((entry) => entry.content.reply === reply.doc_id).at(-1)?.content;
  const unpickedFull = picked.length >= MAX_PICKED;

  const cardView = (doc: Doc<Card>) => {
    const mine = reactionOf(doc);
    const given = mine?.content ?? ({ card: doc.doc_id } as Reaction);
    return editing === doc.doc_id ? (
      <div key={doc.doc_id} className="mcard now"><CardForm initial={doc.content} busy={busy} onSave={(card) => saveOwnCard(card, doc)} onCancel={() => setEditing(null)} /></div>
    ) : (
      <div key={doc.doc_id} className="mcard">
        <span className="tags"><span>{AUTHOR[doc.author]}</span>{doc.content.sourced && <span>{doc.content.sourced}</span>}{doc.content.role && <span>{doc.content.role}</span>}{doc.content.method && <span>{doc.content.method}</span>}{given.picked && <span>你選了這張</span>}</span>
        <b>{doc.content.claim}</b>
        {CARD_TEXT.slice(1).filter((field) => doc.content[field]).map((field) => <span key={field}><span className="k">{CARD_LABEL[field]}：</span>{doc.content[field]}</span>)}
        <span className="k">你覺得怎麼樣？</span>
        <Chips options={REACTIONS} value={given.reaction as (typeof REACTIONS)[number] | undefined} label="你的反應" disabled={() => busy}
          onPick={(reaction) => react(doc, { reaction: given.reaction === reaction ? undefined : reaction })} />
        <label className="k" htmlFor={`reason-${doc.doc_id}`}>原因（寫了才存）</label>
        <textarea id={`reason-${doc.doc_id}`} key={`${doc.doc_id}-${mine?.version ?? 0}`} defaultValue={given.reason ?? ""} maxLength={1000}
          onBlur={(event) => { const reason = event.target.value.trim(); if (reason !== (given.reason ?? "")) react(doc, { reason: reason || undefined }); }} />
        {doc.content.role === "反方教練" && (
          <><span className="k">你的回應</span><Chips options={STANCES} value={given.stance as (typeof STANCES)[number] | undefined} label="對反方的回應" disabled={() => busy}
            onPick={(stance) => react(doc, { stance: given.stance === stance ? undefined : stance })} /></>
        )}
        <div className="btns">
          <button className={`btn${given.picked ? " primary" : ""}`} type="button" aria-pressed={Boolean(given.picked)} disabled={busy || (!given.picked && unpickedFull)}
            onClick={() => react(doc, { picked: given.picked ? undefined : true })}>{given.picked ? "取消選這張" : "選這張帶走"}</button>
          <button className="btn ghost" type="button" onClick={() => setEditing(doc.doc_id)}>改寫</button>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => act(async () => { await removeCard(doc); })}>刪掉</button>
        </div>
      </div>
    );
  };

  const replyView = (doc: Doc<Reply>) => {
    const given = messageFor(doc);
    const content = doc.content;
    return (
      <div key={doc.doc_id} className="judge">
        <span className="tags"><span>{ACTIONS[content.action]?.title ?? "AI 的整理"}</span><span>{AUTHOR[doc.author]}</span><span>{content.sourced}</span><span>{content.role}</span>{given && <span>你：{given.response}</span>}</span>
        {content.handback && <p className="warn">AI 這次把控制交還給你：{content.handback}</p>}
        {(content.sections ?? []).map((section) => <div key={section.title}><b>{section.title}</b><ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}
        {content.question && <p><b>一個問題：</b>{content.question}</p>}
        {content.premise && <p><b>前提和適用條件：</b>{content.premise}</p>}
        {content.fails_when && <p><b>可能怎麼失敗：</b>{content.fails_when}</p>}
        {(content.sections ?? []).length > 0 && !given && (rewrite?.reply === doc.doc_id ? (
          <>
            <label htmlFor={`note-${doc.doc_id}`}>用你自己的話改寫</label>
            <textarea id={`note-${doc.doc_id}`} value={rewrite.note} maxLength={1000} onChange={(event) => setRewrite({ reply: doc.doc_id, note: event.target.value })} />
            <div className="btns"><button className="btn primary" type="button" disabled={!rewrite.note.trim() || busy} onClick={() => answer(doc, "改寫", rewrite.note)}>存我的版本</button><button className="btn ghost" type="button" onClick={() => setRewrite(null)}>取消</button></div>
          </>
        ) : (
          <div className="btns">
            <button className="btn primary" type="button" disabled={busy} onClick={() => answer(doc, "確認")}>對，是這樣</button>
            <button className="btn" type="button" onClick={() => setRewrite({ reply: doc.doc_id, note: "" })}>我來改寫</button>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => answer(doc, "否定")}>不對</button>
          </div>
        ))}
        {given?.note && <p><b>你的版本：</b>{given.note}</p>}
      </div>
    );
  };

  const grouped = (label: string, lines: string[]) => <div className="mcard"><b>{label}</b>{lines.length ? <ul>{lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul> : <span className="k">還沒有</span>}</div>;
  const unexpanded = roundBatches.filter((batch) => (batch.content.cards ?? []).length > 0 && !data.cards.some((card) => card.content.batch === batch.doc_id));

  return (
    <BlockShell projectId={projectId} code="THINK" refresh={refresh}>
      <Notices notices={notices} />
      <Timer clock={clock} setClock={setClock} />

      <div className="card">
        <div className="top"><h2>這一輪</h2>
          <div className="chips" role="group" aria-label="選一輪">
            {data.rounds.map((round, index) => <button key={round.doc_id} type="button" className={`chip${round.doc_id === roundId ? " on" : ""}`} aria-pressed={round.doc_id === roundId} onClick={() => setPick(round.doc_id)}>第 {index + 1} 輪：{round.content.problem.slice(0, 12)}</button>)}
            <button type="button" className={`chip${!current ? " on" : ""}`} aria-pressed={!current} onClick={() => setPick("new")}>新的一輪</button>
          </div>
        </div>
        {!current && data.rounds.length > 0 && <p className="sub">這是一輪新的。寫好問題和你的版本，存下來。</p>}
      </div>

      <div className="card cta">
        <h2>先寫你自己的</h2>
        <p className="how">AI 要等你寫完這一段、存下來，才會回。先想，再看 AI 怎麼說。</p>
        <div className="field">
          <label htmlFor="problem">這一次的問題是什麼？（由你自己界定）</label>
          <textarea id="problem" value={problem} maxLength={2000} onChange={(event) => setProblem(event.target.value)} />
        </div>
        <div className="field">
          <b>你自己的版本（至少留下一樣）</b>
          {frozen ? <p className="hint">AI 已經回過了，所以你最初的版本不再改；看過 AI 之後新的想法，寫成下面的卡。</p> : (
            <>
              <Chips options={OWN_TYPES} value={ownType as (typeof OWN_TYPES)[number]} onPick={setOwnType} label="你要寫哪一種" />
              <p className="hint">{OWN_HINTS[ownType]}</p>
              <textarea aria-label="寫下來" value={ownText} maxLength={1900} onChange={(event) => setOwnText(event.target.value)} />
              <div className="btns"><button className="btn" type="button" disabled={!ownText.trim()} onClick={() => { setOwn([...own, ownItem(ownType, ownText)]); setOwnText(""); }}>加進我的版本</button></div>
            </>
          )}
          {own.length > 0 && <ul>{own.map((item, index) => <li key={`${index}-${item}`}>{item}{!frozen && <> <button className="btn ghost" type="button" onClick={() => setOwn(own.filter((_, at) => at !== index))}>拿掉</button></>}</li>)}</ul>}
        </div>
        <div className="btns mt8">
          <button className="btn primary" type="button" disabled={!problem.trim() || busy} onClick={() => saveRound({ problem: problem.trim(), own })}>{busy ? "存檔中…" : current ? "存下來" : "存這一輪"}</button>
          {current && <button className="btn ghost" type="button" disabled={busy} onClick={() => (armed ? removeRound() : setArmed(true))}>{armed ? "再按一次，整輪完整刪除" : "刪掉這一輪"}</button>}
        </div>
      </div>

      <div className="card">
        <h2>請 AI 幫忙</h2>
        <p className="how">AI 不替你決定，也不排序。它說的每一句都是「它自己說的」，目前沒有外部出處。要它做的事，要先在協作合約准了才能選。</p>
        {!current && <p className="warn">先存下這一輪的問題和你的版本。</p>}
        {current && !savedOwn && <p className="warn">先寫你自己的版本（至少一項）並存下來，AI 才會回。</p>}
        {ownItems.length > 1 && (
          <div className="field">
            <b>反方要針對你的哪一個說法？（你最有把握的那個）</b>
            <div className="chips" role="group" aria-label="反方的目標">{ownItems.map((item, index) => <button key={`${index}-${item.text}`} type="button" className={`chip${target === index ? " on" : ""}`} aria-pressed={target === index} onClick={() => setTarget(index)}>{item.text.slice(0, 20)}</button>)}</div>
          </div>
        )}
        <div className="mcards">{COMMANDS.map((command) => commandCard(command.title, command.action, command.focus))}</div>
        <h3 className="fam">之後再用</h3>
        <div className="mcards">{LATER.map((command) => commandCard(command.title, command.action))}</div>
        <div className="field">
          <b>自己選角色和模式</b>
          <Chips options={ROLES} value={role as (typeof ROLES)[number]} label="AI 這一輪的角色" onPick={setRole} disabled={(name) => roleNeeds(name).every((needs) => !granted(needs))} />
          <Chips options={MODES} value={mode as (typeof MODES)[number]} label="模式" onPick={setMode} />
          {role && mode && !chosen && <p className="hint">這個角色在這個模式下沒有對應的做法，換一個。</p>}
          <div className="btns"><button className="btn" type="button" disabled={!chosen || Boolean(blocked(chosen)) || busy} onClick={() => ask(chosen, chosen === "counter" ? { target } : {})}>用這個角色和模式開始</button></div>
          {chosen && blocked(chosen) && <p className="hint">{blocked(chosen)}。</p>}
        </div>
        <div className="field">
          <b>不想先寫，直接要建議</b>
          <p className="hint">這會跳過「你先寫」。AI 給的建議會附上前提和可能怎麼失敗，決定仍然是你的。你隨時可以回來寫自己的。</p>
          <div className="btns"><button className="btn" type="button" disabled={Boolean(blocked("direct_advice")) || busy} onClick={() => ask("direct_advice")}>直接取得建議</button></div>
          {blocked("direct_advice") && <p className="hint">{blocked("direct_advice")}。<Link href={`/projects/${encodeURIComponent(projectId)}/contract`}>到協作合約改</Link></p>}
        </div>
        {busy && <p className="sub" role="status">處理中，請稍等…</p>}
      </div>

      {roundReplies.length > 0 && <div className="card"><h2>AI 回給你的</h2>{[...roundReplies].reverse().map(replyView)}</div>}

      <div className="card">
        <div className="top"><h2>思考卡 <small>{roundCards.length} 張</small></h2>
          <button className="btn" type="button" disabled={Boolean(blocked("counter")) || busy} onClick={() => ask("counter", { target })}>請當最強的反方</button>
        </div>
        <p className="how">每張卡標上你的反應和原因。你自己選三張帶到下一步；AI 的卡也可以改寫、不選。你自己至少再加兩張：{ownCards.length} / {MIN_OWN_CARDS}。這一輪你選了 {picked.length} / {MAX_PICKED} 張。</p>
        {streak >= STREAK_REMINDER && <p className="warn" role="status">你連續 {streak} 次，把 AI 的卡一個字沒改就選下來。先寫一張你自己的卡，再決定要不要選它。（這是系統的提醒，不是 AI 說的。）</p>}
        {unexpanded.map((batch) => <div key={batch.doc_id} className="btns"><span className="sub">AI 給的一批卡還沒展開。</span><button className="btn" type="button" disabled={busy} onClick={() => act(async () => { await apiFetch(`/projects/${encodeURIComponent(projectId)}/think/expand`, { method: "POST", body: JSON.stringify({ batch: batch.doc_id }) }); })}>展開成卡</button></div>)}
        {roundBatches.filter((batch) => batch.content.handback).map((batch) => <p key={batch.doc_id} className="warn">AI 這次把控制交還給你：{batch.content.handback}{batch.content.question ? ` 它問：${batch.content.question}` : ""}</p>)}
        {roundCards.length === 0 && <p className="sub">還沒有卡。</p>}
        <div className="mcards">{roundCards.map(cardView)}</div>
        {current && (
          <div className="field">
            <b>加一張你自己的卡</b>
            <CardForm key={adding} initial={{ claim: "", round: roundId! }} busy={busy} onSave={(card) => saveOwnCard(card)} />
          </div>
        )}
      </div>

      {current && (
        <div className="card">
          <h2>候選的判準</h2>
          <p className="how">你用什麼標準來選？一條一條寫。AI 提的判準，你覺得有用才自己抄進來。</p>
          <ul>{criteria.map((item, index) => <li key={`${index}-${item}`}>{item} <button className="btn ghost" type="button" onClick={() => setCriteria(criteria.filter((_, at) => at !== index))}>拿掉</button></li>)}</ul>
          <label htmlFor="criterion">新的一條</label>
          <input id="criterion" className="search" value={criterion} maxLength={1900} onChange={(event) => setCriterion(event.target.value)} />
          <div className="btns mt8">
            <button className="btn" type="button" disabled={!criterion.trim()} onClick={() => { setCriteria([...criteria, criterion.trim()]); setCriterion(""); }}>加一條</button>
            <button className="btn primary" type="button" disabled={busy} onClick={() => saveRound({ criteria })}>存判準</button>
          </div>
        </div>
      )}

      {current && (
        <div className="card">
          <h2>這一輪放在一起看</h2>
          <div className="mcards">
            {grouped("問題", [current.content.problem])}
            {grouped("假設", [...ownItems.filter((item) => item.type === "假設或替代解釋").map((item) => item.text), ...roundCards.map((card) => card.content.assumption ?? "").filter(Boolean)])}
            {grouped("證據", ownItems.filter((item) => item.type === "觀察" || item.type === "會改變判斷的證據條件").map((item) => `${item.type}：${item.text}`))}
            {grouped("情緒訊號", data.emotion ? [`${data.emotion.emotion}（${data.emotion.intensity}）`] : [])}
            {grouped("選項", roundCards.map((card) => `${reactionOf(card)?.content.picked ? "（選了）" : ""}${card.content.claim}`))}
            {grouped("判準", current.content.criteria ?? [])}
          </div>
        </div>
      )}

      {current && (
        <div className="card">
          <h2>這次我是怎麼想的</h2>
          <p className="how">最後寫一句。只有你寫得出來，AI 不會替你寫。</p>
          <textarea aria-label="這次我是怎麼想的" value={reflection} maxLength={2000} onChange={(event) => setReflection(event.target.value)} />
          <div className="btns mt8"><button className="btn primary" type="button" disabled={!reflection.trim() || busy} onClick={() => saveRound({ reflection: reflection.trim() })}>存</button></div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <p className="sub">不想寫了也可以直接往下走。跳過不算失敗，這一塊隨時可以回來。</p>
    </BlockShell>
  );
}
