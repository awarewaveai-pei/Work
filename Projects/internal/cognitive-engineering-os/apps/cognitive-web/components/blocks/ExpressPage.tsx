"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "../../lib/api";
import { AUTHOR, ai, type AiTurn, type Doc, type Notice, type Saved } from "../../lib/blocks";
import { docs } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { BlockShell, Notices } from "./BlockShell";

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
  "learn.calibration", "learn.revisit", "learn.compare", "learn.daily", "learn.daily_mirror", "learn.practice", "learn.sprint",
] as const;

const KIND_NAMES: Record<string, string> = {
  "sense.card": "感受",
  "sense.state": "現在的感受",
  "sense.mirror": "整理後的感受",
  "sense.review": "對整理的回應",
  "gather.source": "來源",
  "gather.own": "我寫的來源",
  "gather.ask": "查找問題",
  "map.map": "地圖",
  "think.card": "思考卡",
  "think.response": "對整理的回應",
  "verify.message": "要查的訊息",
  "verify.claim": "主張",
  "verify.seen": "我看到的",
  "verify.verdict": "查證判定",
  "verify.summary": "查證摘要",
  "compute.run": "計算",
  "compute.request": "計算問題",
  "decide.judgment": "判斷",
  "act.task": "任務",
  "act.note": "觀察",
  "learn.calibration": "回顧",
};

const pathFor = (projectId: string, suffix: string) => `/projects/${encodeURIComponent(projectId)}${suffix}`;
const keyOf = (ref: { kind: string; doc_id: string }) => `${ref.kind}:${ref.doc_id}`;

