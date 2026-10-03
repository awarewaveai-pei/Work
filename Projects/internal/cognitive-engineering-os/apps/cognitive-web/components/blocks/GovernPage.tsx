"use client";

// GOVERN 安全、資料與治理 for one case (contract card): the guardrails this case got (which, which kind of risk, which
// block found it -- never what you wrote), the times the AI stopped, export of the case, and the way to the version
// records. GOVERN only moves and names data; it never reads your words.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { AUTHOR, docs, type Doc } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { GUARDRAIL_LABEL, GUARDRAIL_ORDER, HIGH_RISK, STOP_REASON, partName, versionRecords, type VersionRecords } from "../../lib/govern";
import { formatTime } from "../../lib/time";
import { BlockShell } from "./BlockShell";
import { Explain, ExportLinks } from "./GovernParts";

type Guardrail = { guardrail: string; category: string; found_by: string };
type Stop = { reason: string; block: string };
const enc = encodeURIComponent;

export function GovernPage({ projectId }: { projectId: string }) {
  const [guardrails, setGuardrails] = useState<Doc<Guardrail>[] | null>(null);
  const [stops, setStops] = useState<Doc<Stop>[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([docs.list<Guardrail>(projectId, "govern.guardrail"), docs.list<Stop>(projectId, "govern.stop")])
      .then(([held, stopped]) => { if (active) { setGuardrails(held); setStops(stopped); } })
      .catch((reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
  }, [projectId]);
  if (!guardrails) return <BlockShell projectId={projectId} code="GOVERN"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;

  const categories = HIGH_RISK.filter((category) => guardrails.some((doc) => doc.content.category === category));
  return (
    <BlockShell projectId={projectId} code="GOVERN">
      <div className="card">
        <h2>這個案子的護欄 <small>{categories.length} 類</small></h2>
        <p className="how">案子碰到健康、法律、金錢、人身安全、急性心理危機，或要公開散布的事，系統會加護欄，也就是多一層提醒。這裡只記是哪一類、哪一塊發現的；你寫的字不會被記在這裡。</p>
        {categories.length === 0 && <p className="sub">這個案子現在沒有護欄。</p>}
        {categories.map((category) => (
          <div key={category} className="finding warn">
            <b>{category}</b>
            <ul>
              {GUARDRAIL_ORDER.map((name) => guardrails.filter((doc) => doc.content.category === category && doc.content.guardrail === name)).filter((found) => found.length > 0).map((found) => (
                <li key={found[0].content.guardrail}>
                  {GUARDRAIL_LABEL[found[0].content.guardrail] ?? found[0].content.guardrail}
                  <span className="tags"><span>{partName(found[0].content.found_by)}發現</span><span>{AUTHOR[found[0].author]}</span></span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <Explain topic="guardrails" />
      </div>

      {stops.length > 0 && (
        <div className="card">
          <h2>AI 停下來的紀錄 <small>{stops.length} 次</small></h2>
          <p className="how">AI 遇到危機或停止訊號，不會自己處理，會停下來把求助電話交給你。這裡只記什麼時候、哪一塊、為什麼停。</p>
          <ul>{stops.map((stop) => <li key={stop.doc_id}>{formatTime(stop.at)}　{partName(stop.content.block)}：{STOP_REASON[stop.content.reason] ?? stop.content.reason}</li>)}</ul>
          <p className="sub mb0"><Link href="/help">看求助電話</Link></p>
        </div>
      )}

      <div className="card">
        <h2>匯出這個案子</h2>
        <p className="how">每一版的卡和紀錄，都寫著是你寫的、AI 寫的、共同或系統，和哪一塊寫的。匯出只是把資料搬出來，不經過 AI。刪掉的卡只留「已刪除」。</p>
        <ExportLinks projectId={projectId} />
        <p className="sub mt8 mb0">要刪掉整個案子，到<Link href={`/projects/${enc(projectId)}`}>案子頁</Link>按「刪除專案」。你的帳號資料在<Link href="/settings">設定</Link>。</p>
      </div>

      <div className="card">
        <h2>這個案子用了哪個模型、哪一版規則</h2>
        <p className="how">每次 AI 回答，系統都記下用了哪個模型，和給它的指令是哪一版。</p>
        <div className="btns"><Link className="btn" href={`/projects/${enc(projectId)}/govern/versions`}>看版本紀錄</Link></div>
        <Explain topic="versions" />
      </div>
      {error && <p className="error">{error}</p>}
    </BlockShell>
  );
}

export function VersionsPage({ projectId }: { projectId: string }) {
  const [records, setRecords] = useState<VersionRecords | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    versionRecords(projectId).then((found) => { if (active) setRecords(found); }).catch((reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
  }, [projectId]);
  if (!records) return <BlockShell projectId={projectId} code="GOVERN"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;

  return (
    <BlockShell projectId={projectId} code="GOVERN">
      <p className="sub"><Link href={`/projects/${enc(projectId)}/govern`}>← 回護欄與匯出</Link></p>

      <div className="card">
        <h2>這個案子的 AI 回答 <small>{records.ai_calls.length} 次</small></h2>
        <p className="how">指令版本是一串指紋：給 AI 的指令一個字不同，指紋就不同。</p>
        {records.ai_calls.length === 0 && <p className="sub">還沒有 AI 回答過。</p>}
        {records.ai_calls.map((call, index) => (
          <div key={`${call.at}-${index}`} className="row">
            <b>{formatTime(call.at)}</b>
            <span>{partName(call.block)} · {call.action}<br />模型 {call.model}<br />指令版本 <code>{call.instructions_sha256.slice(0, 12)}</code></span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>現在用的規則版本</h2>
        <p className="how">規則改了，版本就會變。這些你都可以質疑。</p>
        {records.rules.map((rule) => (
          <div key={rule.name} className="row"><b>{rule.label}</b><span><code>{rule.version}</code></span></div>
        ))}
      </div>

      <div className="card">
        <h2>這個案子存了哪幾種紀錄</h2>
        <p className="how">每一種紀錄有哪些格子、誰能寫，也有版本；格子的定義一改，版本就會變。</p>
        {records.kinds.length === 0 && <p className="sub">還沒有。</p>}
        {records.kinds.map((held) => (
          <div key={held.kind} className="row">
            <b>{held.title ?? held.kind}</b>
            <span>{held.block ? partName(held.block) : "—"} · {held.documents} 份，共 {held.versions} 版{held.definition && <><br />格子定義版本 <code>{held.definition}</code></>}</span>
          </div>
        ))}
      </div>
      <div className="card"><Explain topic="versions" /></div>
      {error && <p className="error">{error}</p>}
    </BlockShell>
  );
}
