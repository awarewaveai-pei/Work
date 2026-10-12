"use client";

// GATHER 蒐集來源 (contract card): you write what to look for and press 「去找」 (the plan first, then the search); you
// paste a URL or a file's text (marked 「我貼的」) or write your own words (kept apart, never a source); you see the
// independent origins, who runs each page, when it first appeared and how it was found; you mark each origin 採用／存疑／
// 不用 with a reason, split a group, change a classification. Under two origins, with too few channels or nothing in the
// place's language the system stops and you decide. The AI only suggests queries, says what each source says, sets
// contradicting sources side by side and names whose account may be missing -- it never marks, deletes or scores a source.
import React, { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { AUTHOR, ai, docs, type AiTurn, type Doc, type Notice } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { BlockShell, Notices } from "./BlockShell";
import { Fold, Missing, Refused, firstMissing, type Failed } from "./PageParts";

export type Cell = { state: string; value?: string; why?: string };
type Listed = { list: string; category: string; maintainer: string; version: string };
export type CardView = {
  card: string; version: number; source_id?: string; url?: string; title?: string; aside: string;
  found_by: { by: string; provider?: string; lang?: string; query?: string; angle?: string };
  cells: Record<string, Cell>; lists?: Listed[]; snapshot?: { sha256: string; fetched_at: string };
  mine: Record<string, { value: string; reason: string }>;
};
export type Origin = { origin_id: string; cards: CardView[]; how: string; pending: boolean; aside: boolean; counts: boolean; mark: { mark: string; reason: string; applies?: string } | null; wrong_in_review?: string[] };
type Channel = { provider: string; lang: string; state: string; why: string; says: string };
export type Overview = {
  origins: Origin[]; changed_marks: Array<{ doc_id: string; origin: string; cards: string[]; mark: string; reason: string }>;
  counted: number; min_origins: number; aside: number; data_classification: string;
  card_limit: { max: number; cards: number; uncarded: number; notice: string };
  channels: { engines: Array<{ key: string; name: string }>; languages: Array<{ key: string; name: string }>; blocked: Channel[]; short: string[]; ask: string[]; looked: boolean };
  distribution: Record<"engine" | "language" | "country", Record<string, number>>;
  rules: Array<{ name: string; title: string; version: string; maintainer: string; items: any }>;
  words: { cells: Array<{ key: string; label: string }>; states: string[]; marks: string[]; applies: string[]; found_by: string[]; own: string; someone_said: string;
           angles: Array<{ key: string; name: string }>; overridable: string[]; providers: Array<{ key: string; name: string }> };
};
type Ask = { text: string; angles?: string[]; card?: string; url?: string; run?: string };
type Mark = { origin: string; cards: string[]; mark: string; reason: string; applies?: string };
type Split = { cards: string[]; reason: string };
type Override = { card: string; key: string; value: string; reason: string };
type Query = { text: string; lang: string; angle: string };
type Says = { items?: Array<{ card: string; says: string; quote?: string; citations: string[] }>; gaps?: string[]; question?: string };
type Side = { card: string; quote: string };
type Compare = { conflicts: Array<{ about: string; a: Side; b: Side }>; missing: Array<{ side: string; why: string }> };
type Turn<C> = AiTurn<C> & { handback?: string };   // lib/blocks AiTurn has no handback yet (asked of S)
export type Seed = { uri: string; meta: Record<string, unknown> };
type Plan = { seeds: number; max_queries: number; max_fetches: number };
type Pending = { ask: Doc<Ask>; seeds: Seed[]; plan: Plan };
// GET /projects/{id}/collections/{run} (project_source_repository._run_from_row): what the server knows while it runs
type Run = { status: string; requested_at?: string; deadline_at?: string; max_fetches?: number };

const DEFAULT_ANGLES = ["primary", "news", "factcheck", "precedent", "field"];
export const SEARCH_LANGUAGES = ["zh", "en"];
const MAX_AI_CARDS = 12;
const RUN_WORDS: Record<string, string> = { requested: "已經送出，等找資料的服務接手", running: "系統正在找", completed: "找完了", failed: "沒找成" };
const FINISHED = ["completed", "failed"];
const POLL_MS = 15000;   // a running search is asked again this often: one request per open search

const minutes = (ms: number) => { const count = Math.floor(ms / 60000); return count < 1 ? "不到 1 分鐘" : ` ${count} 分鐘`; };   // "已經過了 7 分鐘"、"已經過了不到 1 分鐘"
/** A search while it runs, in what the server reports: how long since it was sent, when it ends at the latest, how many
 *  pages at most. Nothing about how far it got: the server does not say that until it is done. */
export function runLine(run: Run | undefined, now: number): string {
  if (!run || !run.status) return "讀不到進度";
  const words = RUN_WORDS[run.status] ?? "讀不到進度";
  if (FINISHED.includes(run.status)) return words;
  const sent = Date.parse(run.requested_at ?? "");
  const deadline = Date.parse(run.deadline_at ?? "");
  return [
    `${words}。`,
    Number.isFinite(sent) ? `已經過了${minutes(now - sent)}。` : "",
    Number.isFinite(deadline) && deadline > now ? `最晚再${minutes(deadline - now + 59999)}會結束。` : "",
    run.max_fetches ? `最多抓 ${run.max_fetches} 頁。` : "",
    "找完，來源會出現在下面的「來源總覽」。",
  ].join("");
}
const enc = encodeURIComponent;

/** One search as the collector takes it (STEP2_SHARED_RULES §4.1): each (angle × language × provider) is its own query. */
export function searchSeed(askId: string, text: string, angles: string[], providers: string[], languages: string[] = SEARCH_LANGUAGES): Seed {
  return { uri: `entity://claim/${askId.slice(0, 8)}`, meta: { kind: "claim", entityName: text.trim().slice(0, 200), angles, languages, providers } };
}
export function pastedSeed(url: string): Seed {
  return { uri: url.trim(), meta: { pasted: true } };
}
/** A cell in words: 查到 shows what was found (and on what basis), the other two show why. */
export function cellText(cell: Cell | undefined): string {
  if (!cell) return "";
  return cell.value ? `${cell.state}：${cell.value}${cell.why ? `（${cell.why}）` : ""}` : `${cell.state}：${cell.why ?? ""}`;
}
const hostOf = (url?: string) => { try { return url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch { return url ?? ""; } };
const toggle = (list: string[], key: string) => list.includes(key) ? list.filter((item) => item !== key) : [...list, key];

function Chips({ options, picked, onPick, label }: { options: Array<{ key: string; name: string }>; picked: string[]; onPick: (key: string) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => <button key={option.key} type="button" className={`chip${picked.includes(option.key) ? " on" : ""}`} aria-pressed={picked.includes(option.key)} onClick={() => onPick(option.key)}>{option.name}</button>)}
    </div>
  );
}

