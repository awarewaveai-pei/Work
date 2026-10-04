"use client";

// VERIFY 查證主張 (contract card): you paste a message, stop, and write your first reaction and confidence -- only then does
// the system show what it found. The AI proposes how the message splits into claims; each counts once you confirm it.
// Each claim's ledger line comes from the system (GET /verify/ledger over evidence.checked_claims): independent origins for
// and against, the three things apart. Only your own reading of a source card counts. A fact-checker's result is a source
// like any other -- who judged and on what grounds -- never the platform's verdict. The pasted message is never sent to
// /sources: it would support itself.
import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { AUTHOR, ai, docs, type AiTurn, type Doc, type Notice } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { BlockShell, Notices } from "./BlockShell";

type Cell = { state: string; value?: string; why?: string };
export type Message = { text: string; form: string; url?: string; sha256: string };
type First = { message: string; reaction: string; confidence: number };
export type Claim = { text: string; sentence: string; law?: boolean; jurisdiction?: string; limitation?: string; law_source?: string; alternative?: string; from: string; map_claim?: string; message?: string; proposal?: string; reason?: string };
export type Split = { message: string; claims: Array<{ text: string; sentence: string; law?: boolean }> };
type Techniques = { message: string; techniques?: Array<{ name: string; quote: string; why: string }>; asks?: Array<{ what: string; quote: string }>; rules?: { version: string } };
type Spread = { message: string; cells: Record<string, Cell> };
type Seen = { message: string; about: string; text: string };
type Hit = { source_id: string; publisher: string; judged_as: string; date: string; url: string; local: boolean; claim?: string; claimant?: string; license?: string };
type Factcheck = { message?: string; claim?: string; place?: string; dbs: Array<{ db: string; state: string; why?: string; attribution?: string; hits: Hit[] }> };
export type ReadingEntry = { claim: string; claim_version: number; card: string; snapshot: string; reads_as: string; quote?: string };
type Reading = { readings: ReadingEntry[] };
type Stance = { claim: string; claim_version: number; card: string; snapshot: string; stance: string; quote?: string; reading?: string; reason?: string };
type Verdict = { claim: string; claim_version: number; verdict: string; reason: string };
type Summary = { lines: Array<{ claim: string; claim_version: number; line: string }>; overview?: string };
type Next = { items: string[]; question?: string };
export type MapClaim = { id: string; text: string; kind: string; jurisdiction?: string; limitation?: string; source?: string };
type MapDoc = { claims?: MapClaim[] };
type EvidenceCard = { card: string; title?: string; url?: string; source_id?: string; snapshot?: { sha256?: string }; aside?: string };
type Evidence = { origins: Array<{ origin_id: string; cards: EvidenceCard[] }> };
type Stand = { origin_id: string; how: string; cards: Array<{ card: string; title?: string; url?: string; operator?: Cell; original?: Cell; lists: Array<{ list?: string }> }> };
type Line = {
  claim_id: string; version: number; text: string; sentence: string; law: boolean; state: string; support: string[]; oppose: string[]; stale: number; few: boolean;
  verdict: { verdict: string; reason: string; earlier: boolean } | null; message?: string; from?: string; law_state: string | null; needs_alternative: boolean; earlier: string[];
  three: { found: boolean; independent: number; independent_enough: boolean; stands: Stand[] }; search: { state: string; why?: string } | null;
  lookup: { run: string; status: string; angles: string[] } | null; weak_line: string | null;
};
type Spec = {
  forms: string[]; sentence_kinds: string[]; checkable: string; stances: string[]; verdicts: string[]; asks: string[]; spread: Array<{ key: string; question: string }>;
  check_questions: string[]; angles: string[]; min_origins: number; law_unconfirmed: string;
  techniques: { title: string; version: string; maintainer: string; items: Array<{ name: string; looks_like: string }> };
  factcheck_dbs: { title: string; version: string; maintainer: string; dbs: Record<string, { name: string; by: string }>; asked: string[] };
};
type Turn<C> = AiTurn<C> & { handback?: string };

const enc = encodeURIComponent;
const CONFIDENCE = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const ANGLE_NAMES: Record<string, string> = { primary: "原始文件與官方公告", news: "別的地方怎麼報", factcheck: "查核", origin: "最早的出處", opposite: "相反的說法" };
const MAX_READ_CARDS = 12;

/** The AI's proposed claims not confirmed yet (a confirmed one names its proposal: "<split doc>#<index>"). */
export function pendingProposals(split: Doc<Split> | undefined, claims: Doc<Claim>[]): Array<{ index: number; text: string; sentence: string; law: boolean }> {
  if (!split) return [];
  const taken = new Set(claims.map((doc) => doc.content.proposal));
  return split.content.claims.map((item, index) => ({ index, text: item.text, sentence: item.sentence, law: Boolean(item.law) })).filter((item) => !taken.has(`${split.doc_id}#${item.index}`));
}

/** MAP's 事實 and 法律 claims not brought here yet (從 MAP 接過來時，讀地圖裡要查的主張). */
export function mapClaimsToBring(map: MapDoc | undefined, claims: Doc<Claim>[]): MapClaim[] {
  const brought = new Set(claims.map((doc) => doc.content.map_claim).filter(Boolean));
  return (map?.claims ?? []).filter((item) => (item.kind === "事實" || item.kind === "法律") && !brought.has(item.id));
}

