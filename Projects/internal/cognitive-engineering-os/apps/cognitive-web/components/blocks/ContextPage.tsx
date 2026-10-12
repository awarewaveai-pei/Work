"use client";

// 規範與脈絡 (contract card): the lens across MAP's six layers -- the world this matter sits in. You tick the facets that
// matter and answer two questions for each, name the places whose law applies, and walk four checks on the norms at work.
// No country, culture or legal order is assumed. The AI only points at facets not looked at yet; the notes are yours.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { AUTHOR, docs, type AiTurn, type Doc, type Notice } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { facetState, openPointers, placesOf, removeFacet, setFacet, toggled, type ContextSpec, type Notes } from "../../lib/context";
import type { MapSpec } from "../../lib/map";
import { BlockShell, Notices } from "./BlockShell";
import { Fold, Missing, Refused, type Failed } from "./PageParts";

type Intake = { question?: string; package?: string; happened_in?: string[]; you_are_in?: string; others_in?: string[] };
type Pointers = { facets?: Array<{ facet: string; why: string }> };
/** GET /projects/{id}/context/claims: the case's claims once, MAP's and VERIFY's together (`from` = which page it was written on); `missing` = the 法律 details no list has written. */
type CaseClaims = { claims: Array<{ id: string; text: string; kind: string; from: string; missing: string[] }>; counts: Record<string, number> };
const KINDS = ["事實", "法律", "價值", "文化宗教"];

