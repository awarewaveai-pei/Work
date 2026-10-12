"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "../../lib/api";
import { AUTHOR, ai, type AiTurn, type Doc, type Notice, type Saved } from "../../lib/blocks";
import { docs } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { collab, groups, type Group } from "../../lib/groups";
import { BlockShell, Notices } from "./BlockShell";
import { DRAWERS, offered, recordName, setAside } from "./expressRecords";
import { Fold, Missing, Refused, firstMissing, type Failed } from "./PageParts";

type Ref = { project_id: string; kind: string; doc_id: string };
type SentenceRef = { kind: string; doc_id: string };
type SelectionContent = { items: Ref[]; format: string; reader: string; key_points?: string; unchecked_ok?: boolean };
type Format = { name: string; sections?: string[]; reader?: string };
type FormatResponse = { formats: Format[] };
type RecordContent = Record<string, unknown>;
type CaseRecord = Doc<RecordContent>;
type Sentence = { text: string; refs: SentenceRef[]; unchecked: boolean; author: "ai" | "user"; seen?: boolean };
type DraftContent = {
  format: string;
  reader: string;
  sentences: Sentence[];
  confidence_text?: string;
  confidence?: number;
  uncertainty_text?: string;
  uncertainty?: string | string[];
  open_uncertainties?: string[];
  uncertainties?: string[];
};
type Draft = Doc<DraftContent>;
type Selection = Doc<SelectionContent>;
type Outline = { nodes: Array<{ refs: SentenceRef[]; record?: { kind: string; title?: string; content?: RecordContent } }> };
type ExpressTurn = AiTurn<DraftContent> & { handback?: string };

const READERS = ["自己", "家人", "朋友", "同事", "團隊", "專業人員"];
const EXPORTS = [
  { format: "md", label: "匯出 Markdown" },
  { format: "txt", label: "匯出文字" },
  { format: "pdf", label: "匯出 PDF" },
] as const;

// The EXPRESS API has no aggregate case-record route. Keep this allowlist aligned with
// the selectable blocks so the page never asks the API for person-owned records.
const CASE_RECORD_KINDS = [
  "sense.card", "sense.state", "sense.mirror", "sense.review",
  "gather.source", "gather.origins", "gather.split", "gather.takeback", "gather.mark", "gather.override", "gather.ask", "gather.own", "gather.channels", "gather.ai_queries", "gather.ai_says", "gather.ai_compare",
  "map.map", "map.placement", "map.alternatives", "map.method_pick", "map.claim_proposal", "map.review",
  "think.round", "think.card", "think.reaction", "think.batch", "think.reply", "think.response", "think.laid_out",
  "verify.claim", "verify.stance", "verify.reading", "verify.search", "verify.verdict", "verify.message", "verify.first", "verify.split", "verify.techniques", "verify.spread", "verify.seen", "verify.lookup", "verify.factcheck", "verify.summary", "verify.next",
  "compute.run", "compute.adopt", "compute.request", "compute.suggestion", "compute.explanation",
  "decide.judgment", "decide.check", "decide.review", "decide.seal", "decide.pause",
  "act.task", "act.note", "act.split", "act.flag", "act.trend",
  "learn.calibration", "learn.revisit", "learn.compare",
] as const;

const pathFor = (projectId: string, suffix: string) => `/projects/${encodeURIComponent(projectId)}${suffix}`;
const keyOf = (ref: { kind: string; doc_id: string }) => `${ref.kind}:${ref.doc_id}`;

// an id is never shown as what a record says (walk B7)
const ID_LIKE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,}|[a-z]+:[0-9a-f-]{8,})$/i;

function contentText(content: RecordContent | undefined): string {
  if (!content) return "";
  const preferred = ["title", "text", "conclusion", "summary", "question", "sentence", "note", "what", "reason", "outcome", "claim", "problem", "happened"];
  const said = (value: unknown) => typeof value === "string" && value.trim() !== "" && !ID_LIKE.test(value.trim());
  for (const key of preferred) {
    const value = content[key];
    if (said(value)) return (value as string).trim();
  }
  for (const value of Object.values(content)) {
    if (said(value)) return (value as string).trim();
  }
  return "這筆紀錄沒有一句可以顯示的話。";
}

