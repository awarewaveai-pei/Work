"use client";

// 組裝器 開案 (contract card): pick a purpose, write what to clarify, the risk, who is affected, when it is done, and
// where it happens; the assembler recommends the purpose's package (積木和順序) and says why -- you can reorder or
// skip blocks. A purpose whose package is not open yet is shown with the step it opens in, never selectable.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { NotTherapyNotice } from "./GovernParts";
import { BLOCKS, OPEN_STEP, blockHref, blockOf, docs, type Doc, type Notice } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { caseName, createProject } from "../../lib/projects";
import { BlockShell, Notices } from "./BlockShell";

// ai_lego/core/domain/kinds/assembler.py PURPOSES / PURPOSE_PACKAGE / PACKAGES / PACKAGE_OPENS_AT (test_block_foundation compares them)
export const PURPOSES: Array<{ purpose: string; package: string; blocks: string[]; opens: number; why: string }> = [
  { purpose: "自我理解", package: "自我理解", blocks: ["SENSE", "MAP", "THINK", "DECIDE", "LEARN"], opens: 1, why: "先看見自己怎麼判斷：外化、拆解、共思考、判斷、回顧" },
  { purpose: "複雜決策", package: "個人複雜決策", blocks: ["SENSE", "MAP", "THINK", "DECIDE", "ACT", "LEARN"], opens: 1, why: "關係、職涯、合作與個人選擇：做完決定還要走一步、回頭對" },
  { purpose: "訊息判斷", package: "可疑訊息判斷", blocks: ["VERIFY", "THINK", "DECIDE", "ACT", "LEARN"], opens: 2, why: "詐騙、健康、投資、公共資訊：先查是誰說的" },
  { purpose: "創意發散", package: "創意與策略衝刺", blocks: ["SENSE", "MAP", "THINK", "DECIDE", "ACT", "LEARN"], opens: 1, why: "研究、創作、產品與策略問題：先攤開，再拆，再發散" },
  { purpose: "學習反思", package: "課堂反思", blocks: ["SENSE", "THINK", "DECIDE", "LEARN"], opens: 4, why: "學生的思考練習與 AI 素養" },
  { purpose: "團隊審議", package: "團隊審議", blocks: ["MAP", "VERIFY", "COLLAB", "DECIDE", "ACT", "LEARN"], opens: 3, why: "團隊、社群與組織的共同問題" },
  { purpose: "公共議題判斷", package: "公共議題判斷", blocks: ["MAP", "VERIFY", "THINK", "DECIDE", "ACT", "LEARN"], opens: 2, why: "一項政策、一個公共爭議，我怎麼形成自己的立場" },
];

type Intake = {
  purpose: string; question: string; risk?: string; affected?: string[]; rules?: string; done_when?: string;
  happened_in?: string[]; you_are_in?: string; others_in?: string[]; field_contact?: string; package: string; blocks?: string[];
};
const lines = (text: string) => text.split(/\n|、/).map((item) => item.trim()).filter(Boolean);