export function ContextPage({ projectId }: { projectId: string }) {
  const [spec, setSpec] = useState<ContextSpec | null>(null);
  const [mapSpec, setMapSpec] = useState<MapSpec | null>(null);
  const [held, setHeld] = useState<Doc<Notes> | null>(null);
  const [draft, setDraft] = useState<Notes>({});
  const [intake, setIntake] = useState<Intake>({});
  const [caseClaims, setCaseClaims] = useState<CaseClaims | null>(null);   // null = could not be read
  const [pointers, setPointers] = useState<Doc<Pointers> | null>(null);
  const [custom, setCustom] = useState({ name: "", definition: "" });
  const [place, setPlace] = useState("");
  const [fromLayer, setFromLayer] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<Failed>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const load = async (resetDraft: boolean) => {
    const [notes, intakes, claimed, points] = await Promise.all([
      docs.list<Notes>(projectId, "context.notes"), docs.list<Intake>(projectId, "assembler.intake"),
      apiFetch<CaseClaims>(`/projects/${encodeURIComponent(projectId)}/context/claims`).catch(() => null), docs.list<Pointers>(projectId, "context.pointers"),
    ]);
    const latest = notes.at(-1) ?? null;
    setHeld(latest);
    if (resetDraft) setDraft(latest?.content ?? {});
    setIntake(intakes.at(-1)?.content ?? {});
    setCaseClaims(claimed);
    setPointers(points.at(-1) ?? null);
  };
  useEffect(() => {
    Promise.all([apiFetch<ContextSpec>("/blocks/context/spec"), apiFetch<MapSpec>("/blocks/map/spec")])
      .then(([context, mapping]) => { setSpec(context); setMapSpec(mapping); })
      .then(() => load(true)).then(() => setLoaded(true)).catch((reason) => setError(humanError(reason)));
    setFromLayer(window.location.hash.startsWith("#layer-") ? window.location.hash.slice("#layer-".length) : "");
  }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(draft) !== JSON.stringify(held?.content ?? {});
  const persist = async () => {
    const content: Notes = { ...draft, facets_version: spec!.version };
    const saved = held ? await docs.update(projectId, "context.notes", held, content) : await docs.create(projectId, "context.notes", content);
    setNotices(saved.notices);
    await load(true);
  };
  // `at`: the button group that sent it; its refusal is shown there (PageParts.Refused)
  const act = async (at: string, work: () => Promise<void>) => {
    setFailed(null); setBusy(true);
    try { await work(); setRefresh((count) => count + 1); } catch (reason) { setFailed({ at, text: humanError(reason) }); } finally { setBusy(false); }
  };
  const point = () => act("point", async () => {
    if (dirty) await persist();
    const turn = await apiFetch<AiTurn<Pointers>>(`/projects/${encodeURIComponent(projectId)}/ai/CONTEXT/point_facets`, { method: "POST", body: JSON.stringify({ context: {}, ...(pointers ? { doc_id: pointers.doc_id, base_version: pointers.version } : {}) }) });
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
    await load(false);
  });

  if (!spec || !mapSpec || !loaded) return <BlockShell projectId={projectId} title="規範與脈絡"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;

  const set = (patch: Partial<Notes>) => setDraft((current) => ({ ...current, ...patch }));
  const facetEntry = (name: string) => draft.facets?.find((item) => item.facet === name);
  const customFacets = (draft.facets ?? []).filter((item) => item.custom);
  const rows = [...spec.facets.map((item) => ({ ...item, custom: false })), ...customFacets.map((item) => ({ facet: item.facet, definition: item.definition ?? "", custom: true }))];
  const open = openPointers(pointers?.content.facets, draft);
  const places = placesOf(intake);
  const legal = (caseClaims?.claims ?? []).filter((claim) => claim.kind === "法律");
  const layerName = mapSpec.layers.find((layer) => layer.key === fromLayer)?.name;
  const mapHref = `/projects/${encodeURIComponent(projectId)}/map`;
  const verifyHref = `/projects/${encodeURIComponent(projectId)}/verify`;
  const checkField = (key: string) => key as "rights_duties" | "norm_origin";
  const shownRows = rows.filter((row) => row.custom || facetState(draft, row.facet) === "relevant");   // what the person marked, and what they added
  const otherRows = rows.filter((row) => !shownRows.includes(row));
  const facetCard = (row: (typeof rows)[number]) => {
    const state = facetState(draft, row.facet);
    const entry = facetEntry(row.facet);
    return (
      <div key={row.facet} className={`mcard${state === "relevant" ? " now" : ""}`} id={`facet-${row.facet}`}>
        <b>{row.facet}{row.custom && <span className="tag">你加的</span>}</b>
        <span className="k">{row.definition}</span>
        <div className="chips" role="group" aria-label={`${row.facet}跟這件事有沒有關`}>
          <button type="button" className={`chip${state === "relevant" ? " on" : ""}`} aria-pressed={state === "relevant"} onClick={() => setDraft((current) => setFacet(current, row.facet, { relevant: true }))}>有關</button>
          <button type="button" className={`chip${state === "irrelevant" ? " on" : ""}`} aria-pressed={state === "irrelevant"} onClick={() => setDraft((current) => setFacet(current, row.facet, { relevant: false }))}>無關</button>
          {row.custom && <button type="button" className="btn ghost" onClick={() => setDraft((current) => removeFacet(current, row.facet))}>刪掉這個面向</button>}
        </div>
        {state === "relevant" && spec.own_first.facets.includes(row.facet) && <p className="hint">{spec.own_first.note}</p>}
        {state === "relevant" && spec.facet_questions.map((question) => (
          <div key={question.key} className="field">
            <label htmlFor={`${row.facet}-${question.key}`}>{question.question}</label>
            <textarea id={`${row.facet}-${question.key}`} value={entry?.[question.key] ?? ""} maxLength={2000} onChange={(event) => setDraft((current) => setFacet(current, row.facet, { [question.key]: event.target.value }))} />
          </div>
        ))}
      </div>
    );
  };
  const addCustom = () => {
    const name = custom.name.trim();
    if (!name || rows.some((row) => row.facet === name)) return;
    setDraft((current) => ({ ...current, facets: [...(current.facets ?? []), { facet: name, relevant: true, custom: true, definition: custom.definition.trim() }] }));
    setCustom({ name: "", definition: "" });
  };

  return (
    <BlockShell projectId={projectId} title="規範與脈絡" refresh={refresh}>
      <Notices notices={notices} />
      <div className="card cta">
        <h2>這件事所在的世界</h2>
        <p className="how">地理、歷史、政治、經濟、文化、宗教、法律、倫理。每個面向有兩種作用：它界定這裡什麼算正常、正確、允許；它本身也可能就是造成這件事的原因之一。兩種都要看。</p>
        <p className="how">平台不預設任何一個國家、文化或法域。政治、文化、宗教、法律、倫理、道德不是要消除的偏見，是判斷的材料。這裡的「政治」不是黨派，是人們共同決定公共事務怎麼運作的過程。目標是你有意識、說得出來、願意承擔後果的立場。</p>
        {layerName && <p className="finding">你是從拆解的「{layerName}」那一層來的。這一層要看：每個有關的面向，怎麼界定這裡的正常，是不是原因之一。</p>}
        <div className="tabnext"><Link className="btn" href={mapHref}>← 回到拆解</Link></div>
      </div>

      <div className="card">
        <h2>哪些面向跟這件事有關</h2>
        <p className="how">勾出有關的，回答兩題。跟這件事無關的，標「無關」。面向清單版本：{spec.version}；清單會再增加，你也可以加自己的。</p>
        <div className="btns"><button className="btn" type="button" disabled={busy} onClick={point}>{busy ? "想一想…" : "請 AI 提醒還沒看的面向"}</button></div>
        <Refused failed={failed} at="point" />
        <p className="sub">AI 只提醒哪些面向可能有關，不說那裡的規定是什麼。AI 能做什麼，在<Link href={`/projects/${encodeURIComponent(projectId)}/contract`}>協作合約</Link>決定。請 AI 之前，系統會先把你現在寫的存成一版。</p>
        {open.length > 0 && (
          <div className="judge">
            <span className="tags"><span>{AUTHOR.ai}</span></span>
            {open.map((pointer) => (
              <div key={pointer.facet} className="mt8"><b>{pointer.facet}</b>：{pointer.why}
                <div className="btns">
                  <button className="btn primary" type="button" onClick={() => setDraft((current) => setFacet(current, pointer.facet, { relevant: true }))}>有關</button>
                  <button className="btn ghost" type="button" onClick={() => setDraft((current) => setFacet(current, pointer.facet, { relevant: false }))}>無關</button>
                </div></div>
            ))}
          </div>
        )}
        {pointers && open.length === 0 && Object.keys(pointers.content).length === 0 && <p className="sub">AI 這次沒有看到還沒看的面向。</p>}
        {shownRows.length === 0 && <p className="sub">還沒有標「有關」的面向。從下面「其他面向」挑跟這件事有關的。</p>}
        <div className="mcards">{shownRows.map(facetCard)}</div>
        <Fold title={`其他面向（${otherRows.length} 個）`}>
          <p className="hint">還沒標、或標了「無關」的面向收在這裡，一個都沒少。覺得有關，就按「有關」，它會移到上面。</p>
          <div className="mcards">{otherRows.map(facetCard)}</div>
        </Fold>
        <div className="field">
          <b>加一個你自己的面向</b>
          <input className="search" aria-label="面向的名字" placeholder="名字" value={custom.name} maxLength={60} onChange={(event) => setCustom({ ...custom, name: event.target.value })} />
          <input className="search" aria-label="這個面向是什麼意思" placeholder="一句話說它是什麼（選填）" value={custom.definition} maxLength={300} onChange={(event) => setCustom({ ...custom, definition: event.target.value })} />
          <div className="btns"><button className="btn" type="button" disabled={!custom.name.trim() || rows.some((row) => row.facet === custom.name.trim())} onClick={addCustom}>加進清單</button></div>
          <Missing why={rows.some((row) => row.facet === custom.name.trim()) && "這個面向已經在清單裡了。"} />
        </div>
      </div>

      <div className="card">
        <h2>適用哪裡的法律</h2>
        <p className="how">照事情發生在哪裡、你在哪裡、當事人各在哪裡來標。同一件事在兩個地方答案不同，兩個都列，系統不替你選。法律義務不是個人偏好。</p>
        {places.length === 0 && <p className="sub">開案時還沒寫地點。可以在下面直接寫，或回<Link href={`/projects/${encodeURIComponent(projectId)}/start`}>開案</Link>補。</p>}
        <div className="chips" role="group" aria-label="適用哪裡的法律">
          {[...places, ...(draft.jurisdictions ?? []).filter((item) => !places.includes(item))].map((item) => <button key={item} type="button" className={`chip${(draft.jurisdictions ?? []).includes(item) ? " on" : ""}`} aria-pressed={(draft.jurisdictions ?? []).includes(item)} onClick={() => set({ jurisdictions: toggled(draft.jurisdictions, item) })}>{item}</button>)}
        </div>
        <div className="field">
          <input className="search" aria-label="加一個法域" placeholder="例如：某國、某州、某個行業的規定" value={place} maxLength={200} onChange={(event) => setPlace(event.target.value)} />
          <div className="btns"><button className="btn" type="button" disabled={!place.trim() || (draft.jurisdictions ?? []).length >= 10} onClick={() => { set({ jurisdictions: toggled(draft.jurisdictions, place.trim()).slice(0, 10) }); setPlace(""); }}>加進去</button></div>
          <Missing why={(draft.jurisdictions ?? []).length >= 10 && "最多標 10 個地方。要加新的，先點掉一個。"} />
        </div>
        <h3 className="fam">這個案子的法律主張</h3>
        {caseClaims === null ? <p className="warn" role="status">這個案子的主張這次讀不到。重新整理再試一次。</p> : legal.length === 0 ? <p className="sub">這個案子還沒有標成法律的主張。在<Link href={mapHref}>拆解</Link>的「主張」或<Link href={verifyHref}>查證主張</Link>那裡標。</p> : (
          <ul className="check">{legal.map((claim) => (
            <li key={claim.id}>{claim.text}
              {claim.missing.length > 0
                ? <span className="tags"><span>未確認</span></span>
                : <span className="tags"><span>法域、時效、來源都寫了</span></span>}
              {claim.missing.length > 0 && <span className="sub">還缺：{claim.missing.join("、")}。到<Link href={claim.from === "VERIFY" ? verifyHref : mapHref}>{claim.from === "VERIFY" ? "查證主張" : "拆解"}</Link>補。</span>}
            </li>
          ))}</ul>
        )}
        {legal.length > 0 && (draft.jurisdictions ?? []).length === 0 && <p className="need">有法律主張，但還沒標適用哪裡的法律。</p>}
      </div>

      <div className="card">
        <h2>每個判斷，走四個檢查</h2>
        <p className="how">這件事裡起作用的規範，一條一條走。有好幾條，就一條一條寫在同一格裡。例：「同業都這樣改」。</p>
        {spec.checks.map((check, index) => (
          <div key={check.key} className="field">
            <b>{index + 1}. {check.question}</b>
            <p className="hint">{check.how}</p>
            {check.key === "claim_kind" && (
              <p className="sub">到<Link href={mapHref}>拆解的「主張」</Link>或<Link href={verifyHref}>查證主張</Link>做。{caseClaims ? `目前標了：${KINDS.map((kind) => `${kind} ${caseClaims.counts[kind] ?? 0}`).join("、")}${caseClaims.counts["其他"] ? `；還沒歸進這四種的 ${caseClaims.counts["其他"]} 個` : ""}。` : "主張的數目這次讀不到。"}</p>
            )}
            {(check.key === "rights_duties" || check.key === "norm_origin") && (
              <textarea aria-label={check.question} value={draft[checkField(check.key)] ?? ""} maxLength={3000} onChange={(event) => set({ [check.key]: event.target.value })} />
            )}
            {check.key === "stance" && (
              <>
                <div className="chips" role="group" aria-label="你現在的立場">
                  {spec.stances.map((stance) => <button key={stance} type="button" className={`chip${draft.stance_kind === stance ? " on" : ""}`} aria-pressed={draft.stance_kind === stance} onClick={() => set({ stance_kind: draft.stance_kind === stance ? undefined : stance })}>{stance}</button>)}
                </div>
                <label htmlFor="stance-text">暫定的立場和理由</label>
                <textarea id="stance-text" value={draft.stance ?? ""} maxLength={3000} onChange={(event) => set({ stance: event.target.value })} />
                <label htmlFor="recheck">什麼情況要重新檢查</label>
                <input id="recheck" className="search" value={draft.recheck_when ?? ""} maxLength={1000} onChange={(event) => set({ recheck_when: event.target.value })} />
              </>
            )}
          </div>
        ))}
        <p className="sub">這幾格只有你寫。AI 不替你填，拆解的 AI 也不會讀你的立場。</p>
      </div>

      {intake.package === spec.public_issue.package && (
        <div className="card">
          <h2>公共議題的五個問題</h2>
          <p className="how">走公共議題判斷時，你也回答這五題。想不出來的可以空著。</p>
          {spec.public_issue.questions.map((question, index) => (
            <div key={question} className="field">
              <label htmlFor={`pub-${index + 1}`}>{index + 1}. {question}</label>
              <textarea id={`pub-${index + 1}`} value={draft.interface?.[String(index + 1)] ?? ""} maxLength={1500} onChange={(event) => set({ interface: { ...draft.interface, [String(index + 1)]: event.target.value } })} />
            </div>
          ))}
        </div>
      )}

      <div className="card cta">
        <h2>存成新的一版</h2>
        <p className="how">每存一次就是一版，舊的不會被蓋掉。{held ? `現在是第 ${held.version} 版。` : "還沒存過。"}註記會交給拆解的每一層，也會交給判斷。</p>
        <div className="btns">
          <button className="btn primary big" type="button" disabled={busy || !dirty} onClick={() => act("save", persist)}>{busy ? "存檔中…" : held ? "存成新的一版" : "存第一版"}</button>
          {dirty && <span className="warn">有還沒存的改動</span>}
        </div>
        <Missing why={!busy && !dirty && "還沒有改動。改了任何一格，才能存成新的一版。"} />
        <Refused failed={failed} at="save" />
      </div>

      <p className="sub">這個鏡頭橫切六層，不是最後才補的一層。隨時可以回來。</p>
    </BlockShell>
  );
}