function contentText(content: RecordContent | undefined): string {
  if (!content) return "";
  const preferred = ["title", "text", "conclusion", "summary", "question", "sentence", "note", "what", "reason"];
  for (const key of preferred) {
    const value = content[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  for (const value of Object.values(content)) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "這筆紀錄沒有可顯示的短句。";
}

function recordLabel(record: CaseRecord): string {
  const label = KIND_NAMES[record.kind] ?? "其他紀錄";
  return `${label}：${contentText(record.content).slice(0, 70)}`;
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
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const load = async () => {
    const [formatData, savedSelection, savedDrafts, recordLists] = await Promise.all([
      apiFetch<FormatResponse>(pathFor(projectId, "/express/formats")),
      apiFetch<Selection[]>(pathFor(projectId, "/express/selection")),
      apiFetch<Draft[]>(pathFor(projectId, "/express/drafts")),
      Promise.all(CASE_RECORD_KINDS.map((kind) => docs.list<RecordContent>(projectId, kind))),
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
    setEdits({});
    setHandback("");
    if (currentSelection) {
      setOutline(await apiFetch<Outline>(pathFor(projectId, "/express/outline")).catch(() => null));
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

  const act = async (work: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await work();
      setRefresh((value) => value + 1);
    } catch (reason) {
      setError(humanError(reason));
    } finally {
      setBusy(false);
    }
  };

  const recordsByKey = useMemo(() => new Map(records.map((record) => [keyOf(record), record])), [records]);
  const selectedRecords = useMemo(() => selectedRefs.map((ref) => recordsByKey.get(keyOf(ref))).filter((record): record is CaseRecord => Boolean(record)), [recordsByKey, selectedRefs]);
  const sentences = draft?.content.sentences ?? [];
  const disclosures = useMemo(() => disclosureLines(draft, selectedRecords), [draft, selectedRecords]);
  const hasUnchecked = sentences.some((sentence) => sentence.unchecked === true);

  const toggleRecord = (record: CaseRecord) => {
    const ref = { project_id: projectId, kind: record.kind, doc_id: record.doc_id };
    setSelectedRefs((current) => current.some((item) => keyOf(item) === keyOf(ref))
      ? current.filter((item) => keyOf(item) !== keyOf(ref))
      : [...current, ref]);
  };

  const saveSelection = () => act(async () => {
    const content: SelectionContent = { items: selectedRefs, format, reader, key_points: keyPoints };
    const saved = selection
      ? await apiFetch<Saved<SelectionContent>>(pathFor(projectId, `/express/selection/${encodeURIComponent(selection.doc_id)}`), { method: "PUT", body: JSON.stringify({ content, base_version: selection.version }) })
      : await apiFetch<Saved<SelectionContent>>(pathFor(projectId, "/express/selection"), { method: "POST", body: JSON.stringify({ content }) });
    setNotices(saved.notices ?? []);
  });

  const draftFromAi = () => act(async () => {
    if (!selection) return;
    const turn = await ai<DraftContent>(projectId, "EXPRESS", "draft_from_outline", { selection: selection.doc_id, format, reader }) as ExpressTurn;
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
    setHandback(turn.handback ?? "");
  });

  const adjustForReader = () => act(async () => {
    if (!selection || !draft) return;
    const turn = await ai<DraftContent>(projectId, "EXPRESS", "adjust_for_reader", { selection: selection.doc_id, draft: draft.doc_id, format, reader }, draft) as ExpressTurn;
    if (turn.stopped) setNotices([{ type: "crisis", notice: turn.notice ?? "", resources: turn.resources ?? [] }]);
    setHandback(turn.handback ?? "");
  });

  const saveEdits = () => act(async () => {
    if (!draft) return;
    const changed = sentences.map((sentence, index) => {
      const text = edits[index] ?? sentence.text;
      return text === sentence.text ? sentence : { ...sentence, text, author: "user" as const };
    });
    await docs.update(projectId, "express.draft", draft, { ...draft.content, sentences: changed });
  });

  const exportDraft = (exportFormat: string) => act(async () => {
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
    void act(async () => {
      const blob = await postFile(pathFor(projectId, `/express/drafts/${encodeURIComponent(draft.doc_id)}/send`), {
        version: draft.version,
        to: reader,
        acknowledge_unchecked: hasUnchecked,
      });
      download(blob, `express-draft-v${draft.version}.md`);
      setSendConfirm(false);
    });
  };

  return (
    <BlockShell projectId={projectId} code="EXPRESS" refresh={refresh}>
      <Notices notices={notices} />
      <div className="card cta">
        <div className="top"><h1>產出與表達</h1><span className="tag">EXPRESS</span></div>
        <p className="how">這一頁把你的判斷整理成一份可以給別人看的稿子。你會自己決定內容，也會自己按送出。</p>

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
          {records.length === 0 && <p className="sub">這個案子還沒有可選的紀錄。</p>}
          <div className="todos">
            {records.map((record) => {
              const checked = selectedRefs.some((ref) => keyOf(ref) === keyOf(record));
              return <label className="todo" key={keyOf(record)}><input type="checkbox" checked={checked} onChange={() => toggleRecord(record)} /> {recordLabel(record)}</label>;
            })}
          </div>
          <div className="btns mt8"><button className="btn primary" type="button" disabled={busy || selectedRefs.length === 0 || !reader.trim() || !format} onClick={saveSelection}>存下選擇</button></div>
        </div>

        {outline && (
          <div className="card">
            <h2>大綱</h2>
            <ol>{outline.nodes.map((node, index) => <li key={`${index}-${node.refs.map(keyOf).join(",")}`}>{node.record ? (node.record.title || contentText(node.record.content)) : node.refs.map((ref) => recordsByKey.get(keyOf(ref)) ? recordLabel(recordsByKey.get(keyOf(ref))!) : "選取的紀錄").join("、")}</li>)}</ol>
            <div className="btns"><button className="btn primary" type="button" disabled={busy || !selection} onClick={draftFromAi}>請 AI 起草</button></div>
          </div>
        )}

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
                      return <button key={keyOf(ref)} type="button" className="chip" onClick={() => source && setOpenedSource(source)}>來源：{source ? recordLabel(source) : "來源紀錄"}</button>;
                    })}
                  </div>
                </div>
              );
            })}
            {openedSource && <div className="finding" role="status"><b>{recordLabel(openedSource)}</b><p>{contentText(openedSource.content)}</p><button className="btn ghost" type="button" onClick={() => setOpenedSource(null)}>關閉來源</button></div>}
            <div className="card okline"><h3>我的信心</h3>{disclosures.confidence.length ? <ul>{disclosures.confidence.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="sub">尚未寫下信心。</p>}<h3>我還不確定</h3>{disclosures.uncertainty.length ? <ul>{disclosures.uncertainty.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="sub">尚未另外寫下來。</p>}</div>
            <div className="btns">
              <button className="btn" type="button" disabled={busy || !selection} onClick={adjustForReader}>請 AI 依讀者改寫</button>
              <button className="btn primary" type="button" disabled={busy} onClick={saveEdits}>存下逐句改寫</button>
            </div>
            <div className="btns mt8">
              {EXPORTS.map((item) => <button key={item.format} className="btn ghost" type="button" disabled={busy} onClick={() => exportDraft(item.format)}>{item.label}</button>)}
            </div>
            {hasUnchecked && <div className="finding warn"><b>這份稿有還沒查證的句子。</b>送出前請確認你看過這個提醒。</div>}
            <div className="btns mt8"><button className="btn primary" type="button" disabled={busy || !reader.trim()} onClick={sendDraft}>{sendConfirm && hasUnchecked ? "我知道了，仍要送出" : "送出"}</button></div>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </BlockShell>
  );
}