export function claimFromMap(item: MapClaim, checkable: string): Claim {
  const law = item.kind === "法律";
  return { text: item.text, sentence: checkable, from: "MAP", map_claim: item.id, ...(law ? { law: true, jurisdiction: item.jurisdiction ?? "", limitation: item.limitation ?? "", law_source: item.source ?? "" } : {}) };
}

/** The AI's readings of one claim's current version, the latest per card, each with the reading it came from. */
export function readingsFor(readings: Doc<Reading>[], claim: string, version: number): Array<ReadingEntry & { reading: string }> {
  const byCard = new Map<string, ReadingEntry & { reading: string }>();
  for (const doc of readings) for (const entry of doc.content.readings) if (entry.claim === claim && entry.claim_version === version) byCard.set(entry.card, { ...entry, reading: doc.doc_id });
  return [...byCard.values()];
}

function Chips({ options, value, onPick, label, names }: { options: readonly string[]; value?: string; onPick: (value: string) => void; label: string; names?: Record<string, string> }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => <button key={option} type="button" className={`chip${value === option ? " on" : ""}`} aria-pressed={value === option} onClick={() => onPick(option)}>{names?.[option] ?? option}</button>)}
    </div>
  );
}

function CellLine({ label, cell }: { label: string; cell?: Cell }) {
  if (!cell) return null;
  return <span className="k">{label}：{cell.state}{cell.value ? `：${cell.value}` : ""}{cell.why ? `（${cell.why}）` : ""}</span>;
}

function ClaimForm({ initial, spec, busy, onSave, onCancel, needReason }: { initial: Claim; spec: Spec; busy: boolean; onSave: (claim: Claim) => void; onCancel?: () => void; needReason?: boolean }) {
  const [claim, setClaim] = useState<Claim>(initial);
  const set = (patch: Partial<Claim>) => setClaim((held) => ({ ...held, ...patch }));
  const ready = claim.text.trim() && claim.sentence && (!needReason || (claim.reason ?? "").trim());
  return (
    <div className="field">
      <label htmlFor="claim-text">主張（一句話）</label>
      <textarea id="claim-text" value={claim.text} maxLength={2000} onChange={(event) => set({ text: event.target.value })} />
      <b>這是哪一種句子</b>
      <Chips options={spec.sentence_kinds} value={claim.sentence} onPick={(sentence) => set({ sentence })} label="句子的種類" />
      <label><input type="checkbox" checked={Boolean(claim.law)} onChange={(event) => set({ law: event.target.checked })} /> 這句講的是法律</label>
      {claim.law && <>
        <p className="hint">講法律的句子，要寫法域、時效、來源；沒寫的，帳本上標「{spec.law_unconfirmed}」。</p>
        <input className="search" aria-label="法域" placeholder="法域（哪裡的法律）" value={claim.jurisdiction ?? ""} maxLength={300} onChange={(event) => set({ jurisdiction: event.target.value })} />
        <input className="search" aria-label="時效" placeholder="時效（什麼時候的版本）" value={claim.limitation ?? ""} maxLength={300} onChange={(event) => set({ limitation: event.target.value })} />
        <input className="search" aria-label="法律的來源" placeholder="來源（條文或公告）" value={claim.law_source ?? ""} maxLength={1000} onChange={(event) => set({ law_source: event.target.value })} />
      </>}
      {claim.sentence === spec.sentence_kinds[1] && <>
        <label htmlFor="claim-alternative">這是對事實的解釋，不查真假。請你至少寫一個別的解釋</label>
        <textarea id="claim-alternative" value={claim.alternative ?? ""} maxLength={2000} onChange={(event) => set({ alternative: event.target.value })} />
      </>}
      {needReason && <><label htmlFor="claim-reason">為什麼改（必填）</label><input id="claim-reason" className="search" value={claim.reason ?? ""} maxLength={1000} onChange={(event) => set({ reason: event.target.value })} /></>}
      <div className="btns mt8">
        <button className="btn primary" type="button" disabled={!ready || busy} onClick={() => onSave({ ...claim, text: claim.text.trim() })}>存這個主張</button>
        {onCancel && <button className="btn ghost" type="button" onClick={onCancel}>取消</button>}
      </div>
    </div>
  );
}