// question: the sentence written on the home page before 陪我思考 (?q=, ENTRY_SLICE1_CHECKLIST.md item 6); it fills
// 你想釐清什麼 only while the case has no 開案資料 yet, never over a saved one. No projectId (/projects/new): the
// project is created only when 開案 is pressed, so a case is exactly a project with 開案資料 (GET /projects is_case);
// leaving this page leaves nothing behind (Codex review 2026-10-11 F1).
export function IntakePage({ projectId: given, question = "" }: { projectId?: string; question?: string }) {
  const [projectId, setProjectId] = useState(given ?? "");
  const [held, setHeld] = useState<Doc<Intake> | null | undefined>(given ? undefined : null);
  const [draft, setDraft] = useState<Intake>({ purpose: "", question, package: "" });
  const [text, setText] = useState({ affected: "", happened_in: "", others_in: "" });
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!given) return;
    docs.list<Intake>(given, "assembler.intake").then((found) => {
      const latest = found.at(-1) ?? null;
      setHeld(latest);
      if (latest) {
        setDraft(latest.content);
        setText({ affected: (latest.content.affected ?? []).join("\n"), happened_in: (latest.content.happened_in ?? []).join("\n"), others_in: (latest.content.others_in ?? []).join("\n") });
      }
    }).catch((reason) => setError(humanError(reason)));
  }, [given]);

  const pick = (purpose: (typeof PURPOSES)[number]) => setDraft({ ...draft, purpose: purpose.purpose, package: purpose.package, blocks: purpose.blocks });
  const move = (index: number, by: number) => {
    const blocks = [...(draft.blocks ?? [])];
    const [taken] = blocks.splice(index, 1);
    blocks.splice(index + by, 0, taken);
    setDraft({ ...draft, blocks });
  };
  const skip = (code: string) => setDraft({ ...draft, blocks: (draft.blocks ?? []).filter((item) => item !== code) });
  const save = async () => {
    setError(""); setBusy(true);
    try {
      const content: Intake = { ...draft, question: draft.question.trim(), affected: lines(text.affected), happened_in: lines(text.happened_in), others_in: lines(text.others_in) };
      let id = projectId;
      if (!id) {   // kept if 開案資料 then fails, so pressing 開案 again does not make a second project
        id = (await createProject(caseName(content.question, new Date()), content.question)).project_id;
        setProjectId(id);
      }
      const saved = held ? await docs.update(id, "assembler.intake", held, content) : await docs.create(id, "assembler.intake", content);
      if (!given) window.history.replaceState(null, "", `/projects/${encodeURIComponent(id)}/start`);   // keeps this page (and its notices) on screen
      setHeld(saved); setNotices(saved.notices); setRefresh((count) => count + 1);
    } catch (reason) { setError(humanError(reason)); } finally { setBusy(false); }
  };
  if (held === undefined) return <BlockShell projectId={projectId} title="開案"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;
  const shell = (children: React.ReactNode) => projectId
    ? <BlockShell projectId={projectId} title="開案" refresh={refresh}>{children}</BlockShell>
    : <section className="view" id="intake-new"><div className="top"><div><h1>開一個新案子</h1><div className="sub">按「開案」才會建立這個案子；離開這一頁什麼都不會留下。</div></div></div>{children}</section>;
  const chosen = PURPOSES.find((item) => item.purpose === draft.purpose);
  const first = (draft.blocks ?? []).map((code) => blockOf(code)).find((block) => block && block.step <= OPEN_STEP);
  const guarded = notices.filter((notice) => notice.type === "guardrail");

  return shell(
    <>
      <NotTherapyNotice />
      <Notices notices={notices} />
      {guarded.length > 0 && <div className="card accent"><p className="mt0">你寫的風險碰到：{guarded.map((notice) => notice.type === "guardrail" ? notice.category : "").join("、")}。這個案子加了護欄：AI 說到事實一定附來源、會提醒你可以找專業的人、不能反悔的決定會請你先等一下。</p></div>}
      <div className="card cta">
        <h2>這次的目的</h2>
        <div className="chips" role="group" aria-label="目的">
          {PURPOSES.map((item) => item.opens <= OPEN_STEP
            ? <button key={item.purpose} type="button" className={`chip${draft.purpose === item.purpose ? " on" : ""}`} aria-pressed={draft.purpose === item.purpose} onClick={() => pick(item)}>{item.purpose}</button>
            : <span key={item.purpose} className="chip" aria-disabled="true" title={`第 ${item.opens} 步才開放`}>{item.purpose}（第 {item.opens} 步開）</span>)}
        </div>
        {chosen && <p className="how">推薦的組合：「{chosen.package}」。{chosen.why}。</p>}

        <div className="field"><label htmlFor="q">你想釐清什麼</label><textarea id="q" value={draft.question} maxLength={2000} onChange={(event) => setDraft({ ...draft, question: event.target.value })} /></div>
        <div className="field"><label htmlFor="risk">風險（選填）</label><p className="hint">做錯了會怎樣？碰到健康、法律、金錢、人身安全、要公開散布的事，系統會自動加護欄。</p><textarea id="risk" value={draft.risk ?? ""} maxLength={2000} onChange={(event) => setDraft({ ...draft, risk: event.target.value })} /></div>
        <div className="field"><label htmlFor="affected">誰會受影響（一行一個）</label><textarea id="affected" value={text.affected} onChange={(event) => setText({ ...text, affected: event.target.value })} /></div>
        <div className="field"><label htmlFor="done">做到什麼，這件事就算告一段落（選填）</label><input id="done" className="search" value={draft.done_when ?? ""} maxLength={1000} onChange={(event) => setDraft({ ...draft, done_when: event.target.value })} /></div>
        <div className="field"><label htmlFor="rules">跟這件事有關的法律或程序（知道的話）</label><input id="rules" className="search" value={draft.rules ?? ""} maxLength={2000} onChange={(event) => setDraft({ ...draft, rules: event.target.value })} /></div>
        <div className="field"><label htmlFor="where">事情發生在哪裡（一行一個；跨國可以寫不只一個）</label><textarea id="where" value={text.happened_in} onChange={(event) => setText({ ...text, happened_in: event.target.value })} /></div>
        <div className="field"><label htmlFor="me">你自己在哪裡</label><p className="hint">用來給你當地的求助資源、照當地的規定處理資料。AI 預設會知道事情發生在哪裡、你在哪裡；不想讓 AI 知道，在協作合約關掉。</p><input id="me" className="search" value={draft.you_are_in ?? ""} maxLength={200} onChange={(event) => setDraft({ ...draft, you_are_in: event.target.value })} /></div>
        <div className="field"><label htmlFor="others">其他當事人各在哪裡（選填，一行一個）</label><textarea id="others" value={text.others_in} onChange={(event) => setText({ ...text, others_in: event.target.value })} /></div>
        <div className="field"><label htmlFor="field">有沒有到過現場的人可以問？（選填）</label><input id="field" className="search" value={draft.field_contact ?? ""} maxLength={500} onChange={(event) => setDraft({ ...draft, field_contact: event.target.value })} /></div>

        {chosen && (
          <div className="field">
            <b>這次走的積木（可以重排、跳過）</b>
            <ol>
              {(draft.blocks ?? []).map((code, index) => {
                const block = blockOf(code);
                return (
                  <li key={code}>{block?.n} {block?.name}{block && block.step > OPEN_STEP ? `（第 ${block.step} 步才開放）` : ""}
                    <span className="btns">
                      {index > 0 && <button type="button" className="btn ghost" onClick={() => move(index, -1)}>往前</button>}
                      {index < (draft.blocks ?? []).length - 1 && <button type="button" className="btn ghost" onClick={() => move(index, 1)}>往後</button>}
                      <button type="button" className="btn ghost" onClick={() => skip(code)}>跳過</button>
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="hint">其他積木在對的時機由各塊提出，你同意才加。案子頁上 14 格都看得到。</p>
          </div>
        )}
        <div className="btns mt8"><button className="btn primary big" type="button" disabled={!draft.purpose || !draft.question.trim() || busy} onClick={save}>{busy ? "存檔中…" : held ? "存這一版" : "開案"}</button></div>
        {error && <p className="error">{error}</p>}
      </div>
      {held && first && <div className="tabnext"><Link className="btn primary" href={blockHref(projectId, first)}>開始第一塊：{first.name} →</Link></div>}
      <p className="sub">每一版開案資料都留著。{BLOCKS.length} 塊積木都在這個案子的頁面上。</p>
    </>
  );
}