function CardBox({ projectId, card, words, busy, failed, onSearch, onOverride, override }: {
  projectId: string; card: CardView; words: Overview["words"]; busy: boolean; failed: Failed; onSearch: (card: CardView, angle: string) => void;
  onOverride: (card: string, key: string, value: string, reason: string) => void; override: (card: string, key: string) => Doc<Override> | undefined;
}) {
  const [copy, setCopy] = useState<string | null>(null);
  const [changing, setChanging] = useState<{ key: string; value: string; reason: string } | null>(null);
  const label = (key: string) => key === "lists" ? "列在哪份名單上" : words.cells.find((item) => item.key === key)?.label ?? key;
  // a cell the system found, or one you changed, shows; 查不到／無法檢查 fold into one line (nothing is left out)
  const found = words.cells.filter(({ key }) => card.mine[key] || card.cells[key]?.state === words.states[0]);
  const unfound = words.cells.filter(({ key }) => !found.some((item) => item.key === key));
  const cellRow = ({ key, label: name }: { key: string; label: string }) => (
    <tr key={key}><td>{name}</td><td>{card.mine[key]
      ? <><b>你改的：{card.mine[key].value}</b>（{card.mine[key].reason}）<br /><span className="sub">系統的：{cellText(card.cells[key])}</span></>
      : cellText(card.cells[key])}</td></tr>
  );
  const readCopy = async () => {
    if (copy !== null) { setCopy(null); return; }
    try { setCopy((await apiFetch<{ content: string }>(`/projects/${enc(projectId)}/sources/${enc(card.source_id!)}/content`)).content.slice(0, 2000)); } catch (reason) { setCopy(humanError(reason)); }
  };
  return (
    <div className="mcard">
      <b>{card.title || hostOf(card.url) || "（沒有標題）"}</b>
      <span className="k">{card.url ? <a href={card.url} target="_blank" rel="noreferrer">{hostOf(card.url)}</a> : "你貼的檔案"}・{card.found_by.by}
        {card.found_by.provider ? `・${card.found_by.provider}${card.found_by.lang ? `／${card.found_by.lang}` : ""}` : ""}{card.found_by.query ? `・查詢：${card.found_by.query}` : ""}</span>
      <span className="tags"><span>{words.someone_said}</span>{card.aside && <span>放一旁：{card.aside}</span>}</span>
      <table className="plan"><tbody>
        {found.map(cellRow)}
        <tr><td>列在哪份名單上</td><td>{card.mine.lists ? <b>你改的：{card.mine.lists.value}（{card.mine.lists.reason}）</b>
          : (card.lists ?? []).length ? (card.lists ?? []).map((item) => `${item.list}（${item.maintainer}${item.version ? `，${item.version} 版` : ""}）`).join("、") : "不在平台的任何名單上"}</td></tr>
        {card.snapshot && <tr><td>當時的樣子</td><td>{card.snapshot.fetched_at.slice(0, 10)} 存的，核對碼 {card.snapshot.sha256.slice(0, 12)}…（網頁之後改了，核對碼就不一樣）；來源卡第 {card.version} 版</td></tr>}
      </tbody></table>
      {unfound.length > 0 && <Fold title={`另有 ${unfound.length} 項${words.states.slice(1).join("或")}`}><table className="plan"><tbody>{unfound.map(cellRow)}</tbody></table></Fold>}
      {copy !== null && <p className="read">{copy}</p>}
      <div className="btns">
        {card.source_id && <button className="btn ghost" type="button" onClick={readCopy}>{copy !== null ? "收起存下來的那一份" : "看存下來的那一份"}</button>}
        <button className="btn ghost" type="button" disabled={busy} onClick={() => onSearch(card, "opposite")}>找跟它說法相反的</button>
        <button className="btn ghost" type="button" disabled={busy} onClick={() => onSearch(card, "origin")}>找它引用的原始文件</button>
        <button className="btn ghost" type="button" onClick={() => setChanging({ key: "", value: "", reason: "" })}>改分類</button>
      </div>
      <Refused failed={failed} at={`card-${card.card}`} />
      {changing && (
        <div className="judge">
          <b>改哪一格</b>
          <Chips label="改哪一格" options={words.overridable.map((key) => ({ key, name: label(key) }))} picked={changing.key ? [changing.key] : []}
            onPick={(key) => setChanging({ key, value: override(card.card, key)?.content.value ?? "", reason: override(card.card, key)?.content.reason ?? "" })} />
          <label htmlFor={`value-${card.card}`}>你的分類</label>
          <input id={`value-${card.card}`} className="search" value={changing.value} maxLength={300} onChange={(event) => setChanging({ ...changing, value: event.target.value })} />
          <label htmlFor={`why-${card.card}`}>為什麼改（必填）</label>
          <input id={`why-${card.card}`} className="search" value={changing.reason} maxLength={1000} onChange={(event) => setChanging({ ...changing, reason: event.target.value })} />
          <div className="btns mt8">
            <button className="btn primary" type="button" disabled={!changing.key || !changing.value.trim() || !changing.reason.trim() || busy}
              onClick={() => { onOverride(card.card, changing.key, changing.value.trim(), changing.reason.trim()); setChanging(null); }}>存我的分類</button>
            <button className="btn ghost" type="button" onClick={() => setChanging(null)}>取消</button>
          </div>
          <Missing why={!busy && firstMissing([!changing.key, "先選改哪一格。"], [!changing.value.trim(), "寫你的分類。"], [!changing.reason.trim(), "寫為什麼改。"])} />
        </div>
      )}
    </div>
  );
}

