"use client";

// SENSE 外化 (contract card): one thing per card, in your own words; drag cards into groups, link them, line them up
// in time; name your strongest emotion and how strong it is; the AI only mirrors what you put out, and that version
// counts only once you confirm or rewrite it. Every card is yours to edit or delete.
import React, { useEffect, useMemo, useState } from "react";
import { AUTHOR, ai, docs, type Doc, type Notice } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { BlockShell, Notices } from "./BlockShell";

export const CATEGORIES = ["事件", "感受", "身體反應", "恐懼", "期待", "人物關係與權力", "直覺", "你現在跟自己講的故事", "別人的聲音"] as const;
const INTENSITY = ["弱", "中", "強"] as const;
const ORIGIN = ["我自己來的", "有人希望我有", "不確定"] as const;
const REGULATION: Array<[string, string]> = [
  ["命名", "把情緒說成一個詞，寫在卡上"],
  ["放慢", "先停一下；身體很緊時先離開畫面、放慢呼吸，系統不催"],
  ["拉開距離", "十天後、十個月後、十年後的我怎麼看；如果是朋友遇到這件事，我會怎麼說"],
  ["延後", "情緒或急迫感很強時，把不可逆的決定延後，先做一個可逆的小步"],
];
const VIEWS = ["分類", "我的分組", "時間線", "關係"] as const;

type Link_ = { to: string; relation: string };
export type Card = { category: string; text: string; emotion?: string; origin?: string; from_whom?: string; group?: string; when?: string; links?: Link_[] };
type State = { emotion: string; intensity: string; regulation?: string[]; distance_note?: string; defer_irreversible?: boolean };
type Mirror = { summary: string; gaps?: string[]; explore?: Array<{ signal: string; question: string }>; question?: string };
const EMPTY: Card = { category: "", text: "" };
const FEELING = new Set(["感受", "恐懼", "身體反應", "期待"]);

function Chips<T extends string>({ options, value, onPick, label }: { options: readonly T[]; value: T | "" | undefined; onPick: (value: T) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => <button key={option} type="button" className={`chip${value === option ? " on" : ""}`} aria-pressed={value === option} onClick={() => onPick(option)}>{option}</button>)}
    </div>
  );
}

function CardForm({ initial, onSave, onCancel, busy }: { initial: Card; onSave: (card: Card) => void; onCancel?: () => void; busy: boolean }) {
  const [card, setCard] = useState<Card>(initial);
  const set = (patch: Partial<Card>) => setCard((held) => ({ ...held, ...patch }));
  const ready = card.category && card.text.trim();
  return (
    <div className="field">
      <b>這張卡是哪一類</b>
      <Chips options={CATEGORIES} value={card.category as (typeof CATEGORIES)[number]} onPick={(category) => set({ category })} label="卡片類別" />
      <label htmlFor="card-text">寫下來，像寫便條一樣</label>
      <textarea id="card-text" value={card.text} maxLength={2000} onChange={(event) => set({ text: event.target.value })} />
      {FEELING.has(card.category) && (
        <>
          <label htmlFor="card-emotion">把這個情緒說成一個詞（選填）</label>
          <input id="card-emotion" className="search" value={card.emotion ?? ""} maxLength={40} onChange={(event) => set({ emotion: event.target.value })} />
          <p className="hint">這個情緒是我自己來的，還是有人希望我有？</p>
          <Chips options={ORIGIN} value={card.origin as (typeof ORIGIN)[number]} onPick={(origin) => set({ origin })} label="情緒從哪裡來" />
        </>
      )}
      {(card.category === "別人的聲音" || card.origin === "有人希望我有") && (
        <>
          <label htmlFor="card-from">是誰、從哪裡傳來的（選填）</label>
          <input id="card-from" className="search" value={card.from_whom ?? ""} maxLength={300} onChange={(event) => set({ from_whom: event.target.value })} />
        </>
      )}
      <label htmlFor="card-when">什麼時候（選填，用來排時間線，例如 2026-09 或「三年前」）</label>
      <input id="card-when" className="search" value={card.when ?? ""} maxLength={40} onChange={(event) => set({ when: event.target.value })} />
      <div className="btns mt8">
        <button className="btn primary" type="button" disabled={!ready || busy} onClick={() => onSave({ ...card, text: card.text.trim() })}>{busy ? "存檔中…" : "存這張卡"}</button>
        {onCancel && <button className="btn ghost" type="button" onClick={onCancel}>取消</button>}
      </div>
    </div>
  );
}

