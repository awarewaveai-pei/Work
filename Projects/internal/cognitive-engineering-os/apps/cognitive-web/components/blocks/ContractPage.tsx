"use client";

// 協作合約 (contract card): five fields that say what the AI may do in this case. The system refuses an AI turn outside them
// (ai_lego/platform/ai_gate.py), so a permission you did not grant is not just a line in a prompt. Every save is a new
// version and every version stays in the list below.
import React, { useEffect, useState } from "react";
import { docs, type Doc } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { formatTime } from "../../lib/time";
import { BlockShell } from "./BlockShell";
import { ALWAYS_WORDS, KIND, PermissionChips, PlacesToggle, SCOPES, describeChange, useContract, type Terms } from "./CollabPermissions";

const key = (terms: Terms) => JSON.stringify([terms.scope ?? "", terms.human_parts ?? "", [...(terms.permissions ?? [])].sort(), terms.basis ?? "", terms.handback ?? "", Boolean(terms.hide_places)]);
const same = (a: Terms, b: Terms) => key(a) === key(b);

export function ContractPage({ projectId }: { projectId: string }) {
  const { doc, error, busy, save } = useContract(projectId);
  const [draft, setDraft] = useState<Terms>({});
  const [versions, setVersions] = useState<Doc<Terms>[]>([]);
  const [listError, setListError] = useState("");

  useEffect(() => { if (doc) setDraft(doc.content); }, [doc]);
  useEffect(() => {
    if (!doc) return;
    docs.versions<Terms>(projectId, KIND, doc.doc_id).then(setVersions).catch((reason) => setListError(humanError(reason)));
  }, [projectId, doc]);

  const set = (patch: Partial<Terms>) => setDraft((held) => ({ ...held, ...patch }));
  const unchanged = same(draft, doc?.content ?? {});
  if (doc === undefined) return <BlockShell projectId={projectId} title="協作合約"><div className="card"><p>{error || "載入中…"}</p></div></BlockShell>;

  return (
    <BlockShell projectId={projectId} title="協作合約">
      <p className="sub">這裡設定 AI 這次能做什麼。你沒准的事，系統會真的擋下來，AI 做不了。你隨時可以改，每改一次都留一版。</p>
      <div className="card cta">
        <div className="field">
          <b>這次做什麼、決定到哪裡</b>
          <p className="hint">我現在要釐清、探索、比較，還是做決定？</p>
          <div className="chips" role="group" aria-label="這次做什麼">
            {SCOPES.map((scope) => <button key={scope} type="button" className={`chip${draft.scope === scope ? " on" : ""}`} aria-pressed={draft.scope === scope} onClick={() => set({ scope: draft.scope === scope ? "" : scope })}>{scope}</button>)}
          </div>
        </div>
        <div className="field">
          <label htmlFor="human-parts">人不可委託的部分</label>
          <p className="hint">哪些價值、風險、關係與最終選擇，必須由我承擔？</p>
          <textarea id="human-parts" value={draft.human_parts ?? ""} maxLength={2000} onChange={(event) => set({ human_parts: event.target.value })} />
        </div>
        <div className="field">
          <b>AI 的角色與權限</b>
          <p className="hint">可不可以找資料、提出選項、排序、當反方、給直接建議？一定准的：{ALWAYS_WORDS}。</p>
          <PermissionChips value={draft.permissions ?? []} onChange={(permissions) => set({ permissions })} />
          <p className="hint">「找外部資料」要等蒐集來源這一塊開放後才有用。</p>
        </div>
        <div className="field">
          <b>發生地和你在哪裡</b>
          <p className="hint">平常每次呼叫 AI，系統都把這兩樣交給它。你可以不給；不給的時候，碰到要看地點的事，AI 會說它不知道。</p>
          <PlacesToggle value={Boolean(draft.hide_places)} onChange={(hide_places) => set({ hide_places })} />
        </div>
        <div className="field">
          <label htmlFor="basis">依據與脈絡</label>
          <p className="hint">哪些來源、經驗、限制、利害關係，必須納入？</p>
          <textarea id="basis" value={draft.basis ?? ""} maxLength={2000} onChange={(event) => set({ basis: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="handback">交還控制的條件</label>
          <p className="hint">什麼情況下，我要自己重新判斷、暫停、找人，或改用其他方法？</p>
          <textarea id="handback" value={draft.handback ?? ""} maxLength={2000} onChange={(event) => set({ handback: event.target.value })} />
        </div>
        <div className="btns mt8">
          <button className="btn primary" type="button" disabled={busy || unchanged} onClick={() => save(draft)}>{busy ? "存檔中…" : doc ? "存成新的一版" : "存下來"}</button>
          {unchanged && doc && <span className="sub">還沒改任何東西。</span>}
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <h2>每一版 <small>{versions.length} 版</small></h2>
        {versions.length === 0 && <p className="sub">還沒存過。存了之後，每一次修改都會列在這裡。</p>}
        <ul>
          {versions.map((version, index) => ({ version, changes: describeChange(index === 0 ? null : versions[index - 1].content, version.content) })).reverse().map(({ version, changes }) => (
            <li key={version.version}><b>第 {version.version} 版</b> · {formatTime(version.at)} · {changes.length ? changes.join("；") : version.version === 1 ? "開始時，額外的權限都沒准" : "沒有改任何一格"}</li>
          ))}
        </ul>
        {listError && <p className="error">{listError}</p>}
      </div>
    </BlockShell>
  );
}