function OriginBox({ projectId, origin, view, busy, failed, onMark, onSplit, ...card }: {
  projectId: string; origin: Origin; view: Overview; busy: boolean; failed: Failed;
  onMark: (origin: Origin, mark: string, reason: string, applies: string) => void; onSplit: (origin: Origin, cards: string[], reason: string) => void;
  onSearch: (card: CardView, angle: string) => void; onOverride: (card: string, key: string, value: string, reason: string) => void; override: (card: string, key: string) => Doc<Override> | undefined;
}) {
  const words = view.words;
  const [marking, setMarking] = useState<{ mark: string; reason: string; applies: string } | null>(null);
  const [splitting, setSplitting] = useState<{ cards: string[]; reason: string } | null>(null);
  const state = origin.pending ? "還在分組，不算" : origin.counts ? "算一個獨立出處" : origin.aside ? "放一旁，不算" : "你標了不用，照樣交出去，不算";
  return (
    <div className="station">
      <h3>{origin.how}・{origin.cards.length} 頁 <small>{state}</small></h3>
      {origin.mark && <p className="why">你的標記：<b>{origin.mark.mark}</b>（{origin.mark.reason}）{origin.mark.applies ? `・${origin.mark.applies}這裡` : ""}</p>}
      {(origin.wrong_in_review ?? []).length > 0 && <p className="warn">回顧時你標錯過這個出處。</p>}
      <div className="mcards">{origin.cards.map((item) => <CardBox key={item.card} projectId={projectId} card={item} words={words} busy={busy} failed={failed} {...card} />)}</div>
      <div className="btns mt8">
        {!origin.pending && <button className="btn" type="button" onClick={() => setMarking({ mark: origin.mark?.mark ?? "", reason: origin.mark?.reason ?? "", applies: origin.mark?.applies ?? "" })}>{origin.mark ? "改我的標記" : "標這個出處"}</button>}
        {origin.cards.length > 1 && <button className="btn ghost" type="button" onClick={() => setSplitting({ cards: [], reason: "" })}>把組拆開</button>}
      </div>
      <Refused failed={failed} at={`origin-${origin.origin_id}`} />
      {marking && (
        <div className="judge">
          <b>這個出處你{origin.cards.length > 1 ? `（這一組 ${origin.cards.length} 頁一起標）` : ""}</b>
          <Chips label="採用、存疑或不用" options={words.marks.map((key) => ({ key, name: key }))} picked={[marking.mark]} onPick={(mark) => setMarking({ ...marking, mark })} />
          <label htmlFor={`reason-${origin.origin_id}`}>一句理由（必填）</label>
          <input id={`reason-${origin.origin_id}`} className="search" value={marking.reason} maxLength={1000} onChange={(event) => setMarking({ ...marking, reason: event.target.value })} />
          <p className="hint">別國的資料，先標它適不適用這裡（選填）：</p>
          <Chips label="適不適用這裡" options={words.applies.map((key) => ({ key, name: key }))} picked={[marking.applies]} onPick={(applies) => setMarking({ ...marking, applies: marking.applies === applies ? "" : applies })} />
          <div className="btns mt8">
            <button className="btn primary" type="button" disabled={!marking.mark || !marking.reason.trim() || busy} onClick={() => { onMark(origin, marking.mark, marking.reason.trim(), marking.applies); setMarking(null); }}>存標記</button>
            <button className="btn ghost" type="button" onClick={() => setMarking(null)}>取消</button>
          </div>
          <Missing why={!busy && firstMissing([!marking.mark, "先選採用、存疑或不用。"], [!marking.reason.trim(), "寫一句理由，才能存。"])} />
        </div>
      )}
      {splitting && (
        <div className="judge">
          <b>哪幾頁拆出來，自己算一個出處</b>
          <ul className="check">{origin.cards.map((item) => (
            <li key={item.card}><label><input type="checkbox" checked={splitting.cards.includes(item.card)} onChange={() => setSplitting({ ...splitting, cards: toggle(splitting.cards, item.card) })} /> {item.title || hostOf(item.url)}</label></li>
          ))}</ul>
          <label htmlFor={`split-${origin.origin_id}`}>為什麼拆開（必填）</label>
          <input id={`split-${origin.origin_id}`} className="search" value={splitting.reason} maxLength={1000} onChange={(event) => setSplitting({ ...splitting, reason: event.target.value })} />
          <div className="btns mt8">
            <button className="btn primary" type="button" disabled={!splitting.cards.length || splitting.cards.length === origin.cards.length || !splitting.reason.trim() || busy}
              onClick={() => { onSplit(origin, splitting.cards, splitting.reason.trim()); setSplitting(null); }}>拆開</button>
            <button className="btn ghost" type="button" onClick={() => setSplitting(null)}>取消</button>
          </div>
          <Missing why={!busy && firstMissing([!splitting.cards.length, "先勾要拆出來的頁。"], [splitting.cards.length === origin.cards.length, "不能整組都勾：至少留一頁在組裡。"], [!splitting.reason.trim(), "寫為什麼拆開。"])} />
        </div>
      )}
    </div>
  );
}

