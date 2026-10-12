"use client";

// MAP 拆解 (contract card): one matter in six layers -- 事實、解釋、利益、結構、核心矛盾、介入. You pick a 拆法, write one line
// per layer first, put your cards in the layers, and keep claims of four kinds apart. The map is yours: the core conflict
// only you write, every save is a new version, two versions can be read side by side. What the AI offers (where a card
// goes, other readings, a method, which lines are claims) is its own and counts only when you take it.
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { AUTHOR, ai, docs, type Doc, type Notice } from "../../lib/blocks";
import { toolHref, toolLabel } from "../../lib/catalog";
import { humanError } from "../../lib/errors";
import {
  allItems, compareRows, confirmClaim, detailsMissing, editedBy, interestGroups, itemsOf, layerFlags, newId, pendingKeys, placeCard, sourceLine, takeAlternative,
  linkSources, thinFacts, unconfirmedLaw, unplacedCards, usablePlacements, withItems, withLiveSources,
  type Decision, type Item, type MapContent, type MapSpec, type Placement, type SenseCard, type Tool,
} from "../../lib/map";
import { formatTime } from "../../lib/time";
import { NONE, caseEvidence, originName, type Evidence, type Origin } from "../../lib/evidence";
import { BlockShell, Notices } from "./BlockShell";
import { rankTools } from "./mapMethods";
import { Example, Fold, Missing, Refused, type Failed } from "./PageParts";

type Intake = { question?: string; affected?: string[]; purpose?: string };
type Notes = { facets?: Array<{ facet: string; relevant?: boolean; defines_normal?: string; is_cause?: string }> };
type Alternatives = { items?: Array<{ about: string; view: string; check?: string }> };
type Picks = { picks?: Array<{ method_id: string; reason: string }> };
type Proposals = { proposals?: Array<{ item: string; kind: string }> };
type Review = { suggestion: string; version: number; key: string; decision: string };
type Form = { text: string; place: string; group: string };
const NO_FORM: Form = { text: "", place: "", group: "" };
const SHOWN_TOOLS = 12;

function Chips<T extends string>({ options, value, onPick, label }: { options: readonly T[]; value?: T | ""; onPick: (value: T) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => <button key={option} type="button" className={`chip${value === option ? " on" : ""}`} aria-pressed={value === option} onClick={() => onPick(option)}>{option}</button>)}
    </div>
  );
}

function ItemRow({ layer, item, claimed, kinds, origins, onSave, onDelete, onClaim, onLink }: {
  layer: string; item: Item; claimed: boolean; kinds: string[]; origins: Origin[]; onSave: (patch: { text: string; place?: string }) => void; onDelete: () => void; onClaim: (kind: string) => void;
  onLink: (cards: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [linking, setLinking] = useState(false);
  const [text, setText] = useState(item.text);
  const [place, setPlace] = useState(item.place ?? "");
  if (editing) {
    return (
      <div className="mcard now">
        <textarea aria-label="改這一條" value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} />
        {layer === "facts" && <input className="search" aria-label="在哪裡發生" placeholder="在哪裡發生" value={place} maxLength={200} onChange={(event) => setPlace(event.target.value)} />}
        <div className="btns">
          <button className="btn primary" type="button" disabled={!text.trim()} onClick={() => { onSave({ text: text.trim(), place: place.trim() }); setEditing(false); }}>存這一條</button>
          <button className="btn ghost" type="button" onClick={() => { setText(item.text); setPlace(item.place ?? ""); setEditing(false); }}>取消</button>
        </div>
      </div>
    );
  }
  const source = layer === "facts" ? sourceLine(item) : null;
  return (
    <div className="mcard">
      <span>{item.text}</span>
      <span className="tags"><span>{AUTHOR[item.by]}</span>{claimed && <span>已標成主張</span>}</span>
      {layer === "facts" && item.place && <span className="k">發生在：{item.place}</span>}
      {source && <span className={source.warn ? "need" : "k"}>{source.text}</span>}
      {layer === "facts" && (item.cards?.length ?? 0) > 0 && <span className="k">靠的來源：{origins.filter((origin) => origin.cards.some((card) => item.cards!.includes(card.card))).map((origin) => `${originName(origin)}${origin.pending ? "（還在分組）" : origin.counts ? "" : "（不算進數量）"}`).join("、") || "（連到的來源已經不在了）"}</span>}
      <div className="btns">
        <button className="btn ghost" type="button" onClick={() => setEditing(true)}>改</button>
        <button className="btn ghost" type="button" onClick={onDelete}>刪掉</button>
        {!claimed && <button className="btn ghost" type="button" aria-expanded={marking} onClick={() => setMarking(!marking)}>標成主張</button>}
        {layer === "facts" && origins.length > 0 && <button className="btn ghost" type="button" aria-expanded={linking} onClick={() => setLinking(!linking)}>連到找回來的來源</button>}
      </div>
      {marking && <Chips options={kinds} onPick={(kind) => { onClaim(kind); setMarking(false); }} label="這是哪一種主張" />}
      {linking && <p className="hint">出處不到兩個時，AI 會先不用這一條，等你說可以。</p>}
      {linking && (
        <div className="chips" role="group" aria-label="這一條靠哪些來源">
          {origins.map((origin) => {
            const ids = origin.cards.map((card) => card.card);
            const on = ids.some((id) => (item.cards ?? []).includes(id));
            const next = on ? (item.cards ?? []).filter((id) => !ids.includes(id)) : [...(item.cards ?? []), ...ids];
            return <button key={origin.origin_id} type="button" className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => onLink(next)}>{originName(origin)}{origin.pending ? "（還在分組）" : origin.counts ? "" : "（不算進數量）"}</button>;
          })}
        </div>
      )}
    </div>
  );
}