export function SensePage({ projectId }: { projectId: string }) {
  const [cards, setCards] = useState<Doc<Card>[] | null>(null);
  const [state, setState] = useState<Doc<State> | null>(null);
  const [mirror, setMirror] = useState<Doc<Mirror> | null>(null);
  const [reviewed, setReviewed] = useState<string>("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [view, setView] = useState<(typeof VIEWS)[number]>("分類");
  const [linking, setLinking] = useState<{ from: string; to: string; relation: string } | null>(null);
  const [rewrite, setRewrite] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<State>({ emotion: "", intensity: "" });
  const [newGroup, setNewGroup] = useState("");
  const [refresh, setRefresh] = useState(0);   // bumps after every save: the shell reloads the proposals
  const [written, setWritten] = useState(0);   // bumps after a new card: only then is the new-card form emptied

  const load = async () => {
    const [held, states, mirrors, reviews] = await Promise.all([
      docs.list<Card>(projectId, "sense.card"), docs.list<State>(projectId, "sense.state"),
      docs.list<Mirror>(projectId, "sense.mirror"), docs.list<{ mirror: string; version: number; decision: string }>(projectId, "sense.review"),
    ]);
    setCards(held);
    setState(states.at(-1) ?? null);
    const latest = mirrors.at(-1) ?? null;
    setMirror(latest);
    setReviewed(latest ? reviews.filter((item) => item.content.mirror === latest.doc_id && item.content.version === latest.version).at(-1)?.content.decision ?? "" : "");
    return states.at(-1) ?? null;
  };
  // The emotion form is filled from the record only on the first load (and after its own save): a card save must
  // never wipe what you are typing there.
  useEffect(() => { load().then((saved) => { if (saved) setDraftState(saved.content); }).catch((reason) => setError(humanError(reason))); }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (work: () => Promise<void>) => {
    setError(""); setBusy(true);
    try { await work(); await load(); setRefresh((count) => count + 1); } catch (reason) { setError(humanError(reason)); } finally { setBusy(false); }
  };
  const saveCard = (card: Card, doc?: Doc<Card>) => act(async () => {
    const saved = doc ? await docs.update(projectId, "sense.card", doc, { ...doc.content, ...card }) : await docs.create(projectId, "sense.card", card);
    setNotices(saved.notices); setEditing(null);
    if (!doc) setWritten((count) => count + 1);
  });
  const patchCard = (doc: Doc<Card>, patch: Partial<Card>) => act(async () => { setNotices((await docs.update(projectId, "sense.card", doc, { ...doc.content, ...patch })).notices); });
  // Deleting a card also takes out every link that pointed at it.
  const removeCard = (doc: Doc<Card>) => act(async () => {
    for (const other of cards ?? []) {
      if ((other.content.links ?? []).some((link) => link.to === doc.doc_id)) await docs.update(projectId, "sense.card", other, { ...other.content, links: (other.content.links ?? []).filter((link) => link.to !== doc.doc_id) });
    }
    await docs.remove(projectId, "sense.card", doc.doc_id);
  });
  const saveState = () => act(async () => {
    const content = { ...draftState, defer_irreversible: (draftState.regulation ?? []).includes("延後") };
    const saved = state ? await docs.update(projectId, "sense.state", state, content) : await docs.create(projectId, "sense.state", content);
    setNotices(saved.notices); setDraftState(saved.content);
  });
  const askMirror = () => act(async () => {
    const turn = await ai<Mirror>(projectId, "SENSE", "mirror", {}, mirror);
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
  });
  const review = (decision: "確認" | "改寫" | "刪掉", note = "") => act(async () => {
    if (!mirror) return;
    const version = decision === "改寫" && rewrite !== null ? (await docs.update(projectId, "sense.mirror", mirror, { ...mirror.content, summary: rewrite })).version : mirror.version;
    await docs.create(projectId, "sense.review", { mirror: mirror.doc_id, version, decision, note });
    if (decision === "刪掉") await docs.remove(projectId, "sense.mirror", mirror.doc_id);
    setRewrite(null);
  });

  const byId = useMemo(() => Object.fromEntries((cards ?? []).map((doc) => [doc.doc_id, doc])), [cards]);
  const groups = useMemo(() => [...new Set((cards ?? []).map((doc) => doc.content.group || "未分組"))], [cards]);
  if (!cards) return <BlockShell projectId={projectId} code="SENSE"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;

  const cardView = (doc: Doc<Card>) => editing === doc.doc_id ? (
    <div key={doc.doc_id} className="mcard now"><CardForm initial={doc.content} busy={busy} onSave={(card) => saveCard(card, doc)} onCancel={() => setEditing(null)} /></div>
  ) : (
    <div key={doc.doc_id} className="mcard" draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", doc.doc_id)}>
      <span className="k">{doc.content.category}{doc.content.when ? ` · ${doc.content.when}` : ""}</span>
      <span>{doc.content.text}</span>
      {doc.content.emotion && <span className="k">情緒：{doc.content.emotion}{doc.content.origin ? `（${doc.content.origin}）` : ""}</span>}
      {doc.content.from_whom && <span className="k">來自：{doc.content.from_whom}</span>}
      {(doc.content.links ?? []).map((link) => byId[link.to] && <span key={link.to} className="k">→ {link.relation}：{byId[link.to].content.text.slice(0, 30)}</span>)}
      <div className="btns">
        <button className="btn ghost" type="button" onClick={() => setEditing(doc.doc_id)}>改</button>
        <button className="btn ghost" type="button" onClick={() => setLinking({ from: doc.doc_id, to: "", relation: "" })}>連到別張卡</button>
        <button className="btn ghost" type="button" onClick={() => removeCard(doc)}>刪掉</button>
      </div>
    </div>
  );
  const dropInto = (group: string) => ({
    onDragOver: (event: React.DragEvent) => event.preventDefault(),
    onDrop: (event: React.DragEvent) => { const doc = byId[event.dataTransfer.getData("text/plain")]; if (doc && (doc.content.group || "未分組") !== group) patchCard(doc, { group: group === "未分組" ? "" : group }); },
  });

  return (
    <BlockShell projectId={projectId} code="SENSE" refresh={refresh}>
      <Notices notices={notices} />
      <div className="card cta">
        <h2>寫一張卡</h2>
        <p className="how">一件事一張卡。實際看見、感覺、在意什麼，都可以寫。這一步不分析，也不下結論。卡片是你當下的感受和記憶，不是查證過的事實。</p>
        <CardForm key={written} initial={EMPTY} busy={busy} onSave={(card) => saveCard(card)} />
      </div>

      <div className="card">
        <div className="top"><h2>你的卡 <small>{cards.length} 張</small></h2>
          <div className="chips" role="group" aria-label="怎麼排">{VIEWS.map((name) => <button key={name} type="button" className={`chip${view === name ? " on" : ""}`} aria-pressed={view === name} onClick={() => setView(name)}>{name}</button>)}</div>
        </div>
        {cards.length === 0 && <p className="sub">還沒有卡。</p>}
        {view === "分類" && CATEGORIES.filter((category) => cards.some((doc) => doc.content.category === category)).map((category) => (
          <div key={category}><h3 className="fam">{category}</h3><div className="mcards">{cards.filter((doc) => doc.content.category === category).map(cardView)}</div></div>
        ))}
        {view === "我的分組" && (
          <>
            <p className="how">把卡拖到一組裡。要新的一組，先寫組名。</p>
            <div className="btns"><input className="search" aria-label="新的組名" value={newGroup} maxLength={60} onChange={(event) => setNewGroup(event.target.value)} placeholder="新的組名" /></div>
            {[...groups, ...(newGroup.trim() && !groups.includes(newGroup.trim()) ? [newGroup.trim()] : [])].map((group) => (
              <div key={group} className="station" {...dropInto(group)}><h3>{group}</h3><div className="mcards">{cards.filter((doc) => (doc.content.group || "未分組") === group).map(cardView)}</div></div>
            ))}
          </>
        )}
        {view === "時間線" && (
          <>
            <p className="how">照你寫的「什麼時候」排。沒寫的放最後。</p>
            <div className="mcards">{[...cards].sort((a, b) => (a.content.when || "￿").localeCompare(b.content.when || "￿")).map(cardView)}</div>
          </>
        )}
        {view === "關係" && (
          <>
            <p className="how">每張卡下面寫它連到哪一張、是什麼關係。按「連到別張卡」加一條。</p>
            <div className="mcards">{cards.filter((doc) => (doc.content.links ?? []).some((link) => byId[link.to]) || cards.some((other) => (other.content.links ?? []).some((link) => link.to === doc.doc_id))).map(cardView)}</div>
          </>
        )}
        {linking && (
          <div className="judge">
            <b>從「{byId[linking.from]?.content.text.slice(0, 30)}」連到哪一張？</b>
            <div className="chips">{cards.filter((doc) => doc.doc_id !== linking.from).map((doc) => <button key={doc.doc_id} type="button" className={`chip${linking.to === doc.doc_id ? " on" : ""}`} onClick={() => setLinking({ ...linking, to: doc.doc_id })}>{doc.content.text.slice(0, 20)}</button>)}</div>
            <label htmlFor="relation">什麼關係（例如：造成、害怕、因為他）</label>
            <input id="relation" className="search" value={linking.relation} maxLength={60} onChange={(event) => setLinking({ ...linking, relation: event.target.value })} />
            <div className="btns mt8">
              <button className="btn primary" type="button" disabled={!linking.to || !linking.relation.trim() || busy}
                onClick={() => { const doc = byId[linking.from]; patchCard(doc, { links: [...(doc.content.links ?? []).filter((link) => link.to !== linking.to), { to: linking.to, relation: linking.relation.trim() }] }); setLinking(null); }}>連起來</button>
              <button className="btn ghost" type="button" onClick={() => setLinking(null)}>取消</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>現在最強的情緒</h2>
        <p className="how">你自己標強度。下判斷前，系統會再問一次，也會把這裡的強度擺出來給你對照。</p>
        <label htmlFor="state-emotion">一個詞</label>
        <input id="state-emotion" className="search" value={draftState.emotion} maxLength={40} onChange={(event) => setDraftState({ ...draftState, emotion: event.target.value })} />
        <Chips options={INTENSITY} value={draftState.intensity as (typeof INTENSITY)[number]} onPick={(intensity) => setDraftState({ ...draftState, intensity })} label="強度" />
        <p className="hint">情緒調節（選你想試的）：</p>
        <ul className="check">{REGULATION.map(([name, how]) => (
          <li key={name}><label><input type="checkbox" checked={(draftState.regulation ?? []).includes(name)}
            onChange={(event) => setDraftState({ ...draftState, regulation: event.target.checked ? [...(draftState.regulation ?? []), name] : (draftState.regulation ?? []).filter((item) => item !== name) })} /> <b>{name}</b>：{how}</label></li>
        ))}</ul>
        {(draftState.regulation ?? []).includes("拉開距離") && (
          <><label htmlFor="distance">拉開距離之後，你怎麼看</label><textarea id="distance" value={draftState.distance_note ?? ""} maxLength={1000} onChange={(event) => setDraftState({ ...draftState, distance_note: event.target.value })} /></>
        )}
        {draftState.intensity === "強" && <p className="warn">情緒很強時，建議把不能反悔的決定延後。要等多久，由你定。</p>}
        <div className="btns mt8"><button className="btn primary" type="button" disabled={!draftState.emotion.trim() || !draftState.intensity || busy} onClick={saveState}>存</button></div>
      </div>

      <div className="card">
        <h2>請 AI 當鏡子</h2>
        <p className="how">AI 只把你放的東西整理回給你看，指出哪裡是空的，最多問你一題。它不解釋你的動機、不診斷、不下結論。整理回來的版本，你確認了才算數。</p>
        <div className="btns"><button className="btn" type="button" disabled={!cards.length || busy} onClick={askMirror}>{busy ? "整理中…" : mirror ? "再整理一次" : "整理給我看"}</button></div>
        {mirror && (
          <div className="judge">
            <span className="tags"><span>{AUTHOR[mirror.author]}</span>{reviewed && <span>你{reviewed === "改寫" ? "改寫過" : `${reviewed}了`}</span>}</span>
            {rewrite === null ? <p>{mirror.content.summary}</p> : <textarea aria-label="改寫整理的內容" value={rewrite} maxLength={1500} onChange={(event) => setRewrite(event.target.value)} />}
            {(mirror.content.gaps ?? []).length > 0 && <><b>哪裡是空的</b><ul>{mirror.content.gaps!.map((gap) => <li key={gap}>{gap}</li>)}</ul></>}
            {(mirror.content.explore ?? []).length > 0 && <><b>可以探索的點</b><ul>{mirror.content.explore!.map((item) => <li key={item.signal}><b>{item.signal}</b>：{item.question}</li>)}</ul></>}
            {mirror.content.question && <p><b>一個問題：</b>{mirror.content.question}</p>}
            {!reviewed && (
              <div className="btns">
                {rewrite === null ? <>
                  <button className="btn primary" type="button" onClick={() => review("確認")}>對，是這樣</button>
                  <button className="btn" type="button" onClick={() => setRewrite(mirror.content.summary)}>我來改寫</button>
                  <button className="btn ghost" type="button" onClick={() => review("刪掉")}>不對，刪掉</button>
                </> : <>
                  <button className="btn primary" type="button" disabled={!rewrite.trim() || busy} onClick={() => review("改寫")}>存我的版本</button>
                  <button className="btn ghost" type="button" onClick={() => setRewrite(null)}>取消</button>
                </>}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}
    </BlockShell>
  );
}