export function VerifyPage({ projectId }: { projectId: string }) {
  const base = `/projects/${enc(projectId)}`;
  const [spec, setSpec] = useState<Spec | null>(null);
  const [messages, setMessages] = useState<Doc<Message>[]>([]);
  const [firsts, setFirsts] = useState<Doc<First>[]>([]);
  const [claims, setClaims] = useState<Doc<Claim>[]>([]);
  const [splits, setSplits] = useState<Doc<Split>[]>([]);
  const [techniques, setTechniques] = useState<Doc<Techniques>[]>([]);
  const [spreads, setSpreads] = useState<Doc<Spread>[]>([]);
  const [seen, setSeen] = useState<Doc<Seen>[]>([]);
  const [factchecks, setFactchecks] = useState<Doc<Factcheck>[]>([]);
  const [readings, setReadings] = useState<Doc<Reading>[]>([]);
  const [stances, setStances] = useState<Doc<Stance>[]>([]);
  const [verdicts, setVerdicts] = useState<Doc<Verdict>[]>([]);
  const [summaries, setSummaries] = useState<Doc<Summary>[]>([]);
  const [nexts, setNexts] = useState<Doc<Next>[]>([]);
  const [map, setMap] = useState<MapDoc | undefined>(undefined);
  const [evidence, setEvidence] = useState<Evidence>({ origins: [] });
  const [lines, setLines] = useState<Line[] | null>(null);
  const [picked, setPicked] = useState("");
  const [draft, setDraft] = useState<{ form: string; text: string; url: string }>({ form: "訊息", text: "", url: "" });
  const [first, setFirst] = useState<{ reaction: string; confidence: number | null }>({ reaction: "", confidence: null });
  const [seenDraft, setSeenDraft] = useState({ about: "", text: "" });
  const [editing, setEditing] = useState<string | null>(null);   // "proposal:<n>" | "new" | a claim id
  const [readCards, setReadCards] = useState<string[]>([]);
  const [handback, setHandback] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const load = async () => {
    const [m, f, c, s, t, sp, se, fc, r, st, v, su, n, maps, ev, ledger] = await Promise.all([
      docs.list<Message>(projectId, "verify.message"), docs.list<First>(projectId, "verify.first"), docs.list<Claim>(projectId, "verify.claim"),
      docs.list<Split>(projectId, "verify.split"), docs.list<Techniques>(projectId, "verify.techniques"), docs.list<Spread>(projectId, "verify.spread"),
      docs.list<Seen>(projectId, "verify.seen"), docs.list<Factcheck>(projectId, "verify.factcheck"), docs.list<Reading>(projectId, "verify.reading"),
      docs.list<Stance>(projectId, "verify.stance"), docs.list<Verdict>(projectId, "verify.verdict"), docs.list<Summary>(projectId, "verify.summary"),
      docs.list<Next>(projectId, "verify.next"), docs.list<MapDoc>(projectId, "map.map"), apiFetch<Evidence>(`${base}/evidence`), apiFetch<{ claims: Line[] }>(`${base}/verify/ledger`),
    ]);
    setMessages(m); setFirsts(f); setClaims(c); setSplits(s); setTechniques(t); setSpreads(sp); setSeen(se); setFactchecks(fc); setReadings(r);
    setStances(st); setVerdicts(v); setSummaries(su); setNexts(n); setMap(maps.at(-1)?.content); setEvidence(ev); setLines(ledger.claims);
    setPicked((held) => held || m.at(-1)?.doc_id || "");
  };
  useEffect(() => {
    apiFetch<Spec>("/blocks/verify/spec").then(setSpec).catch((reason) => setError(humanError(reason)));
    load().catch((reason) => setError(humanError(reason)));
  }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (work: () => Promise<void>) => {
    setError(""); setBusy(true);
    try { await work(); await load(); setRefresh((count) => count + 1); } catch (reason) { setError(humanError(reason)); } finally { setBusy(false); }
  };
  const turn = async <C,>(action: string, context: Record<string, unknown>) => {
    const answer = await ai<C>(projectId, "VERIFY", action, context) as Turn<C>;
    if (answer.stopped) setNotices([{ type: "crisis", notice: answer.notice ?? "", resources: answer.resources ?? [] }]);
    return answer;
  };

  const cards = useMemo(() => evidence.origins.flatMap((origin) => origin.cards).filter((card) => card.source_id && card.snapshot?.sha256 && !card.aside), [evidence]);
  const cardTitle = (id: string) => { const card = evidence.origins.flatMap((origin) => origin.cards).find((item) => item.card === id); return card?.title || card?.url || "來源卡"; };
  if (!spec || !lines) return <BlockShell projectId={projectId} code="VERIFY"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;

  const message = messages.find((doc) => doc.doc_id === picked);
  const reaction = message && firsts.find((doc) => doc.content.message === message.doc_id);
  const split = message && splits.filter((doc) => doc.content.message === message.doc_id).at(-1);
  const proposals = pendingProposals(split, claims);
  const found = message && techniques.filter((doc) => doc.content.message === message.doc_id).at(-1);
  const spread = message && spreads.find((doc) => doc.content.message === message.doc_id);
  const checks = message && factchecks.filter((doc) => doc.content.message === message.doc_id).at(-1);
  const toBring = mapClaimsToBring(map, claims);
  const summary = summaries.at(-1);
  const next = nexts.at(-1);

  const pasteMessage = () => act(async () => {
    const text = draft.text.trim() || (draft.form === "連結" ? draft.url.trim() : "");
    const saved = await apiFetch<Doc<Message> & { notices: Notice[] }>(`${base}/verify/messages`, { method: "POST", body: JSON.stringify({ text, form: draft.form, ...(draft.form === "連結" ? { url: draft.url.trim() } : {}) }) });
    setNotices(saved.notices); setPicked(saved.doc_id); setDraft({ form: draft.form, text: "", url: "" });
  });
  const saveFirst = () => act(async () => {
    if (!message || first.confidence === null) return;
    setNotices((await docs.create(projectId, "verify.first", { message: message.doc_id, reaction: first.reaction.trim(), confidence: first.confidence })).notices);
    setFirst({ reaction: "", confidence: null });
  });
  const lookUp = (body: Record<string, string>) => act(async () => { await apiFetch(`${base}/verify/factcheck`, { method: "POST", body: JSON.stringify(body) }); });
  const saveClaim = (claim: Claim, doc?: Doc<Claim>) => act(async () => {
    const clean = Object.fromEntries(Object.entries(claim).filter(([, value]) => value !== "" && value !== undefined)) as Claim;
    setNotices((doc ? await docs.update(projectId, "verify.claim", doc, clean) : await docs.create(projectId, "verify.claim", clean)).notices);
    setEditing(null);
  });
  const saveSeen = () => act(async () => {
    if (!message) return;
    setNotices((await docs.create(projectId, "verify.seen", { message: message.doc_id, about: seenDraft.about, text: seenDraft.text.trim() })).notices);
    setSeenDraft({ about: "", text: "" });
  });
  const summarise = (goOn: boolean) => act(async () => {
    const answer = await turn<Summary>("summary", goOn ? { go_on: true } : {});
    setHandback(answer.handback ?? "");
  });

  return (
    <BlockShell projectId={projectId} code="VERIFY" refresh={refresh}>
      <Notices notices={notices} />
      <div className="card cta">
        <h2>貼上要查的訊息</h2>
        <p className="how">貼上訊息、截圖裡的字，或連結。系統會存一份它現在的樣子。它不會變成來源：訊息不能拿來支持自己。</p>
        <Chips options={spec.forms} value={draft.form} onPick={(form) => setDraft({ ...draft, form })} label="貼的是什麼" />
        {draft.form === "連結" && <input className="search" aria-label="網址" placeholder="https://" value={draft.url} maxLength={2048} onChange={(event) => setDraft({ ...draft, url: event.target.value })} />}
        <textarea aria-label="訊息原文" placeholder={draft.form === "連結" ? "連結裡看到的字（選填）" : draft.form === "截圖文字" ? "截圖裡的字" : "訊息原文"} value={draft.text} maxLength={20000}
          onChange={(event) => setDraft({ ...draft, text: event.target.value })} />
        <div className="btns mt8"><button className="btn primary" type="button" disabled={busy || !(draft.text.trim() || (draft.form === "連結" && draft.url.trim()))} onClick={pasteMessage}>存這則訊息</button></div>
      </div>

      {messages.length > 0 && (
        <div className="card">
          <h2>這則訊息</h2>
          {messages.length > 1 && <Chips options={messages.map((doc) => doc.doc_id)} value={picked} onPick={setPicked} label="看哪一則"
            names={Object.fromEntries(messages.map((doc, index) => [doc.doc_id, `第 ${index + 1} 則：${doc.content.text.slice(0, 12)}`]))} />}
          {message && <>
            <p className="tnote">{message.content.text}</p>
            <span className="tags"><span>{message.content.form}</span><span>存證 {message.content.sha256.slice(0, 12)}</span>{message.content.url && <span>{message.content.url}</span>}</span>
            {!reaction ? (
              <div className="judge">
                <b>先停一下</b>
                <p className="how">寫下你的第一反應，和你有多相信它。例：「有點慌，信心六成」。寫完，才看系統查到什麼。第一反應寫了就不改。</p>
                <textarea aria-label="第一反應" value={first.reaction} maxLength={1000} onChange={(event) => setFirst({ ...first, reaction: event.target.value })} />
                <Chips options={CONFIDENCE.map(String)} value={first.confidence === null ? "" : String(first.confidence)} onPick={(value) => setFirst({ ...first, confidence: Number(value) })} label="信心有多少"
                  names={Object.fromEntries(CONFIDENCE.map((value) => [String(value), `${value}%`]))} />
                <div className="btns mt8"><button className="btn primary" type="button" disabled={busy || !first.reaction.trim() || first.confidence === null} onClick={saveFirst}>存我的第一反應</button></div>
              </div>
            ) : <p className="sub">你的第一反應：{reaction.content.reaction}（信心 {reaction.content.confidence}%）</p>}
          </>}
        </div>
      )}

      {message && reaction && <>
        <div className="card">
          <h2>別人查過嗎</h2>
          <p className="how">系統拿這則訊息去比對查核資料庫。查到的，是查核組織的結論，不是平台的結論。它跟別的來源一樣，由你判斷。</p>
          <p className="hint">{sentTo(spec)}</p>
          <div className="btns"><button className="btn" type="button" disabled={busy} onClick={() => lookUp({ message: message.doc_id })}>{checks ? "再查一次" : "查查核資料庫"}</button></div>
          {checks && <FactcheckResult result={checks.content} spec={spec} />}
        </div>

        <div className="card">
          <h2>拆成主張</h2>
          <p className="how">AI 先提出怎麼拆。每一個，你確認了才算。你也可以自己加。</p>
          <div className="btns">
            <button className="btn" type="button" disabled={busy} onClick={() => act(async () => { await turn("split", { message: message.doc_id }); })}>{split ? "請 AI 再拆一次" : "請 AI 提拆法"}</button>
            <button className="btn ghost" type="button" onClick={() => setEditing("new")}>自己加一個主張</button>
          </div>
          {split && proposals.length > 0 && <span className="tags"><span>{AUTHOR[split.author]}</span></span>}
          {proposals.map((item) => editing === `proposal:${item.index}` ? (
            <ClaimForm key={item.index} spec={spec} busy={busy} initial={{ text: item.text, sentence: item.sentence, law: item.law, from: "訊息", message: message.doc_id, proposal: `${split!.doc_id}#${item.index}` }}
              onSave={(claim) => saveClaim(claim)} onCancel={() => setEditing(null)} />
          ) : (
            <div key={item.index} className="mcard">
              <span>{item.text}</span><span className="k">{item.sentence}{item.law ? "・法律" : ""}</span>
              <div className="btns">
                <button className="btn primary" type="button" disabled={busy} onClick={() => saveClaim({ text: item.text, sentence: item.sentence, ...(item.law ? { law: true } : {}), from: "訊息", message: message.doc_id, proposal: `${split!.doc_id}#${item.index}` })}>確認</button>
                <button className="btn ghost" type="button" onClick={() => setEditing(`proposal:${item.index}`)}>改了再確認</button>
              </div>
            </div>
          ))}
          {editing === "new" && <ClaimForm spec={spec} busy={busy} initial={{ text: "", sentence: "", from: "訊息", message: message.doc_id }} onSave={(claim) => saveClaim(claim)} onCancel={() => setEditing(null)} />}
        </div>

        <div className="card">
          <h2>用了什麼手法、要你做什麼</h2>
          <p className="how">對照「{spec.techniques.title}」第 {spec.techniques.version} 版（{spec.techniques.maintainer}）。每找到一個，都附上原文的哪一段。手法不等於假：真的事也會被拿來操弄。</p>
          <div className="btns"><button className="btn" type="button" disabled={busy} onClick={() => act(async () => { await turn("techniques", { message: message.doc_id }); })}>請 AI 找手法</button></div>
          {found && <div className="judge">
            <span className="tags"><span>{AUTHOR[found.author]}</span></span>
            {(found.content.techniques ?? []).length === 0 && <p className="sub">AI 沒有在這則訊息裡找到清單上的手法。</p>}
            <ul>{(found.content.techniques ?? []).map((item) => <li key={`${item.name}${item.quote}`}><b>{item.name}</b>：「{item.quote}」{item.why ? `　${item.why}` : ""}</li>)}</ul>
            {(found.content.asks ?? []).length > 0 && <><b>它要你做什麼</b><ul>{found.content.asks!.map((item) => <li key={`${item.what}${item.quote}`}><b>{item.what}</b>：「{item.quote}」</li>)}</ul></>}
            <p className="hint">找到手法，不等於訊息是假的。</p>
          </div>}
        </div>

        <div className="card">
          <h2>怎麼傳開</h2>
          {spread && <ul>{spec.spread.map((item) => <li key={item.key}>{item.question}：<CellLine label="系統" cell={spread.content.cells[item.key]} /></li>)}</ul>}
          <p className="how">你自己看到的，可以寫下來。它是你的觀察，不算出處。</p>
          <Chips options={spec.spread.map((item) => item.key)} value={seenDraft.about} onPick={(about) => setSeenDraft({ ...seenDraft, about })} label="你看到的是哪一件"
            names={Object.fromEntries(spec.spread.map((item) => [item.key, item.question]))} />
          <textarea aria-label="你看到的" value={seenDraft.text} maxLength={2000} onChange={(event) => setSeenDraft({ ...seenDraft, text: event.target.value })} />
          <div className="btns mt8"><button className="btn" type="button" disabled={busy || !seenDraft.about || !seenDraft.text.trim()} onClick={saveSeen}>存我看到的</button></div>
          <ul>{seen.filter((doc) => doc.content.message === message.doc_id).map((doc) => <li key={doc.doc_id}>{spec.spread.find((item) => item.key === doc.content.about)?.question}：{doc.content.text}<span className="tags"><span>{AUTHOR[doc.author]}</span><span>不算出處</span></span></li>)}</ul>
          <details><summary>有組織的假訊息怎麼認（檢查題，可以跳過）</summary><ul>{spec.check_questions.map((question) => <li key={question}>{question}</li>)}</ul></details>
        </div>
      </>}

      {toBring.length > 0 && (
        <div className="card">
          <h2>從地圖帶進來的主張</h2>
          <p className="how">你在「拆解」標成事實或法律的句子，可以帶進來查。</p>
          {toBring.map((item) => (
            <div key={item.id} className="mcard"><span>{item.text}</span><span className="k">{item.kind}</span>
              <div className="btns"><button className="btn" type="button" disabled={busy} onClick={() => saveClaim(claimFromMap(item, spec.checkable))}>帶進來</button></div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>主張帳本 <small>{lines.length} 個</small></h2>
        <p className="how">帳本由系統排：每個主張有幾個獨立出處支持、幾個反對。只有你自己確認過的讀法才算數。三件事分開看：找得到出處、出處彼此獨立、出處站得住。這三件，沒有一件等於「這是真的」。</p>
        {lines.length === 0 && <p className="sub">還沒有主張。</p>}
        {lines.map((line) => (
          <LedgerLine key={line.claim_id} projectId={projectId} line={line} spec={spec} busy={busy} base={base} claims={claims} cards={cards} cardTitle={cardTitle} lines={lines}
            readings={readingsFor(readings, line.claim_id, line.version)} stances={stances.filter((doc) => doc.content.claim === line.claim_id)}
            verdict={verdicts.find((doc) => doc.content.claim === line.claim_id)} editing={editing === line.claim_id} setEditing={setEditing}
            factcheck={factchecks.filter((doc) => doc.content.claim === line.claim_id).at(-1)} act={act} saveClaim={saveClaim} lookUp={lookUp} setNotices={setNotices} />
        ))}
      </div>

      {lines.length > 0 && <>
        <div className="card">
          <h2>請 AI 讀來源</h2>
          <p className="how">AI 讀每張來源卡怎麼說每個主張，附上原文。它的讀法不算數，你確認了才算。一次最多 {MAX_READ_CARDS} 張。要協作合約准「找外部資料」。</p>
          <div className="chips" role="group" aria-label="給 AI 讀的來源卡">{cards.map((card) => (
            <button key={card.card} type="button" className={`chip${readCards.includes(card.card) ? " on" : ""}`} aria-pressed={readCards.includes(card.card)}
              disabled={!readCards.includes(card.card) && readCards.length >= MAX_READ_CARDS}
              onClick={() => setReadCards(readCards.includes(card.card) ? readCards.filter((item) => item !== card.card) : [...readCards, card.card])}>{(card.title || card.url || "來源卡").slice(0, 24)}</button>
          ))}</div>
          {cards.length === 0 && <p className="sub">還沒有可以讀的來源卡。先「去查」，或查查核資料庫。</p>}
          <div className="btns mt8"><button className="btn" type="button" disabled={busy || readCards.length === 0} onClick={() => act(async () => { await turn("read", { cards: readCards }); })}>請 AI 讀這些來源</button></div>
        </div>

        <div className="card">
          <h2>AI 白話摘要帳本</h2>
          <p className="how">帳本本身由系統排，AI 只用白話說一次。一個主張的獨立出處不到 {spec.min_origins} 個時，AI 先停下來，由你決定。</p>
          <div className="btns"><button className="btn" type="button" disabled={busy} onClick={() => summarise(false)}>請 AI 摘要</button></div>
          {handback && <div className="judge"><p className="warn">{handback}</p><div className="btns"><button className="btn" type="button" disabled={busy} onClick={() => summarise(true)}>照樣請 AI 摘要</button></div></div>}
          {summary && <div className="judge">
            <span className="tags"><span>{AUTHOR[summary.author]}</span></span>
            <ul>{summary.content.lines.map((item) => <li key={item.claim}>{claims.find((doc) => doc.doc_id === item.claim)?.content.text.slice(0, 30)}：{item.line}</li>)}</ul>
            {summary.content.overview && <p>{summary.content.overview}</p>}
          </div>}
        </div>

        <div className="card">
          <h2>還該查什麼</h2>
          <div className="btns"><button className="btn" type="button" disabled={busy} onClick={() => act(async () => { await turn("next", {}); })}>請 AI 提還該查什麼</button></div>
          {next && <div className="judge"><span className="tags"><span>{AUTHOR[next.author]}</span></span><ul>{next.content.items.map((item) => <li key={item}>{item}</li>)}</ul>{next.content.question && <p><b>一個問題：</b>{next.content.question}</p>}</div>}
        </div>
      </>}
      <p className="sub">要不要轉傳、照不照它說的做，在「判斷」和「行動」那兩步決定。</p>
      {error && <p className="error">{error}</p>}
    </BlockShell>
  );
}

// The attribution lines are the ones collect sent with the data (specs/wire/lookup.v1.json): the data and its licence are collect's.
/** Where the words go when you look them up (the databases collect asks; collect_lookups.DBS on the server). */
export function sentTo(spec: Spec): string {
  return `按下去，這段字會送到找資料的服務，由它去問：${spec.factcheck_dbs.asked.map((db) => spec.factcheck_dbs.dbs[db]?.name ?? db).join("、")}。`;
}

function FactcheckResult({ result, spec }: { result: Factcheck; spec: Spec }) {
  const lines = [...new Set(result.dbs.map((item) => item.attribution ?? "").filter(Boolean))];
  return (
    <div className="judge">
      <span className="tags"><span>{AUTHOR.system}</span><span>{spec.factcheck_dbs.title} 第 {spec.factcheck_dbs.version} 版</span><span>{result.place ? `你在${result.place}` : "用全球的資料"}</span></span>
      {result.dbs.map((item) => (
        <div key={item.db}>
          <b>{spec.factcheck_dbs.dbs[item.db]?.name ?? item.db}：{item.state}</b>{item.why && <span className="sub">（{item.why}）</span>}
          {item.hits.length > 0 && <ul>{item.hits.map((hit) => (
            <li key={hit.source_id}>{hit.claim && <>他們查的說法：{hit.claim}；</>}誰判的：{hit.publisher}{hit.local ? "（當地）" : ""}；判定：{hit.judged_as || "沒有寫"}；{hit.date || "沒有日期"}{hit.license ? `；授權：${hit.license}` : ""}　<a href={hit.url} target="_blank" rel="noreferrer">看依據</a></li>
          ))}</ul>}
        </div>
      ))}
      {lines.map((line) => <p key={line} className="hint">{line}</p>)}
    </div>
  );
}

function LedgerLine({ projectId, line, spec, busy, base, claims, cards, cardTitle, lines, readings, stances, verdict, editing, setEditing, factcheck, act, saveClaim, lookUp, setNotices }: {
  projectId: string; line: Line; spec: Spec; busy: boolean; base: string; claims: Doc<Claim>[]; cards: EvidenceCard[]; cardTitle: (id: string) => string; lines: Line[];
  readings: Array<ReadingEntry & { reading: string }>; stances: Doc<Stance>[]; verdict?: Doc<Verdict>; editing: boolean; setEditing: (value: string | null) => void;
  factcheck?: Doc<Factcheck>; act: (work: () => Promise<void>) => Promise<void>; saveClaim: (claim: Claim, doc?: Doc<Claim>) => Promise<void>;
  lookUp: (body: Record<string, string>) => Promise<void>; setNotices: (notices: Notice[]) => void;
}) {
  const doc = claims.find((item) => item.doc_id === line.claim_id)!;
  const [angles, setAngles] = useState<string[]>(spec.angles);
  const [plan, setPlan] = useState<{ seeds: number; max_queries: number; max_fetches: number } | null>(null);
  const [own, setOwn] = useState<{ card: string; stance: string; quote: string; reason: string; reading?: ReadingEntry & { reading: string } }>({ card: "", stance: "", quote: "", reason: "" });
  const [judge, setJudge] = useState<{ verdict: string; reason: string }>({ verdict: verdict?.content.verdict ?? "", reason: verdict?.content.reason ?? "" });
  const checkable = line.sentence === spec.checkable;
  // one live stance per claim and card: ``held`` is it, whatever version it was read from; ``mine`` only when it counts now
  const held = (card: string) => stances.find((item) => item.content.card === card);
  const sha = (card: string) => cards.find((item) => item.card === card)?.snapshot?.sha256;
  const mine = (card: string) => { const stance = held(card); return stance && stance.content.claim_version === line.version && stance.content.snapshot === sha(card) ? stance : undefined; };
  const post = (path: string, body: unknown) => apiFetch<Record<string, any>>(`${base}${path}`, { method: "POST", body: JSON.stringify(body) });
  const saveStance = (content: Stance, held?: Doc<Stance>) => act(async () => {
    const saved = await post("/verify/stances", { content, ...(held ? { doc_id: held.doc_id, base_version: held.version } : {}) });
    setNotices(saved.notices ?? []); setOwn({ card: "", stance: "", quote: "", reason: "" });
  });
  const writeOwn = () => {
    const card = cards.find((item) => item.card === own.card);
    if (!card?.snapshot?.sha256) return;
    const content: Stance = { claim: line.claim_id, claim_version: line.version, card: own.card, snapshot: card.snapshot.sha256, stance: own.stance,
      ...(own.quote.trim() ? { quote: own.quote.trim() } : {}), ...(own.reading ? { reading: own.reading.reading } : {}), ...(own.reason.trim() ? { reason: own.reason.trim() } : {}) };
    return saveStance(content, held(own.card));
  };
  const goCheck = (confirm: boolean) => act(async () => {
    const answer = await post(`/verify/claims/${enc(line.claim_id)}/search`, { angles, confirm });
    setPlan(confirm ? null : answer.plan);
  });
  const saveVerdict = () => act(async () => {
    const content = { claim: line.claim_id, claim_version: line.version, verdict: judge.verdict, reason: judge.reason.trim() };
    setNotices((verdict ? await docs.update(projectId, "verify.verdict", verdict, content) : await docs.create(projectId, "verify.verdict", content)).notices);
  });
  const earlier = line.earlier.map((id) => lines.find((item) => item.claim_id === id)).filter(Boolean) as Line[];
  return (
    <div className="judge">
      {editing ? <ClaimForm spec={spec} busy={busy} initial={{ ...doc.content, reason: "" }} needReason onSave={(claim) => saveClaim(claim, doc)} onCancel={() => setEditing(null)} /> : <>
        <p className="mt0"><b>{line.text}</b></p>
        <span className="tags">
          <span>{line.sentence}</span>{line.law && <span>法律{line.law_state ? `：${line.law_state}` : ""}</span>}<span>{doc.content.from === "MAP" ? "從地圖帶來的" : doc.content.proposal ? "AI 提的，你確認了" : "你寫的"}</span>
          {earlier.length > 0 && <span>你查過</span>}
        </span>
        {earlier.map((item) => <p key={item.claim_id} className="hint">你查過：這個案子裡同一個說法寫過一次。{item.verdict ? `當時你標「${item.verdict.verdict}」：${item.verdict.reason}` : "當時還沒有判定。"}</p>)}
      </>}
      <p><b>帳本：</b>{line.state}{checkable && <>　支持的獨立出處 {line.support.length} 個、反對的 {line.oppose.length} 個</>}{line.stale > 0 && <span className="sub">（{line.stale} 筆讀法是舊版的，不算）</span>}</p>
      {line.few && <p className="warn">獨立出處不到 {spec.min_origins} 個：{line.weak_line}。AI 摘要時會先停下來，由你決定。</p>}
      {line.needs_alternative && <p className="hint">這是對事實的解釋，不查真假。請你至少寫一個別的解釋（按「改」）。</p>}
      {checkable && <ul className="check">
        <li>{line.three.found ? "✓" : "・"} 找得到出處</li>
        <li>{line.three.independent_enough ? "✓" : "・"} 出處彼此獨立（{line.three.independent} 個）</li>
        <li>・ 出處站得住：系統不打勾，只列查得到的事，由你判斷。
          <ul>{line.three.stands.flatMap((stand) => stand.cards).map((card) => <li key={card.card}>{card.title || card.url}　<CellLine label="誰辦的" cell={card.operator} />　<CellLine label="原始還是轉貼" cell={card.original} />{card.lists.length > 0 && <span className="k">　名單：{card.lists.map((item) => item.list).join("、")}</span>}</li>)}</ul>
        </li>
      </ul>}
      {checkable && <div className="field">
        <b>去查</b>{line.lookup && <span className="sub">　上次：{line.lookup.status === "completed" ? "跑完了" : line.lookup.status === "failed" ? "沒有跑完" : "還在找"}</span>}
        {line.search && <span className="sub">　結果：{line.search.state}{line.search.why ? `（${line.search.why}）` : ""}</span>}
        <div className="chips" role="group" aria-label="要找的方向">{spec.angles.map((angle) => (
          <button key={angle} type="button" className={`chip${angles.includes(angle) ? " on" : ""}`} aria-pressed={angles.includes(angle)} onClick={() => setAngles(angles.includes(angle) ? angles.filter((item) => item !== angle) : [...angles, angle])}>{ANGLE_NAMES[angle] ?? angle}</button>
        ))}</div>
        {plan ? <p className="hint">計畫：最多 {plan.max_queries} 次搜尋、讀 {plan.max_fetches} 頁。找資料的服務在背後找，找回來的寫進來源。</p> : null}
        <div className="btns">
          {plan ? <button className="btn primary" type="button" disabled={busy || angles.length === 0} onClick={() => goCheck(true)}>確認去查</button>
            : <button className="btn" type="button" disabled={busy || angles.length === 0} onClick={() => goCheck(false)}>去查（先看計畫）</button>}
          <button className="btn ghost" type="button" disabled={busy} onClick={() => lookUp({ claim: line.claim_id })}>查查核資料庫</button>
        </div>
        {factcheck && <FactcheckResult result={factcheck.content} spec={spec} />}
      </div>}
      {readings.length > 0 && <div className="field">
        <b>AI 的讀法（不算數，你確認了才算）</b>
        {readings.map((entry) => (
          <div key={entry.card} className="mcard">
            <span className="k">{cardTitle(entry.card)}</span><span>{entry.reads_as}{entry.quote ? `：「${entry.quote}」` : ""}</span><span className="tags"><span>{AUTHOR.ai}</span>{mine(entry.card) && <span>你讀過了</span>}</span>
            {!mine(entry.card) && <div className="btns">
              <button className="btn" type="button" disabled={busy} onClick={() => saveStance({ claim: line.claim_id, claim_version: entry.claim_version, card: entry.card, snapshot: entry.snapshot, stance: entry.reads_as, reading: entry.reading, ...(entry.quote ? { quote: entry.quote } : {}) }, held(entry.card))}>照這樣記</button>
              <button className="btn ghost" type="button" onClick={() => setOwn({ card: entry.card, stance: "", quote: "", reason: "", reading: entry })}>我讀的不一樣</button>
            </div>}
          </div>
        ))}
        {readings.some((entry) => !mine(entry.card)) && <div className="btns"><button className="btn" type="button" disabled={busy}
          onClick={() => act(async () => { for (const reading of [...new Set(readings.filter((entry) => !mine(entry.card)).map((entry) => entry.reading))]) setNotices((await post("/verify/stances/confirm", { reading, claim: line.claim_id })).notices ?? []); })}>這個主張的全部照這樣記</button></div>}
      </div>}
      {stances.length > 0 && <ul>{stances.map((item) => <li key={item.doc_id}>{cardTitle(item.content.card)}：{item.content.stance}{item.content.quote ? `「${item.content.quote}」` : ""}<span className="tags"><span>{AUTHOR[item.author]}</span>{item.content.claim_version !== line.version && <span>讀的是舊版的主張</span>}</span></li>)}</ul>}
      <div className="field">
        <b>你讀一張來源卡</b>
        <Chips options={cards.map((card) => card.card)} value={own.card} onPick={(card) => setOwn({ ...own, card, reading: readings.find((entry) => entry.card === card) })} label="讀哪一張"
          names={Object.fromEntries(cards.map((card) => [card.card, (card.title || card.url || "來源卡").slice(0, 24)]))} />
        <Chips options={spec.stances} value={own.stance} onPick={(stance) => setOwn({ ...own, stance })} label="它怎麼說這個主張" />
        <input className="search" aria-label="原文的哪一段（選填，要照抄）" placeholder="原文的哪一段（選填，要照抄）" value={own.quote} maxLength={2000} onChange={(event) => setOwn({ ...own, quote: event.target.value })} />
        {own.reading && own.stance && own.stance !== own.reading.reads_as && <input className="search" aria-label="為什麼跟 AI 讀的不一樣" placeholder="為什麼跟 AI 讀的不一樣（必填）" value={own.reason} maxLength={1000} onChange={(event) => setOwn({ ...own, reason: event.target.value })} />}
        <div className="btns"><button className="btn" type="button" disabled={busy || !own.card || !own.stance || Boolean(own.reading && own.stance !== own.reading.reads_as && !own.reason.trim())} onClick={writeOwn}>存我的讀法</button></div>
      </div>
      <div className="field">
        <b>你的判定</b>
        {line.verdict?.earlier && <p className="hint">你判的是這個主張的舊版。看過新的再判一次。</p>}
        <Chips options={spec.verdicts} value={judge.verdict} onPick={(value) => setJudge({ ...judge, verdict: value })} label="採信、存疑或不採信" />
        <input className="search" aria-label="一句理由" placeholder="一句理由" value={judge.reason} maxLength={1000} onChange={(event) => setJudge({ ...judge, reason: event.target.value })} />
        <div className="btns">
          <button className="btn primary" type="button" disabled={busy || !judge.verdict || !judge.reason.trim()} onClick={saveVerdict}>存判定</button>
          {!editing && <button className="btn ghost" type="button" onClick={() => setEditing(line.claim_id)}>改主張</button>}
        </div>
      </div>
    </div>
  );
}