export function GatherPage({ projectId }: { projectId: string }) {
  const base = `/projects/${enc(projectId)}`;
  const [view, setView] = useState<Overview | null>(null);
  const [asks, setAsks] = useState<Doc<Ask>[]>([]);
  const [owns, setOwns] = useState<Doc<{ text: string }>[]>([]);
  const [marks, setMarks] = useState<Doc<Mark>[]>([]);
  const [splits, setSplits] = useState<Doc<Split>[]>([]);
  const [overrides, setOverrides] = useState<Doc<Override>[]>([]);
  const [gaps, setGaps] = useState<string[]>([]);
  const [queries, setQueries] = useState<Doc<{ queries: Query[]; note?: string }> | null>(null);
  const [says, setSays] = useState<Doc<Says>[]>([]);
  const [compare, setCompare] = useState<Doc<Compare> | null>(null);
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [now, setNow] = useState(() => Date.now());
  const [question, setQuestion] = useState("");
  const [angles, setAngles] = useState<string[]>(DEFAULT_ANGLES);
  const [providers, setProviders] = useState<string[] | null>(null);   // null = every engine the platform has (你可以關掉某個搜尋管道)
  const [url, setUrl] = useState("");
  const [file, setFile] = useState({ title: "", venue: "", text: "" });
  const [own, setOwn] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [goOn, setGoOn] = useState(false);
  const [handback, setHandback] = useState<{ action: string; why: string } | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<Failed>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const engines = providers ?? (view?.words.providers ?? []).map((item) => item.key);
  const load = async () => {
    const [overview, askDocs, ownDocs, markDocs, overrideDocs, maps, queryDocs, sayDocs, compareDocs, splitDocs] = await Promise.all([
      apiFetch<Overview>(`${base}/gather`), docs.list<Ask>(projectId, "gather.ask"), docs.list<{ text: string }>(projectId, "gather.own"),
      docs.list<Mark>(projectId, "gather.mark"), docs.list<Override>(projectId, "gather.override"), docs.list<{ gaps?: string[] }>(projectId, "map.map"),
      docs.list<{ queries: Query[]; note?: string }>(projectId, "gather.ai_queries"), docs.list<Says>(projectId, "gather.ai_says"), docs.list<Compare>(projectId, "gather.ai_compare"),
      docs.list<Split>(projectId, "gather.split"),
    ]);
    setView(overview); setAsks(askDocs); setOwns(ownDocs); setMarks(markDocs); setOverrides(overrideDocs); setSplits(splitDocs);
    setGaps(maps.at(-1)?.content.gaps ?? []); setQueries(queryDocs.at(-1) ?? null); setSays(sayDocs); setCompare(compareDocs.at(-1) ?? null);
    // a run that cannot be read shows 讀不到進度 on its line (runLine), not an error for the page
    const found = await Promise.all(askDocs.filter((doc) => doc.content.run).map(async (doc) => [doc.content.run!, await apiFetch<Run>(`${base}/collections/${enc(doc.content.run!)}`).catch(() => ({ status: "" }))] as const));
    setRuns(Object.fromEntries(found));
    setNow(Date.now());
  };
  useEffect(() => { load().catch((reason) => setError(humanError(reason))); }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // While a search runs, ask the server again every POLL_MS: the line shows how long it has run; when one ends, the page
  // reloads once (its cards are made when it ends).
  // a run whose status could not be read ("") is asked again too: one failed read must not stop the line for good
  const openRuns = Object.entries(runs).filter(([, run]) => !FINISHED.includes(run.status)).map(([id]) => id).join(",");
  useEffect(() => {
    if (!openRuns) return;
    let active = true;
    const timer = setInterval(async () => {
      setNow(Date.now());
      const next = await Promise.all(openRuns.split(",").map(async (id) => [id, await apiFetch<Run>(`${base}/collections/${enc(id)}`).catch(() => null)] as const));
      if (!active) return;
      if (next.some(([, run]) => run && FINISHED.includes(run.status))) load().catch((reason) => { if (active) setFailed({ at: "asks", text: humanError(reason) }); });
      else setRuns((held) => ({ ...held, ...Object.fromEntries(next.filter((entry): entry is readonly [string, Run] => entry[1] !== null)) }));
    }, POLL_MS);
    return () => { active = false; clearInterval(timer); };
  }, [openRuns]);   // eslint-disable-line react-hooks/exhaustive-deps

  // `at`: the button group that sent it; its refusal is shown there (PageParts.Refused)
  const act = async (at: string, work: () => Promise<void>) => {
    setFailed(null); setBusy(true);
    try { await work(); await load(); setRefresh((count) => count + 1); } catch (reason) { setFailed({ at, text: humanError(reason) }); } finally { setBusy(false); }
  };
  // 「去找」: your question is kept first, then the plan is shown; only 「確定去找」 starts the collector.
  const plan = async (ask: Doc<Ask>, seeds: Seed[]) => {
    const answer = await apiFetch<{ plan: Plan }>(`${base}/collections`, { method: "POST", body: JSON.stringify({ seeds }) });
    setPending({ ask, seeds, plan: answer.plan });
  };
  const search = (content: Ask, languages?: string[], at = "search") => act(at, async () => {
    const saved = await docs.create<Ask>(projectId, "gather.ask", content);
    setNotices(saved.notices);
    await plan(saved, [content.url ? pastedSeed(content.url) : searchSeed(saved.doc_id, content.text, content.angles ?? DEFAULT_ANGLES, engines, languages)]);
  });
  const searchAgain = (ask: Doc<Ask>) => act("asks", async () => { await plan(ask, [ask.content.url ? pastedSeed(ask.content.url) : searchSeed(ask.doc_id, ask.content.text, ask.content.angles ?? DEFAULT_ANGLES, engines)]); });
  const confirm = () => act("search", async () => {
    if (!pending) return;
    try {
      const started = await apiFetch<{ run_id: string }>(`${base}/collections`, { method: "POST", body: JSON.stringify({ seeds: pending.seeds, confirm: true }) });
      await docs.update<Ask>(projectId, "gather.ask", pending.ask, { ...pending.ask.content, run: started.run_id });
    } finally { setPending(null); }
  });
  const pasteFile = () => act("file", async () => {
    await apiFetch(`${base}/sources`, { method: "POST", body: JSON.stringify({ title: file.title.trim(), venue: file.venue.trim(), media_type: "text/plain", data_classification: view!.data_classification, content: file.text }) });
    setFile({ title: "", venue: "", text: "" });
  });
  const saveOwn = () => act("own", async () => { setNotices((await docs.create(projectId, "gather.own", { text: own.trim() })).notices); setOwn(""); });
  const mark = (origin: Origin, value: string, reason: string, applies: string) => act(`origin-${origin.origin_id}`, async () => {
    const content: Mark = { origin: origin.origin_id, cards: origin.cards.map((item) => item.card), mark: value, reason, ...(applies ? { applies } : {}) };
    const held = marks.find((doc) => doc.content.origin === origin.origin_id);
    setNotices((held ? await docs.update(projectId, "gather.mark", held, content) : await docs.create(projectId, "gather.mark", content)).notices);
  });
  const split = (origin: Origin, cards: string[], reason: string) => act(`origin-${origin.origin_id}`, async () => { setNotices((await docs.create(projectId, "gather.split", { cards, reason })).notices); });
  const takeBack = (card: string) => act("aside", async () => { await docs.create(projectId, "gather.takeback", { card }); });
  const override = (card: string, key: string) => overrides.find((doc) => doc.content.card === card && doc.content.key === key);
  const saveOverride = (card: string, key: string, value: string, reason: string) => act(`card-${card}`, async () => {
    const held = override(card, key);
    const content = { card, key, value, reason };
    setNotices((held ? await docs.update(projectId, "gather.override", held, content) : await docs.create(projectId, "gather.override", content)).notices);
  });
  const fromCard = (card: CardView, angle: string) => search({ text: card.title || card.url || "", angles: [angle], card: card.card }, undefined, `card-${card.card}`);
  const turn = (action: string, context: Record<string, unknown>, over?: Doc<any> | null) => act("ai", async () => {
    const result = await ai<any>(projectId, "GATHER", action, context, over) as Turn<any>;
    if (result.stopped) setNotices([{ type: "crisis", notice: result.notice ?? "", resources: result.resources ?? [] }]);
    setHandback(result.handback ? { action, why: result.handback } : null);
  });

  if (!view) return <BlockShell projectId={projectId} code="GATHER"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;
  const cards = view.origins.flatMap((origin) => origin.cards);
  const titleOf = (id: string) => { const card = cards.find((item) => item.card === id); return card?.title || hostOf(card?.url) || "這個來源"; };
  const readable = cards.filter((card) => card.source_id && !card.aside);
  const chosen = picked ?? readable.slice(0, MAX_AI_CARDS).map((card) => card.card);
  const pastedCards = readable.filter((card) => card.found_by.by === view.words.found_by[1]).map((card) => card.card);
  const shown = view.origins.filter((origin) => !origin.aside);
  const setAside = cards.filter((card) => card.aside);
  const angleName = (key: string) => view.words.angles.find((item) => item.key === key)?.name ?? key;
  // under two origins stops once a search finished (an empty one too) or anything was gathered -- never before
  const gathered = view.origins.length > 0 || Object.values(runs).some((run) => FINISHED.includes(run.status));
  const few = gathered && view.counted < view.min_origins;
  const stop = few || view.channels.short.length > 0 || view.channels.ask.length > 0;

  return (
    <BlockShell projectId={projectId} code="GATHER" refresh={refresh}>
      <Notices notices={notices} />
      <div className="card cta">
        <h2>要查什麼</h2>
        <p className="how">寫下你要查的事。按「去找」，系統先給你看會怎麼找，你確定了才開始。找回來的每一頁都標「{view.words.someone_said}」，不是事實。</p>
        {gaps.length > 0 && <><p className="hint">你的地圖寫了還缺的資料（點一下帶進來）：</p>
          <div className="chips">{gaps.map((gap) => <button key={gap} type="button" className="chip" onClick={() => setQuestion(gap)}>{gap}</button>)}</div></>}
        <label htmlFor="gather-question">要查的事</label>
        <textarea id="gather-question" value={question} maxLength={2000} onChange={(event) => setQuestion(event.target.value)} />
        <p className="hint">從哪些方向找（可以多選）：</p>
        <Chips label="從哪些方向找" options={view.words.angles} picked={angles} onPick={(key) => setAngles(toggle(angles, key))} />
        <p className="hint">用哪些搜尋引擎（可以關掉）：</p>
        <Chips label="用哪些搜尋引擎" options={view.words.providers} picked={engines} onPick={(key) => setProviders(toggle(engines, key))} />
        <div className="btns mt8"><button className="btn primary" type="button" disabled={!question.trim() || !angles.length || !engines.length || busy} onClick={() => search({ text: question.trim(), angles })}>去找</button></div>
        <Missing why={firstMissing([!question.trim(), "先寫要查的事。"], [!angles.length, "至少選一個方向。"], [!engines.length, "至少開一個搜尋引擎。"])} />
        {pending && (
          <div className="judge" role="dialog" aria-label="會怎麼找">
            <b>會怎麼找</b>
            <p>最多 {pending.plan.max_queries} 組查詢，最多抓 {pending.plan.max_fetches} 頁。會請找資料的服務用 {view.words.providers.filter((item) => engines.includes(item.key)).map((item) => item.name).join("、")} 找，中文和英文各找一次；真的用上哪些，找完才知道。</p>
            <p className="sub">{view.channels.looked ? `上一次真的用上：${view.channels.engines.map((item) => item.name).join("、") || "沒有搜尋引擎"}。` : "這個案子還沒找過。"}
              {view.channels.blocked.map((item) => `${item.says}。`).join("")}</p>
            <div className="btns"><button className="btn primary" type="button" disabled={busy} onClick={confirm}>確定去找</button><button className="btn ghost" type="button" onClick={() => setPending(null)}>先不要</button></div>
          </div>
        )}
        <Refused failed={failed} at="search" />
        {asks.length > 0 && <><h3>查過什麼</h3><ul>{asks.map((ask) => (
          <li key={ask.doc_id}>{ask.content.url ? `你貼的網址：${ask.content.url}` : ask.content.text}{(ask.content.angles ?? []).length > 0 && <span className="sub">（{ask.content.angles!.map(angleName).join("、")}）</span>}・
            {ask.content.run ? <span role="status">{runLine(runs[ask.content.run], now)}</span> : <>還沒去找 <button className="btn ghost" type="button" disabled={busy} onClick={() => searchAgain(ask)}>去找</button></>}</li>
        ))}</ul></>}
        <Refused failed={failed} at="asks" />
      </div>

      <div className="card">
        <h2>自己貼</h2>
        <p className="how">你貼的網址和檔案標「{view.words.found_by[1]}」，系統一樣查它是誰辦的。截圖請先把上面的字打成文字再貼。</p>
        <label htmlFor="gather-url">網址</label>
        <input id="gather-url" className="search" value={url} maxLength={2048} placeholder="https://" onChange={(event) => setUrl(event.target.value)} />
        <div className="btns mt8"><button className="btn" type="button" disabled={!/^https:\/\/\S+$/.test(url.trim()) || busy} onClick={() => { search({ text: url.trim(), url: url.trim() }, undefined, "url"); setUrl(""); }}>抓這個網址</button></div>
        <Missing why={url.trim() !== "" && !/^https:\/\/\S+$/.test(url.trim()) && "網址要用 https:// 開頭，中間不能有空格。"} />
        <Refused failed={failed} at="url" />
        <h3>貼一份檔案的文字</h3>
        <label htmlFor="gather-file-title">標題</label>
        <input id="gather-file-title" className="search" value={file.title} maxLength={300} onChange={(event) => setFile({ ...file, title: event.target.value })} />
        <label htmlFor="gather-file-venue">出處：誰發表的、在哪裡（必填；沒有出處的，請寫在下面「我自己說的」）</label>
        <input id="gather-file-venue" className="search" value={file.venue} maxLength={300} onChange={(event) => setFile({ ...file, venue: event.target.value })} />
        <label htmlFor="gather-file-text">內文</label>
        <textarea id="gather-file-text" value={file.text} onChange={(event) => setFile({ ...file, text: event.target.value })} />
        <div className="btns mt8"><button className="btn" type="button" disabled={!file.title.trim() || !file.venue.trim() || !file.text.trim() || busy} onClick={pasteFile}>存這份檔案</button></div>
        <Missing why={(file.title.trim() || file.venue.trim() || file.text.trim()) && firstMissing([!file.title.trim(), "還缺標題。"], [!file.venue.trim(), "還缺出處：誰發表的、在哪裡。"], [!file.text.trim(), "還缺內文。"])} />
        <Refused failed={failed} at="file" />
        <h3>{view.words.own}</h3>
        <p className="how">沒有出處的話、你聽來的事，寫在這裡。它不算外部來源，不會被當成證據。</p>
        <textarea aria-label={view.words.own} value={own} maxLength={5000} onChange={(event) => setOwn(event.target.value)} />
        <div className="btns mt8"><button className="btn" type="button" disabled={!own.trim() || busy} onClick={saveOwn}>存</button></div>
        {owns.length > 0 && <ul>{owns.map((doc) => <li key={doc.doc_id}>{doc.content.text} <span className="tags"><span>{view.words.own}</span></span>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => act("own", async () => { await docs.remove(projectId, "gather.own", doc.doc_id); })}>刪掉</button></li>)}</ul>}
        <Refused failed={failed} at="own" />
      </div>

      {stop && (
        <div className="card accent" role="status">
          <h2>系統先停在這裡，由你決定</h2>
          {few && <p>找到 <b>{view.counted}</b> 個獨立出處，不到 {view.min_origins} 個。很多網頁可能出自同一個地方。</p>}
          {view.channels.short.map((why) => <p key={why}>管道不足：{why}。</p>)}
          {view.channels.ask.map((why) => <p key={why}>{why}。要換個說法、換個地方的說法再找，還是照樣用這些來源？</p>)}
          {goOn ? <p className="sub">你選了照樣繼續。AI 這次會照樣整理。</p> : (
            <div className="btns">
              <button className="btn primary" type="button" onClick={() => document.getElementById("gather-question")?.focus()}>再去找</button>
              <button className="btn" type="button" onClick={() => setGoOn(true)}>照樣繼續</button>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2>來源總覽 <small>{view.counted} 個獨立出處・{view.aside} 頁放一旁（不算）</small></h2>
        {view.channels.looked && <p className="sub">這次用了：{view.channels.engines.map((item) => item.name).join("、") || "沒有搜尋引擎"}；語言：{view.channels.languages.map((item) => item.name).join("、") || "沒有"}。</p>}
        {view.channels.blocked.map((item) => <p key={`${item.provider}-${item.state}`} className="warn">無法檢查：{item.says}。</p>)}
        {cards.length > 0 && <div className="kpis">{(["engine", "language", "country"] as const).map((key) => (
          <div key={key} className="kpi"><b>{{ engine: "從哪裡找到", language: "語言", country: "國家或地區" }[key]}</b>
            {Object.entries(view.distribution[key]).map(([name, count]) => <span key={name}>{name}：{count} 頁</span>)}</div>
        ))}</div>}
        <p className="sub">列在哪份名單上、被分在哪一組，都不代表它是假的。被刪掉的文章、私人群組裡的訊息，系統看不到。</p>
        {view.card_limit.notice && <p className="warn" role="status">{view.card_limit.notice}{view.card_limit.uncarded ? `；現在有 ${view.card_limit.uncarded} 頁沒有做卡，不算進出處` : ""}。</p>}
        {splits.length > 0 && <div className="judge"><b>你拆開的</b>
          <ul>{splits.map((doc) => <li key={doc.doc_id}>{doc.content.cards.map(titleOf).join("、")}（{doc.content.reason}）
            <button className="btn ghost" type="button" disabled={busy} onClick={() => act("splits", async () => { await docs.remove(projectId, "gather.split", doc.doc_id); })}>取消拆開</button></li>)}</ul>
          <Refused failed={failed} at="splits" /></div>}
        {view.changed_marks.length > 0 && <div className="judge"><b>這些標記標的那一組變了，請重看：</b>
          <ul>{view.changed_marks.map((item) => <li key={item.doc_id}>{item.mark}（{item.reason}）：{item.cards.map(titleOf).join("、")}</li>)}</ul></div>}
        {shown.length === 0 && <p className="sub">還沒有來源。</p>}
        {shown.map((origin) => (
          <OriginBox key={origin.origin_id} projectId={projectId} origin={origin} view={view} busy={busy} failed={failed}
            onMark={mark} onSplit={split} onSearch={fromCard} onOverride={saveOverride} override={override} />
        ))}
      </div>

      {setAside.length > 0 && (
        <div className="card">
          <h2>放一旁 <small>{setAside.length} 頁，不算進出處</small></h2>
          <ul>{setAside.map((card) => <li key={card.card}>{card.title || hostOf(card.url)}：{card.aside}
            <button className="btn ghost" type="button" disabled={busy} onClick={() => takeBack(card.card)}>拿回來</button></li>)}</ul>
          <Refused failed={failed} at="aside" />
        </div>
      )}

      <div className="card">
        <h2>請 AI 幫忙</h2>
        <p className="how">你在協作合約准了「AI 可以找外部資料」，AI 才能想查詢、摘要來源、找互相矛盾的。沒准的時候，AI 只整理你貼的、指出還缺什麼、問你一題。AI 只能引用這裡有來源卡的；它不標採用或不用，不刪來源，不打分數。</p>
        {readable.length > 0 && <><p className="hint">給 AI 看哪幾張（最多 {MAX_AI_CARDS} 張）：</p>
          <ul className="check">{readable.map((card) => (
            <li key={card.card}><label><input type="checkbox" checked={chosen.includes(card.card)} disabled={!chosen.includes(card.card) && chosen.length >= MAX_AI_CARDS}
              onChange={() => setPicked(toggle(chosen, card.card))} /> {card.title || hostOf(card.url)}</label></li>
          ))}</ul></>}
        <div className="btns">
          <button className="btn" type="button" disabled={busy} onClick={() => turn("queries", {}, queries)}>幫我想查詢</button>
          <button className="btn" type="button" disabled={!chosen.length || busy} onClick={() => turn("summarise", { cards: chosen, ...(goOn ? { go_on: true } : {}) })}>摘要每個來源</button>
          <button className="btn" type="button" disabled={chosen.length < 2 || busy} onClick={() => turn("compare", { cards: chosen, ...(goOn ? { go_on: true } : {}) }, compare)}>找互相矛盾的</button>
          <button className="btn" type="button" disabled={busy} onClick={() => turn("organize", { cards: pastedCards.slice(0, MAX_AI_CARDS) })}>整理我貼的</button>
        </div>
        <Missing why={readable.length === 0 ? "還沒有可以給 AI 看的來源卡，所以「摘要」和「找矛盾」還不能按。" : firstMissing([!chosen.length, "先勾至少一張，才能請 AI 摘要。"], [chosen.length < 2, "要找互相矛盾的，至少勾兩張。"])} />
        <Refused failed={failed} at="ai" />
        {handback && (
          <div className="judge" role="status">
            <b>系統先停下來，還沒請 AI</b>
            <p>{handback.why}</p>
            <div className="btns"><button className="btn" type="button" disabled={busy} onClick={() => { setGoOn(true); turn(handback.action, { cards: chosen, go_on: true }, handback.action === "compare" ? compare : null); }}>照樣繼續</button></div>
          </div>
        )}
        {queries && (
          <div className="judge">
            <span className="tags"><span>{AUTHOR[queries.author]}</span></span>
            <ul>{queries.content.queries.map((query) => (
              <li key={`${query.lang}-${query.text}`}>{query.text}（{query.lang === "zh" ? "中文" : "英文"}・{angleName(query.angle)}）
                <button className="btn ghost" type="button" disabled={busy} onClick={() => search({ text: query.text, angles: [query.angle] }, [query.lang])}>用這句去找</button></li>
            ))}</ul>
            {queries.content.note && <p className="sub">{queries.content.note}</p>}
          </div>
        )}
        {compare && (
          <div className="judge">
            <span className="tags"><span>{AUTHOR[compare.author]}</span><span>兩邊並排，AI 不選邊，由你決定</span></span>
            {compare.content.conflicts.length === 0 && <p>AI 沒有找到互相矛盾的來源。</p>}
            {compare.content.conflicts.map((conflict) => (
              <div key={`${conflict.a.card}-${conflict.b.card}-${conflict.about}`}>
                <p><b>{conflict.about}</b></p>
                <div className="grid2">{[conflict.a, conflict.b].map((side) => <p key={side.card} className="read"><b>{titleOf(side.card)}</b>：「{side.quote}」</p>)}</div>
              </div>
            ))}
            {compare.content.missing.length > 0 && <><b>可能還缺哪一方的說法（要不要再找，由你決定）</b><ul>{compare.content.missing.map((item) => <li key={item.side}>{item.side}：{item.why}</li>)}</ul></>}
          </div>
        )}
        {[...says].reverse().map((doc) => (
          <div key={doc.doc_id} className="judge">
            <span className="tags"><span>{AUTHOR[doc.author]}</span></span>
            {(doc.content.items ?? []).map((item) => <p key={`${item.card}-${item.says}`}><b>{titleOf(item.card)}</b>：{item.says}{item.quote ? <span className="sub">（原文：「{item.quote}」）</span> : null}</p>)}
            {(doc.content.gaps ?? []).length > 0 && <><b>還缺什麼</b><ul>{doc.content.gaps!.map((gap) => <li key={gap}>{gap}</li>)}</ul></>}
            {doc.content.question && <p><b>一個問題：</b>{doc.content.question}</p>}
          </div>
        ))}
      </div>

    </BlockShell>
  );
}