function valuesFor(content: Record<string, unknown> | undefined, keys: string[]): string[] {
  if (!content) return [];
  const values: string[] = [];
  for (const key of keys) {
    const value = content[key];
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (typeof item === "string" && item.trim() && !values.includes(item.trim())) values.push(item.trim());
      if (typeof item === "number" && Number.isFinite(item)) {
        const text = `${item}%`;
        if (!values.includes(text)) values.push(text);
      }
    }
  }
  return values;
}

function disclosureLines(draft: Draft | null, records: CaseRecord[]): { confidence: string[]; uncertainty: string[] } {
  const sources = [draft?.content, ...records.map((record) => record.content)].filter(Boolean) as Record<string, unknown>[];
  return {
    confidence: [...new Set(sources.flatMap((content) => valuesFor(content, ["confidence_text", "confidence"])))],
    uncertainty: [...new Set(sources.flatMap((content) => valuesFor(content, ["uncertainty_text", "uncertainty", "open_uncertainties", "uncertainties"])))],
  };
}

async function postFile(path: string, body?: Record<string, unknown>): Promise<Blob> {
  const prefix = process.env.NEXT_PUBLIC_API_PREFIX ?? "/api";
  const response = await fetch(`${prefix}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    let detail: unknown = null;
    try { detail = await response.json(); } catch { detail = await response.text(); }
    throw new ApiError(response.status, (detail as { detail?: unknown } | null)?.detail ?? detail);
  }
  return response.blob();
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ExpressPage({ projectId }: { projectId: string }) {
  const [formats, setFormats] = useState<Format[]>([]);
  const [records, setRecords] = useState<CaseRecord[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedRefs, setSelectedRefs] = useState<Ref[]>([]);
  const [reader, setReader] = useState("");
  const [format, setFormat] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [outline, setOutline] = useState<Outline | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [openedSource, setOpenedSource] = useState<CaseRecord | null>(null);
  const [handback, setHandback] = useState("");
  const [sendConfirm, setSendConfirm] = useState(false);
  const [openGroups, setOpenGroups] = useState<Group[]>([]);
  const [giveConfirm, setGiveConfirm] = useState<string | null>(null);
  const [given, setGiven] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<Failed>(null);
  const [outlineError, setOutlineError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const load = async () => {
    const [formatData, savedSelection, savedDrafts, recordLists, myGroups] = await Promise.all([
      apiFetch<FormatResponse>(pathFor(projectId, "/express/formats")),
      apiFetch<Selection[]>(pathFor(projectId, "/express/selection")),
      apiFetch<Draft[]>(pathFor(projectId, "/express/drafts")),
      Promise.all(CASE_RECORD_KINDS.map((kind) => docs.list<RecordContent>(projectId, kind))),
      groups.list(),
    ]);
    const currentSelection = savedSelection.at(-1) ?? null;
    const listedDraft = savedDrafts.at(-1) ?? null;
    const readDraft = listedDraft
      ? await apiFetch<Draft>(pathFor(projectId, `/express/drafts/${encodeURIComponent(listedDraft.doc_id)}`)).catch(() => listedDraft)
      : null;
    setFormats(formatData.formats ?? []);
    setRecords(recordLists.flat().filter((record) => record.kind !== "express.selection" && record.kind !== "express.draft" && record.kind !== "express.sent"));
    setSelection(currentSelection);
    setSelectedRefs(currentSelection?.content.items ?? []);
    setReader(currentSelection?.content.reader ?? "");
    setFormat(currentSelection?.content.format ?? formatData.formats?.[0]?.name ?? "");
    setKeyPoints(currentSelection?.content.key_points ?? "");
    setDraft(readDraft);
    setOpenGroups(myGroups.filter((group) => group.status === "open"));
    setGiveConfirm(null);
    setEdits({});
    setHandback("");
    setOutlineError("");
    if (currentSelection) {
      setOutline(await apiFetch<Outline>(pathFor(projectId, "/express/outline")).catch((reason) => { setOutlineError(humanError(reason)); return null; }));
    } else {
      setOutline(null);
    }
  };

  useEffect(() => {
    let active = true;
    load().catch((reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
    // The refresh counter is changed only after a write, so the page re-reads the server version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refresh]);

  // `at`: the button group that sent it; its refusal is shown there (PageParts.Refused)
  const act = async (at: string, work: () => Promise<void>) => {
    setFailed(null);
    setGiven("");
    setBusy(true);
    try {
      await work();
      setRefresh((value) => value + 1);
    } catch (reason) {
      setFailed({ at, text: humanError(reason) });
    } finally {
      setBusy(false);
    }
  };

  const recordsByKey = useMemo(() => new Map(records.map((record) => [keyOf(record), record])), [records]);
  const selectedRecords = useMemo(() => selectedRefs.map((ref) => recordsByKey.get(keyOf(ref))).filter((record): record is CaseRecord => Boolean(record)), [recordsByKey, selectedRefs]);
  const sentences = draft?.content.sentences ?? [];
  const disclosures = useMemo(() => disclosureLines(draft, selectedRecords), [draft, selectedRecords]);
  const hasUnchecked = sentences.some((sentence) => sentence.unchecked === true);
  const unsaved = sentences.some((sentence, index) => edits[index] !== undefined && edits[index] !== sentence.text);

  const isPicked = (record: CaseRecord) => selectedRefs.some((ref) => keyOf(ref) === keyOf(record));
  const offeredRecords = records.filter(offered);
  const asideRecords = offeredRecords.filter(setAside);
  const pickedElsewhere = records.filter((record) => !offered(record) && isPicked(record));
  const pickRow = (record: CaseRecord) => <label className="todo" key={keyOf(record)}><input type="checkbox" checked={isPicked(record)} onChange={() => toggleRecord(record)} /> {recordName(record)}</label>;

  const toggleRecord = (record: CaseRecord) => {
    const ref = { project_id: projectId, kind: record.kind, doc_id: record.doc_id };
    setSelectedRefs((current) => current.some((item) => keyOf(item) === keyOf(ref))
      ? current.filter((item) => keyOf(item) !== keyOf(ref))
      : [...current, ref]);
  };

  const saveSelection = () => act("selection", async () => {
    const content: SelectionContent = { items: selectedRefs, format, reader, key_points: keyPoints };
    const saved = selection
      ? await apiFetch<Saved<SelectionContent>>(pathFor(projectId, `/express/selection/${encodeURIComponent(selection.doc_id)}`), { method: "PUT", body: JSON.stringify({ content, base_version: selection.version }) })
      : await apiFetch<Saved<SelectionContent>>(pathFor(projectId, "/express/selection"), { method: "POST", body: JSON.stringify({ content }) });
    setNotices(saved.notices ?? []);
  });

  const draftFromAi = () => act("outline", async () => {
    if (!selection) return;
    const turn = await ai<DraftContent>(projectId, "EXPRESS", "draft_from_outline", { selection: selection.doc_id, format, reader }) as ExpressTurn;
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
    setHandback(turn.handback ?? "");
  });

  const adjustForReader = () => act("rewrite", async () => {
    if (!selection || !draft) return;
    const turn = await ai<DraftContent>(projectId, "EXPRESS", "adjust_for_reader", { selection: selection.doc_id, draft: draft.doc_id, format, reader }, draft) as ExpressTurn;
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
    setHandback(turn.handback ?? "");
  });

  const saveEdits = () => act("rewrite", async () => {
    if (!draft) return;
    const changed = sentences.map((sentence, index) => {
      const text = edits[index] ?? sentence.text;
      return text === sentence.text ? sentence : { ...sentence, text, author: "user" as const };
    });
    await docs.update(projectId, "express.draft", draft, { ...draft.content, sentences: changed });
  });

  const exportDraft = (exportFormat: string) => act("export", async () => {
    if (!draft) return;
    const blob = await postFile(pathFor(projectId, `/express/drafts/${encodeURIComponent(draft.doc_id)}/export?format=${encodeURIComponent(exportFormat)}`));
    download(blob, `express-draft-v${draft.version}.${exportFormat}`);
  });

  const sendDraft = () => {
    if (!draft) return;
    if (hasUnchecked && !sendConfirm) {
      setSendConfirm(true);
      return;
    }
    void act("send", async () => {
      const blob = await postFile(pathFor(projectId, `/express/drafts/${encodeURIComponent(draft.doc_id)}/send`), {
        version: draft.version,
        to: reader,
        acknowledge_unchecked: hasUnchecked,
      });
      download(blob, `express-draft-v${draft.version}.md`);
      setSendConfirm(false);
    });
  };

  // Only the saved version's sentences go, into a group the person is an open member of; no refs, reader or case record.
  const giveToGroup = (group: Group) => {
    if (!draft) return;
    if (hasUnchecked && giveConfirm !== group.group_id) {
      setGiveConfirm(group.group_id);
      return;
    }
    void act(`group-${group.group_id}`, async () => {
      const saved = await collab.create(group.group_id, "collab.proposal", { express_draft: draft.doc_id, text: sentences.map((sentence) => sentence.text).join("\n") });
      setNotices(saved.notices);
      setGiven(group.name);
    });
  };

  return (
    <BlockShell projectId={projectId} code="EXPRESS" refresh={refresh}>
      <Notices notices={notices} />
      <div className="card cta">
        <div className="top"><h1>產出與表達</h1><span className="tag">EXPRESS</span></div>
        <p className="how">這一頁把你的判斷整理成一份可以給別人看的稿子。你會自己決定內容，也會自己按送出。</p>
        {error && <p className="error" role="alert">{error}</p>}

        <div className="station">
          <h2>給誰看</h2>
          <div className="chips" role="group" aria-label="給誰看">
            {READERS.map((item) => <button key={item} type="button" className={`chip${reader === item ? " on" : ""}`} aria-pressed={reader === item} onClick={() => setReader(item)}>{item}</button>)}
          </div>
          <label htmlFor="express-reader">也可以自己寫</label>
          <input id="express-reader" className="search" value={reader} maxLength={500} onChange={(event) => setReader(event.target.value)} />
        </div>

        <div className="station">
          <h2>用什麼格式</h2>
          <div className="chips" role="group" aria-label="輸出格式">
            {formats.map((item) => <button key={item.name} type="button" className={`chip${format === item.name ? " on" : ""}`} aria-pressed={format === item.name} onClick={() => setFormat(item.name)}>{item.name}</button>)}
          </div>
        </div>

        <div className="station">
          <h2>想說的重點</h2>
          <textarea aria-label="想說的重點" value={keyPoints} maxLength={4000} onChange={(event) => setKeyPoints(event.target.value)} />
        </div>

        <div className="station">
          <h2>選要帶上的紀錄</h2>
          <p className="hint">只會把打勾的紀錄放進這份稿子。</p>
          {offeredRecords.length === 0 && <p className="sub">這個案子還沒有可選的紀錄。</p>}
          {DRAWERS.map((drawer) => {
            const list = offeredRecords.filter((record) => record.kind in drawer.kinds && !setAside(record));
            return list.length > 0 && <div key={drawer.name}><h3 className="fam">{drawer.name}</h3><div className="todos">{list.map(pickRow)}</div></div>;
          })}
          {asideRecords.length > 0 && <Fold title={`放一旁的來源（${asideRecords.length} 筆，不算進出處）`} filled={asideRecords.filter(isPicked).length}><div className="todos">{asideRecords.map(pickRow)}</div></Fold>}
          {pickedElsewhere.length > 0 && <><p className="hint">之前選過、不在上面清單裡的：</p><div className="todos">{pickedElsewhere.map(pickRow)}</div></>}
          <div className="btns mt8"><button className="btn primary" type="button" disabled={busy || selectedRefs.length === 0 || !reader.trim() || !format} onClick={saveSelection}>存下選擇</button></div>
          <Missing why={firstMissing([!reader.trim(), "先選或寫這份稿子給誰看。"], [!format, "先選格式。"], [selectedRefs.length === 0, "至少勾一筆紀錄。"])} />
          <Refused failed={failed} at="selection" />
        </div>

        {outline && (
          <div className="card">
            <h2>大綱</h2>
            <ol>{outline.nodes.map((node, index) => <li key={`${index}-${node.refs.map(keyOf).join(",")}`}>{node.record ? (node.record.title || recordName({ kind: node.record.kind, content: node.record.content })) : node.refs.map((ref) => recordsByKey.get(keyOf(ref)) ? recordName(recordsByKey.get(keyOf(ref))!) : "選取的紀錄").join("、")}</li>)}</ol>
            <div className="btns"><button className="btn primary" type="button" disabled={busy || !selection} onClick={draftFromAi}>請 AI 起草</button></div>
            <Refused failed={failed} at="outline" />
          </div>
        )}
        {outlineError && <p className="error">讀不到大綱：{outlineError}</p>}

        {handback && <div className="finding warn" role="status"><b>先確認一件事</b>{handback}</div>}
        {draft && (
          <div className="card">
            <div className="top"><h2>你的稿子</h2><span className="tags"><span>{AUTHOR[draft.author]}</span></span></div>
            <p className="sub">讀者：{draft.content.reader}。格式：{draft.content.format}。</p>
            {sentences.map((sentence, index) => {
              const text = edits[index] ?? sentence.text;
              return (
                <div className="judge" key={`${draft.doc_id}-${index}`}>
                  <label htmlFor={`express-sentence-${index}`}>第 {index + 1} 句</label>
                  <textarea id={`express-sentence-${index}`} value={text} onChange={(event) => setEdits({ ...edits, [index]: event.target.value })} />
                  <div className="tags">
                    {sentence.unchecked && <span>還沒查證</span>}
                    {sentence.author === "ai" && <span>AI 撰寫</span>}
                  </div>
                  <div className="chips" aria-label={`第 ${index + 1} 句的來源`}>
                    {sentence.refs.map((ref) => {
                      const source = recordsByKey.get(keyOf(ref));
                      return <button key={keyOf(ref)} type="button" className="chip" onClick={() => source && setOpenedSource(source)}>來源：{source ? recordName(source) : "來源紀錄"}</button>;
                    })}
                  </div>
                </div>
              );
            })}
            {openedSource && <div className="finding" role="status"><b>{recordName(openedSource)}</b><p>{contentText(openedSource.content)}</p><button className="btn ghost" type="button" onClick={() => setOpenedSource(null)}>關閉來源</button></div>}
            <div className="card okline"><h3>我的信心</h3>{disclosures.confidence.length ? <ul>{disclosures.confidence.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="sub">尚未寫下信心。</p>}<h3>我還不確定</h3>{disclosures.uncertainty.length ? <ul>{disclosures.uncertainty.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="sub">尚未另外寫下來。</p>}</div>
            <div className="btns">
              <button className="btn" type="button" disabled={busy || !selection} onClick={adjustForReader}>請 AI 依讀者改寫</button>
              <button className="btn primary" type="button" disabled={busy} onClick={saveEdits}>存下逐句改寫</button>
            </div>
            <Refused failed={failed} at="rewrite" />
            <div className="btns mt8">
              {EXPORTS.map((item) => <button key={item.format} className="btn ghost" type="button" disabled={busy} onClick={() => exportDraft(item.format)}>{item.label}</button>)}
            </div>
            <Refused failed={failed} at="export" />
            {hasUnchecked && <div className="finding warn"><b>這份稿有還沒查證的句子。</b>送出前請確認你看過這個提醒。</div>}
            <div className="btns mt8"><button className="btn primary" type="button" disabled={busy || !reader.trim()} onClick={sendDraft}>{sendConfirm && hasUnchecked ? "我知道了，仍要送出" : "送出"}</button></div>
            <Missing why={!reader.trim() && "先在上面寫這份稿子給誰看，才能送出。"} />
            <Refused failed={failed} at="send" />
            {openGroups.length > 0 && (
              <div className="station">
                <h3>交給群組當提案</h3>
                <p className="why">只把最後存下的第 {draft.version} 版文字交給群組。來源、信心和案子裡的其他紀錄都不會過去。</p>
                {openGroups.map((group) => (
                  <div className="btns mt8" key={group.group_id}>
                    <span className="sub">{group.name}</span>
                    <button className="btn" type="button" disabled={busy || unsaved} onClick={() => giveToGroup(group)}>{giveConfirm === group.group_id && hasUnchecked ? "我知道了，仍要交給大家" : "交給大家當提案"}</button>
                    <Refused failed={failed} at={`group-${group.group_id}`} />
                  </div>
                ))}
                <Missing why={unsaved && "逐句改寫還沒存。先按「存下逐句改寫」，才能交給群組。"} />
                {given && <div className="finding ok mt8" role="status">已交給「{given}」當提案。</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </BlockShell>
  );
}