/** What picking a 拆法 does, in one sentence: it is written down on this version of the map; it fills nothing by itself. */
export const methodMeaning = (name: string | undefined) =>
  `選了「${name ?? "這個拆法"}」，這一版地圖就記下你是用它來拆的（之後兩版並排看得出來）。它不會自動填格子：想用它，就按「看這個工具怎麼用」做一遍，再把結果寫進下面六層，每層一句。`;

export function MapPage({ projectId }: { projectId: string }) {
  const [spec, setSpec] = useState<MapSpec | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [held, setHeld] = useState<Doc<MapContent> | null>(null);
  const [draft, setDraft] = useState<MapContent>({});
  const [cards, setCards] = useState<Doc<SenseCard>[]>([]);
  const [intake, setIntake] = useState<Intake>({});
  const [notes, setNotes] = useState<Notes>({});
  const [placeDoc, setPlaceDoc] = useState<Doc<{ placements?: Placement[] }> | null>(null);
  const [altDoc, setAltDoc] = useState<Doc<Alternatives> | null>(null);
  const [pickDoc, setPickDoc] = useState<Doc<Picks> | null>(null);
  const [claimDoc, setClaimDoc] = useState<Doc<Proposals> | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [versions, setVersions] = useState<Doc<MapContent>[]>([]);
  const [compare, setCompare] = useState<number[]>([]);
  const [decided, setDecided] = useState<Decision[]>([]);
  const [useThin, setUseThin] = useState<string[]>([]);
  const [adding, setAdding] = useState<Record<string, Form>>({});
  const [understanding, setUnderstanding] = useState<Record<string, string>>({});
  const [claimKind, setClaimKind] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [gapText, setGapText] = useState("");
  const [assumptionText, setAssumptionText] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<Failed>(null);
  const [allTools, setAllTools] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [evidence, setEvidence] = useState<Evidence>(NONE);

  const load = async (resetDraft: boolean) => {
    const list = <C,>(kind: string) => docs.list<C>(projectId, kind);
    const [maps, sense, intakes, notesDocs, places, alts, picks, props, reviewDocs, found] = await Promise.all([
      list<MapContent>("map.map"), list<SenseCard>("sense.card"), list<Intake>("assembler.intake"), list<Notes>("context.notes"),
      list<{ placements?: Placement[] }>("map.placement"), list<Alternatives>("map.alternatives"), list<Picks>("map.method_pick"), list<Proposals>("map.claim_proposal"), list<Review>("map.review"),
      caseEvidence(projectId),   // GATHER's origins: a fact links to them, the count is the server's
    ]);
    setEvidence(found);
    const latest = maps.at(-1) ?? null;
    setHeld(latest);
    if (resetDraft) setDraft(latest?.content ?? {});
    setCards(sense);
    setIntake(intakes.at(-1)?.content ?? {});
    setNotes(notesDocs.at(-1)?.content ?? {});
    setPlaceDoc(places.at(-1) ?? null); setAltDoc(alts.at(-1) ?? null); setPickDoc(picks.at(-1) ?? null); setClaimDoc(props.at(-1) ?? null);
    setReviews(reviewDocs.map((doc) => doc.content));
    const all = latest ? await docs.versions<MapContent>(projectId, "map.map", latest.doc_id) : [];
    setVersions(all);
    setCompare((chosen) => (chosen.length === 2 && chosen.every((n) => all.some((v) => v.version === n)) ? chosen : all.slice(-2).map((v) => v.version)));
    setTools(await apiFetch<Tool[]>(`/projects/${encodeURIComponent(projectId)}/map/methods`));
  };
  useEffect(() => {
    apiFetch<MapSpec>("/blocks/map/spec").then(setSpec)
      .then(() => load(true)).then(() => setLoaded(true)).catch((reason) => setError(humanError(reason)));
  }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(draft) !== JSON.stringify(held?.content ?? {});
  const layerKeys = useMemo(() => spec?.layers.map((layer) => layer.key) ?? [], [spec]);
  const set = (patch: Partial<MapContent>) => setDraft((current) => ({ ...current, ...patch }));
  const setLayer = (layer: string, items: Item[]) => setDraft((current) => withItems(current, layer, items));
  const decide = (suggestion: Doc<unknown>, key: string, decision: Decision["decision"]) =>
    setDecided((found) => [...found.filter((entry) => !(entry.suggestion.doc_id === suggestion.doc_id && entry.suggestion.version === suggestion.version && entry.key === key)), { suggestion: { doc_id: suggestion.doc_id, version: suggestion.version }, key, decision }]);

  /** Save the draft as the next version, then keep what was decided about the AI's offers. Returns what is saved now. */
  const persist = async (): Promise<Doc<MapContent> | null> => {
    let saved = held;
    if (dirty) {
      const now = await caseEvidence(projectId);   // the count at the moment of saving (an origin may have been marked 不用 since the page opened)
      setEvidence(now);
      const content = withLiveSources(draft, now);
      const result = held ? await docs.update(projectId, "map.map", held, content) : await docs.create(projectId, "map.map", content);
      setNotices(result.notices);
      saved = result;
    }
    for (const entry of decided) await docs.create(projectId, "map.review", { suggestion: entry.suggestion.doc_id, version: entry.suggestion.version, key: entry.key, decision: entry.decision });
    setDecided([]);
    await load(true);
    return saved;
  };
  // `at`: the button group that sent it; its refusal is shown there (PageParts.Refused)
  const act = async (at: string, work: () => Promise<void>) => {
    setFailed(null); setBusy(true);
    try { await work(); setRefresh((count) => count + 1); } catch (reason) { setFailed({ at, text: humanError(reason) }); } finally { setBusy(false); }
  };
  const save = () => act("save", async () => { await persist(); });
  // The AI reads the saved map, not the page: so what you wrote is saved as a version first.
  const askAi = (name: string, over: Doc<any> | null, context: Record<string, unknown> = {}) => act(name, async () => {
    if (dirty || decided.length) await persist();
    const turn = await ai<any>(projectId, "MAP", name, context, over);
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
    await load(false);
  });

  if (!spec || !loaded) return <BlockShell projectId={projectId} code="MAP"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;

  const kinds = spec.claim_kinds.map((entry) => entry.kind);
  const layerName = Object.fromEntries(spec.layers.map((layer) => [layer.key, layer.name]));
  const flags = layerFlags(draft, layerKeys);
  const thin = thinFacts(draft, evidence);
  const toolName = (id: string) => toolLabel(Object.fromEntries(tools.map((tool) => [tool.method_id, tool.name])), id);
  const unplaced = unplacedCards(cards, draft);
  const placements = usablePlacements(placeDoc?.content.placements, cards, draft, layerKeys);
  const pendingPlacements = placeDoc ? pendingKeys(placements.map((item) => item.card), placeDoc, reviews, decided) : [];
  const alternatives = altDoc?.content.items ?? [];
  const pendingAlternatives = pendingKeys(alternatives.map((_, index) => `a${index}`), altDoc, reviews, decided);
  const picks = (pickDoc?.content.picks ?? []).filter((pick) => tools.some((tool) => tool.method_id === pick.method_id && !tool.used && tool.method_id !== draft.method_id));
  const pendingPicks = pickDoc ? pendingKeys(picks.map((pick) => pick.method_id), pickDoc, reviews, decided) : [];
  const proposals = (claimDoc?.content.proposals ?? []).filter((entry) => allItems(draft).some((item) => item.id === entry.item) && !(draft.claims ?? []).some((claim) => claim.item === entry.item && claim.kind === entry.kind));
  const pendingProposals = pendingKeys(proposals.map((entry) => entry.item), claimDoc, reviews, decided);
  const matches = tools.filter((tool) => !tool.used && tool.method_id !== draft.method_id && (!search.trim() || `${tool.name} ${tool.family_zh} ${tool.method_id}`.toLowerCase().includes(search.trim().toLowerCase())));
  const ranked = rankTools(matches, intake.purpose);
  const runs: Array<[string, typeof matches]> = [[intake.purpose ? `適合「${intake.purpose}」的` : "常用的", ranked.fit], ["其他拆法", ranked.rest], ["研究用的方法（要資料和統計）", ranked.research]];
  let budget = allTools || search.trim() ? matches.length : SHOWN_TOOLS;
  const shownRuns = runs.map(([name, list]) => { const taken = list.slice(0, Math.max(budget, 0)); budget -= taken.length; return [name, taken] as const; }).filter(([, list]) => list.length > 0);
  const hiddenTools = matches.length - shownRuns.reduce((sum, [, list]) => sum + list.length, 0);
  const relevantFacets = (notes.facets ?? []).filter((facet) => facet.relevant);
  const claimedItems = new Set((draft.claims ?? []).map((claim) => claim.item));
  const affected = intake.affected ?? [];
  const contextHref = (layer?: string) => `/projects/${encodeURIComponent(projectId)}/context${layer ? `#layer-${layer}` : ""}`;

  const setForm = (layer: string, patch: Partial<Form>) => setAdding((forms) => ({ ...forms, [layer]: { ...(forms[layer] ?? NO_FORM), ...patch } }));
  const addItem = (layer: string) => {
    const form = adding[layer] ?? NO_FORM;
    if (!form.text.trim()) return;
    const item: Item = { id: newId(), text: form.text.trim(), by: "user", ...(layer === "facts" ? { sources: 0, self_said: true, ...(form.place.trim() ? { place: form.place.trim() } : {}) } : {}), ...(layer === "interests" && form.group.trim() ? { group: form.group.trim() } : {}) };
    setLayer(layer, [...itemsOf(draft, layer), item]);
    setAdding((forms) => ({ ...forms, [layer]: NO_FORM }));
  };
  const saveItem = (layer: string, item: Item, patch: { text: string; place?: string }) => {
    setDraft((current) => ({
      ...withItems(current, layer, itemsOf(current, layer).map((found) => (found.id === item.id ? { ...found, text: patch.text, by: patch.text === found.text ? found.by : editedBy(found.by), ...(layer === "facts" ? { place: patch.place || undefined } : {}) } : found))),
      claims: (current.claims ?? []).map((claim) => (claim.item === item.id ? { ...claim, text: patch.text } : claim)),
    }));
  };
  const removeItem = (layer: string, item: Item) => setDraft((current) => ({ ...withItems(current, layer, itemsOf(current, layer).filter((found) => found.id !== item.id)), claims: (current.claims ?? []).filter((claim) => claim.item !== item.id) }));
  const putCard = (doc: Doc<SenseCard>, layer: string) => {
    if (placeDoc) decide(placeDoc, doc.doc_id, placements.some((item) => item.card === doc.doc_id && item.layer === layer) ? "採用" : "不採用");
    setDraft((current) => placeCard(current, layer, doc));
  };
  const setClaimDetail = (id: string, key: string, value: string) => set({ claims: (draft.claims ?? []).map((claim) => (claim.id === id ? { ...claim, details: { ...claim.details, [key]: value } } : claim)) });
  const answer = (q: number, patch: { answer?: string; note?: string }) => {
    const rest = (draft.unwinnable_answers ?? []).filter((entry) => entry.q !== q);
    const current = (draft.unwinnable_answers ?? []).find((entry) => entry.q === q) ?? { q, answer: "不確定" };
    set({ unwinnable_answers: [...rest, { ...current, ...patch }].sort((a, b) => a.q - b.q) });
  };
  const chooseMethod = (id: string, name: string) => set({ method_id: id, method: name, method_version: tools.find((tool) => tool.method_id === id)?.version || undefined });
  const picked = draft.method_id ? tools.find((tool) => tool.method_id === draft.method_id) : null;
  const stateOf = (a: number) => versions.find((v) => v.version === a);
  const shown = compare.map(stateOf).filter((v): v is Doc<MapContent> => Boolean(v)).sort((a, b) => a.version - b.version);
  const guarded = notices.filter((notice): notice is Extract<Notice, { type: "guardrail" }> => notice.type === "guardrail");

  const aiNote = <p className="sub">請 AI 之前，系統會先把你現在寫的存成一版。AI 能做什麼，在<Link href={`/projects/${encodeURIComponent(projectId)}/contract`}>協作合約</Link>決定。</p>;
  const unwinnable = (
    <Fold card id="unwinnable" title={`解不了的局？${spec.unwinnable.questions.length} 個檢查題`} filled={(draft.unwinnable_answers ?? []).length}>
      <p className="how">這個局在現有條件下，解得了嗎？有些局是結構決定的，再怎麼加碼都贏不了。先辨認出來，才不會把結構問題當成自己不夠努力。這些題要和「結構」「核心矛盾」兩層一起看。{spec.unwinnable.source}</p>
      {spec.unwinnable.questions.map((entry) => {
        const current = (draft.unwinnable_answers ?? []).find((item) => item.q === entry.q);
        return (
          <div key={entry.q} className="field">
            <label htmlFor={`uw-${entry.q}`}>{entry.q + 1}. {entry.question}</label>
            <Example text={entry.example} />
            <Chips options={spec.unwinnable.answers} value={current?.answer} onPick={(value) => answer(entry.q, { answer: value })} label={`第 ${entry.q + 1} 題的回答`} />
            <input id={`uw-${entry.q}`} className="search" placeholder="想補一句（選填）" value={current?.note ?? ""} maxLength={500} onChange={(event) => answer(entry.q, { note: event.target.value })} />
          </div>
        );
      })}
      <p className="sub">Farrell 直接講的兩個「注定失敗」的原因：{spec.unwinnable.reasons.join("；")}。{spec.unwinnable.reasons_reading}</p>
      <label><input type="checkbox" checked={Boolean(draft.unwinnable)} onChange={(event) => set({ unwinnable: event.target.checked })} /> 我判斷這是解不了的局（只有你能標）</label>
    </Fold>
  );

  return (
    <BlockShell projectId={projectId} code="MAP" refresh={refresh}>
      <Notices notices={notices} />
      {guarded.length > 0 && <div className="card accent"><p className="mt0">你寫的碰到：{guarded.map((notice) => notice.category).join("、")}。這個案子加了護欄：AI 說到事實一定附來源、會提醒你可以找專業的人、不能反悔的決定會請你先等一下。</p></div>}

      <div className="card cta">
        <h2>選一個拆法（選填）</h2>
        <p className="how">一個拆法就是一個工具。不管用哪一個，結果都放進下面同一張六層地圖。一個拆法沒看清楚，就換一個再拆一次。</p>
        {draft.method_id
          ? <>
            <p><b>{draft.method}</b>{picked ? `（${picked.family_zh}）` : ""}・<Link href={toolHref(draft.method_id, projectId)}>看這個工具怎麼用</Link>
              <button className="btn ghost" type="button" onClick={() => set({ method: undefined, method_id: undefined, method_version: undefined })}>不用這個</button></p>
            <p className="hint">{methodMeaning(draft.method)}</p>
          </>
          : <p className="sub">還沒選。不選也可以直接寫下面的六層。</p>}
        <Fold title={`看可以選的拆法（${matches.length} 個）`}>
          <p className="hint">{intake.purpose ? `先列適合「${intake.purpose}」的。` : ""}研究用的方法要資料和統計，排在最後。用找的，每一個都找得到。</p>
          <input className="search" aria-label="找拆法" placeholder="找拆法：寫一個字，例如「冰山」「利害」" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="chips mt8" role="group" aria-label="可以選的拆法">
            {shownRuns.map(([name, list]) => (
              <React.Fragment key={name}>
                <span className="sub">{name}：</span>
                {list.map((tool) => <button key={tool.method_id} type="button" className="chip" onClick={() => chooseMethod(tool.method_id, tool.name)}>{tool.name}</button>)}
              </React.Fragment>
            ))}
            {matches.length === 0 && <span className="sub">沒有符合的。</span>}
          </div>
          {hiddenTools > 0 && <div className="btns"><button className="btn ghost" type="button" onClick={() => setAllTools(true)}>還有 {hiddenTools} 個，全部列出來</button></div>}
          {tools.some((tool) => tool.used) && <p className="sub">這個案子已經用過：{tools.filter((tool) => tool.used).map((tool) => tool.name).join("、")}。系統只推還沒用過的。</p>}
          <div className="btns mt8"><button className="btn" type="button" disabled={busy} onClick={() => askAi("method", pickDoc, { used: tools.filter((tool) => tool.used).map((tool) => tool.method_id) })}>{busy ? "想一想…" : "請 AI 推薦拆法"}</button></div>
          {aiNote}
        </Fold>
        <Refused failed={failed} at="method" />
        {pendingPicks.length > 0 && (
          <div className="judge">
            <span className="tags"><span>{AUTHOR.ai}</span></span>
            {picks.filter((pick) => pendingPicks.includes(pick.method_id)).map((pick) => (
              <div key={pick.method_id} className="mt8"><b>{toolName(pick.method_id)}</b>：{pick.reason}
                <div className="btns"><button className="btn primary" type="button" onClick={() => { chooseMethod(pick.method_id, toolName(pick.method_id)); decide(pickDoc!, pick.method_id, "採用"); }}>用這個</button>
                  <button className="btn ghost" type="button" onClick={() => decide(pickDoc!, pick.method_id, "不採用")}>不用</button></div></div>
            ))}
          </div>
        )}
      </div>

      {cards.length > 0 && (
        <Fold card title={`把你外化的卡放進六層（${unplaced.length} 張還沒放）`} open={pendingPlacements.length > 0}>
          <p className="how">放進來就是複製一份：之後在「外化」改或刪這張卡，地圖裡的不會跟著變。AI 可以建議每張卡放哪一層，你確認了才算。</p>
          <div className="btns"><button className="btn" type="button" disabled={busy || unplaced.length === 0} onClick={() => askAi("place", placeDoc)}>{busy ? "整理中…" : "請 AI 建議每張卡放哪一層"}</button></div>
          <Missing why={unplaced.length === 0 && "每張卡都已經放進某一層了。"} />
          <Refused failed={failed} at="place" />
          {aiNote}
          <div className="mcards">
            {unplaced.map((doc) => {
              const suggestion = placeDoc && pendingPlacements.includes(doc.doc_id) ? placements.find((item) => item.card === doc.doc_id) : undefined;
              return (
                <div key={doc.doc_id} className="mcard">
                  <span className="k">{doc.content.category}</span>
                  <span>{doc.content.text}</span>
                  {suggestion && <span className="tags"><span>{AUTHOR.ai}建議：{layerName[suggestion.layer]}層</span></span>}
                  <div className="chips" role="group" aria-label="放進哪一層">
                    {spec.layers.map((layer) => <button key={layer.key} type="button" className={`chip${suggestion?.layer === layer.key ? " on" : ""}`} onClick={() => putCard(doc, layer.key)}>{layer.name}</button>)}
                  </div>
                  {suggestion && <button className="btn ghost" type="button" onClick={() => decide(placeDoc!, doc.doc_id, "不採用")}>不照 AI 的建議</button>}
                </div>
              );
            })}
          </div>
        </Fold>
      )}

      {spec.layers.map((layer, index) => {
        const skipped = (draft.skipped ?? []).includes(layer.key);
        const items = itemsOf(draft, layer.key);
        const form = adding[layer.key] ?? NO_FORM;
        const row = (item: Item) => (
          <ItemRow key={item.id} layer={layer.key} item={item.cards?.length ? linkSources(item, item.cards, evidence) : item} claimed={claimedItems.has(item.id)} kinds={kinds}
            origins={evidence.origins.filter((origin) => !origin.pending || origin.cards.some((card) => (item.cards ?? []).includes(card.card)))}
            onSave={(patch) => saveItem(layer.key, item, patch)} onDelete={() => removeItem(layer.key, item)}
            onLink={(linked) => setDraft((current) => withItems(current, "facts", itemsOf(current, "facts").map((found) => (found.id === item.id ? linkSources(found, linked, evidence) : found))))}
            onClaim={(kind) => setDraft((current) => confirmClaim(current, item.id, kind, "user"))} />
        );
        return (
          <React.Fragment key={layer.key}>
            {layer.key === "core" && unwinnable}
            <div className="station" id={`layer-${layer.key}`}>
              <h3>{index + 1} {layer.name}：{layer.question}</h3>
              <p className="why">這一層要交出：{layer.output}</p>
              <div className="tags">
                {flags.empty.includes(layer.key) && <span>這一層是空的</span>}
                {flags.thinnest.includes(layer.key) && <span>資料最少的一層</span>}
                {skipped && <span>你跳過了這一層</span>}
              </div>
              <p className="sub"><Link href={contextHref(layer.key)}>打開規範與脈絡看這一層 →</Link></p>
              {skipped ? <div className="btns"><button className="btn ghost" type="button" onClick={() => set({ skipped: (draft.skipped ?? []).filter((key) => key !== layer.key) })}>回來寫這一層</button></div> : (
                <>
                  <div className="field">
                    <label htmlFor={`one-${layer.key}`}>這一層，你先寫一句</label>
                    <input id={`one-${layer.key}`} className="search" value={draft.one_lines?.[layer.key] ?? ""} maxLength={500} onChange={(event) => set({ one_lines: { ...draft.one_lines, [layer.key]: event.target.value } })} />
                  </div>
                  {layer.key === "facts" && thin.length > 0 && (
                    <div className="card accent">
                      <p className="mt0">這幾條是從外面找來的，獨立出處不到兩個，AI 沒有用它們：</p>
                      <ul>{thin.map((item) => <li key={item.id}>{item.text}（{sourceLine(item).text}）{useThin.includes(item.id)
                        ? <button className="btn ghost" type="button" onClick={() => setUseThin(useThin.filter((id) => id !== item.id))}>不讓 AI 看</button>
                        : <button className="btn ghost" type="button" onClick={() => setUseThin([...useThin, item.id])}>讓 AI 也看這一條</button>}</li>)}</ul>
                    </div>
                  )}
                  <Fold title={`${layer.name}的細項：${[items.length ? `已寫的 ${items.length} 條` : "", "加一條", layer.key === "structure" || layer.key === "core" ? "脈絡面向" : "", layer.key === "core" ? "你認為的核心矛盾" : ""].filter(Boolean).join("、")}`}>
                  {(layer.key === "structure" || layer.key === "core") && (
                    <div className="filled">
                      <span className="lab">拿每個有關的脈絡面向對一次：地理、地域、制度、文化本身可能就是原因，不只是背景</span>
                      {relevantFacets.length === 0
                        ? <p className="sub">還沒勾有關的面向。<Link href={contextHref(layer.key)}>去規範與脈絡勾</Link></p>
                        : relevantFacets.map((facet) => <p key={facet.facet} className="mt4"><b>{facet.facet}</b>：界定了什麼算正常：{facet.defines_normal || "還沒寫"}；是不是原因：{facet.is_cause || "還沒寫"}</p>)}
                    </div>
                  )}
                  {layer.key === "interests" ? (
                    <>
                      {interestGroups(items, affected).map(({ group, items: groupItems }) => (
                        <div key={group || "none"}><h3 className="fam">{group || "沒有指定是誰"}</h3>{groupItems.length === 0 ? <p className="sub">這一群還沒寫。</p> : <div className="mcards">{groupItems.map(row)}</div>}</div>
                      ))}
                    </>
                  ) : items.length > 0 && <div className="mcards">{items.map(row)}</div>}
                  <div className="field">
                    <label htmlFor={`add-${layer.key}`}>加一條</label>
                    <textarea id={`add-${layer.key}`} value={form.text} maxLength={2000} onChange={(event) => setForm(layer.key, { text: event.target.value })} />
                    {layer.key === "facts" && <input className="search" aria-label="在哪裡發生" placeholder="在哪裡發生（選填）" value={form.place} maxLength={200} onChange={(event) => setForm(layer.key, { place: event.target.value })} />}
                    {layer.key === "interests" && (
                      <>
                        {affected.length > 0 && <div className="chips" role="group" aria-label="這是誰的利益">{affected.map((group) => <button key={group} type="button" className={`chip${form.group === group ? " on" : ""}`} aria-pressed={form.group === group} onClick={() => setForm(layer.key, { group: form.group === group ? "" : group })}>{group}</button>)}</div>}
                        <input className="search" aria-label="這是誰的利益" placeholder="這是誰的（選填）" value={form.group} maxLength={100} onChange={(event) => setForm(layer.key, { group: event.target.value })} />
                      </>
                    )}
                    <div className="btns"><button className="btn primary" type="button" disabled={!form.text.trim()} onClick={() => addItem(layer.key)}>加進{layer.name}</button>
                      <button className="btn ghost" type="button" onClick={() => set({ skipped: [...(draft.skipped ?? []), layer.key] })}>跳過這一層</button></div>
                  </div>
                  {layer.key === "facts" && <p className="hint">事實只寫看得到、記得下來的事，例如「他第三次改條件」。「他沒把我當夥伴」是解釋，寫到解釋那一層。</p>}
                  {layer.key === "core" && (
                    <div className="field">
                      <label htmlFor="core-conflict">你認為的核心矛盾</label>
                      <p className="hint">只有你寫。AI 不替你決定。</p>
                      <textarea id="core-conflict" value={draft.core_conflict ?? ""} maxLength={2000} onChange={(event) => set({ core_conflict: event.target.value })} />
                    </div>
                  )}
                  </Fold>
                </>
              )}
            </div>
          </React.Fragment>
        );
      })}

      <Fold card title="別的解釋：同一件事的其他理解" open={pendingAlternatives.length > 0}>
        <p className="how">同一件事，可以有別的理解。AI 可以提，放進「解釋」那一層是你決定。</p>
        <div className="btns"><button className="btn" type="button" disabled={busy} onClick={() => askAi("alternatives", altDoc, { use_thin: useThin })}>{busy ? "想一想…" : "請 AI 提別的解釋"}</button></div>
        <Refused failed={failed} at="alternatives" />
        {aiNote}
        {pendingAlternatives.map((key) => {
          const entry = alternatives[Number(key.slice(1))];
          const about = allItems(draft).find((item) => item.id === entry.about);
          return (
            <div key={key} className="judge">
              <span className="tags"><span>{AUTHOR.ai}</span></span>
              {about && <p className="sub">關於：{about.text}</p>}
              <p>{entry.view}</p>
              {entry.check && <p className="sub">要確認：{entry.check}</p>}
              <div className="btns"><button className="btn primary" type="button" onClick={() => { setDraft((current) => takeAlternative(current, entry)); decide(altDoc!, key, "採用"); }}>放進解釋</button>
                <button className="btn ghost" type="button" onClick={() => decide(altDoc!, key, "不採用")}>不用</button></div>
            </div>
          );
        })}
      </Fold>

      <Fold card title="主張：事實、法律、價值、文化宗教分開" filled={(draft.claims ?? []).length} open={pendingProposals.length > 0}>
        <p className="how">一條一條看，哪些是主張、各是哪一種。四種要分開：事實要查證，法律要寫法域、時效、來源，價值要寫怎麼權衡，文化和宗教先寫你自己怎麼理解。你確認了才算。也可以在上面每一條按「標成主張」。</p>
        <div className="btns"><button className="btn" type="button" disabled={busy || allItems(draft).length === 0} onClick={() => askAi("claims", claimDoc, { use_thin: useThin })}>{busy ? "想一想…" : "請 AI 看哪些是主張"}</button></div>
        <Missing why={allItems(draft).length === 0 && "地圖上還沒有任何一條。先在六層裡加一條，AI 才有東西可以看。"} />
        <Refused failed={failed} at="claims" />
        {aiNote}
        {proposals.filter((entry) => pendingProposals.includes(entry.item)).map((entry) => {
          const item = allItems(draft).find((found) => found.id === entry.item)!;
          const kind = claimKind[entry.item] ?? entry.kind;
          const own = understanding[entry.item] ?? "";
          const needsOwn = kind === "文化宗教";
          return (
            <div key={entry.item} className="judge">
              <span className="tags"><span>{AUTHOR.ai}</span></span>
              <p>{item.text}</p>
              <p className="sub">AI 認為這是哪一種：</p>
              <Chips options={kinds} value={kind} onPick={(picked) => setClaimKind({ ...claimKind, [entry.item]: picked })} label="這是哪一種主張" />
              {needsOwn && (
                <div className="field">
                  <label htmlFor={`own-${entry.item}`}>你自己怎麼理解這一條？</label>
                  <p className="hint">傳統內部有多種詮釋。你的理解放在前面，AI 不替你定義。</p>
                  <textarea id={`own-${entry.item}`} value={own} maxLength={1000} onChange={(event) => setUnderstanding({ ...understanding, [entry.item]: event.target.value })} />
                </div>
              )}
              <div className="btns">
                <button className="btn primary" type="button" disabled={needsOwn && !own.trim()}
                  onClick={() => { setDraft((current) => confirmClaim(current, entry.item, kind, kind === entry.kind ? "ai" : "joint", needsOwn ? { own_understanding: own.trim() } : undefined)); decide(claimDoc!, entry.item, "採用"); }}>確認成主張</button>
                <button className="btn ghost" type="button" onClick={() => decide(claimDoc!, entry.item, "不採用")}>不是主張</button>
              </div>
            </div>
          );
        })}
        <div className="mcards">
          {spec.claim_kinds.map((entry) => (
            <div key={entry.kind} className="mcard">
              <b>{entry.kind}</b>
              <span className="k">{entry.needs}</span>
              {(draft.claims ?? []).filter((claim) => claim.kind === entry.kind).map((claim) => (
                <div key={claim.id} className="filled">
                  <span>{claim.text}</span>
                  <span className="tags"><span>{AUTHOR[claim.by]}</span>{unconfirmedLaw(claim, spec) && <span>未確認</span>}</span>
                  {entry.details.map((detail) => (
                    <div key={detail.key}>
                      <label className="lab" htmlFor={`${claim.id}-${detail.key}`}>{detail.label}</label>
                      <input id={`${claim.id}-${detail.key}`} className="search" value={claim.details?.[detail.key] ?? ""} maxLength={1000} onChange={(event) => setClaimDetail(claim.id, detail.key, event.target.value)} />
                    </div>
                  ))}
                  {detailsMissing(claim, spec).length > 0 && entry.kind !== "法律" && <span className="k">還沒寫：{detailsMissing(claim, spec).join("、")}</span>}
                  <button className="btn ghost" type="button" onClick={() => set({ claims: (draft.claims ?? []).filter((found) => found.id !== claim.id) })}>拿掉這條主張</button>
                </div>
              ))}
              {(draft.claims ?? []).every((claim) => claim.kind !== entry.kind) && <span className="k">還沒有。</span>}
            </div>
          ))}
        </div>
        <p className="sub">這四種分欄只是把主張分開。每一條在哪個脈絡下成立，到<Link href={contextHref()}>規範與脈絡</Link>看。</p>
      </Fold>

      <Fold card title="還缺什麼、你在假設什麼" filled={(draft.gaps ?? []).length + (draft.assumptions ?? []).length}>
        <div className="field">
          <b>資訊缺口</b>
          <p className="hint">還缺的資料。寫下來之後，系統會提議去蒐集來源。</p>
          <ul className="check">{(draft.gaps ?? []).map((gap, position) => <li key={`${gap}-${position}`}>{gap} <button className="btn ghost" type="button" onClick={() => set({ gaps: (draft.gaps ?? []).filter((_, at) => at !== position) })}>拿掉</button></li>)}</ul>
          <input className="search" aria-label="加一個資訊缺口" placeholder="例如：合約原文" value={gapText} maxLength={500} onChange={(event) => setGapText(event.target.value)} />
          <div className="btns"><button className="btn" type="button" disabled={!gapText.trim()} onClick={() => { set({ gaps: [...(draft.gaps ?? []), gapText.trim()] }); setGapText(""); }}>加進缺口</button></div>
        </div>
        <div className="field">
          <b>假設</b>
          <p className="hint">你在假設而還沒確認的事。每條標是誰提的。</p>
          <ul className="check">{(draft.assumptions ?? []).map((entry, position) => <li key={`${entry.text}-${position}`}>{entry.text}<span className="tags"><span>{AUTHOR[entry.by]}</span></span> <button className="btn ghost" type="button" onClick={() => set({ assumptions: (draft.assumptions ?? []).filter((_, at) => at !== position) })}>拿掉</button></li>)}</ul>
          <input className="search" aria-label="加一個假設" placeholder="例如：他不是故意拖延" value={assumptionText} maxLength={500} onChange={(event) => setAssumptionText(event.target.value)} />
          <div className="btns"><button className="btn" type="button" disabled={!assumptionText.trim()} onClick={() => { set({ assumptions: [...(draft.assumptions ?? []), { text: assumptionText.trim(), by: "user" }] }); setAssumptionText(""); }}>加進假設</button></div>
        </div>
      </Fold>

      <div className="card cta">
        <h2>存成新的一版</h2>
        <p className="how">每存一次就是一版，舊的不會被蓋掉。{held ? `現在是第 ${held.version} 版。` : "還沒存過。"}</p>
        <div className="btns">
          <button className="btn primary big" type="button" disabled={busy || (!dirty && decided.length === 0)} onClick={save}>{busy ? "存檔中…" : held ? "存成新的一版" : "存第一版"}</button>
          {dirty && <span className="warn">有還沒存的改動</span>}
        </div>
        <Missing why={!busy && !dirty && decided.length === 0 && "還沒有改動。改了任何一格，才能存成新的一版。"} />
        <Refused failed={failed} at="save" />
      </div>

      {versions.length > 1 && (
        <div className="card">
          <h2>兩版並排看</h2>
          <p className="how">選兩版。你換拆法再拆一次，就在這裡和上一次比。</p>
          <div className="chips" role="group" aria-label="選兩版來比">
            {versions.map((version) => (
              <button key={version.version} type="button" className={`chip${compare.includes(version.version) ? " on" : ""}`} aria-pressed={compare.includes(version.version)}
                onClick={() => setCompare((chosen) => (chosen.includes(version.version) ? chosen.filter((n) => n !== version.version) : [...chosen, version.version].slice(-2)))}>
                第 {version.version} 版・{formatTime(version.at)}{version.content.method ? `・${version.content.method}` : ""}
              </button>
            ))}
          </div>
          {shown.length === 2 && (
            <div className="scroll-x">
              <table>
                <thead><tr><th>&nbsp;</th>{shown.map((version) => <th key={version.version}>第 {version.version} 版</th>)}</tr></thead>
                <tbody>
                  {compareRows(shown[0].content, shown[1].content, spec).map((row) => (
                    <tr key={row.label}><td>{row.label}</td>{[row.a, row.b].map((lines, column) => <td key={column}>{lines.length ? lines.map((line, at) => <div key={at}>{line}</div>) : "—"}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p className="sub">地圖會交給共思考去發散和反證。不想寫完也可以先往下走，這一塊隨時可以回來。</p>
    </BlockShell>
  );
}
