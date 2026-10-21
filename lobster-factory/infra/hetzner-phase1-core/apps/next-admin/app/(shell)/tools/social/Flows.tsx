"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AutoRule } from "./api";
import type { SlotContext } from "./SocialManager";

type Draft = Omit<AutoRule, "id" | "post_id" | "hits">;
const PLATFORMS = [["facebook", "Facebook"], ["instagram", "Instagram"]] as const;
const TRIGGERS = [["comment", "留言"], ["dm", "私訊"]] as const;
const ACTIONS = [["reply", "公開回覆"], ["dm", "私訊對方"], ["both", "公開回覆＋私訊"]] as const;

const blank = (): Draft => ({ name: "", trigger: "comment", keywords: [], platforms: ["facebook", "instagram"], action: "reply", reply: "", active: true });
const draftOf = (rule: AutoRule): Draft => ({ name: rule.name, trigger: rule.trigger, keywords: [...rule.keywords], platforms: [...rule.platforms], action: rule.action, reply: rule.reply, active: rule.active });
const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);

function RuleEditor({ draft, canWrite, busy, onChange, onSave, onCancel }: {
  draft: Draft; canWrite: boolean; busy: boolean; onChange: (next: Draft) => void; onSave: () => void; onCancel: () => void;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return <div className="sm-sec sm-rule" aria-label="自動回覆規則編輯器">
    <div className="sm-row"><label className="sm-lab" htmlFor="flow-name">名稱</label><input id="flow-name" type="text" maxLength={80} value={draft.name} onChange={(e) => set({ name: e.target.value })} disabled={!canWrite || busy} placeholder="例如：報名問題" /></div>
    <div className="sm-row"><span className="sm-lab">當</span><span className="sm-seg" role="group" aria-label="觸發事件">{TRIGGERS.map(([key, label]) => <button type="button" key={key} className={draft.trigger === key ? "sm-on" : ""} aria-pressed={draft.trigger === key} disabled={!canWrite || busy} onClick={() => set({ trigger: key })}>{label}</button>)}</span></div>
    <div className="sm-row"><label className="sm-lab" htmlFor="flow-keywords">關鍵字</label><input id="flow-keywords" type="text" value={draft.keywords.join(", ")} onChange={(e) => set({ keywords: e.target.value.split(/[,，、]/).map((x) => x.trim()).filter(Boolean) })} disabled={!canWrite || busy} placeholder="報名, 怎麼報" /></div>
    <div className="sm-row"><span className="sm-lab">平台</span>{PLATFORMS.map(([key, label]) => <label className="sm-ck" key={key}><input type="checkbox" checked={draft.platforms.includes(key)} disabled={!canWrite || busy} onChange={(e) => set({ platforms: e.target.checked ? [...draft.platforms, key] : draft.platforms.filter((p) => p !== key) })} />{label}</label>)}</div>
    <div className="sm-row"><span className="sm-lab">動作</span><span className="sm-seg" role="group" aria-label="回覆動作">{ACTIONS.map(([key, label]) => <button type="button" key={key} className={draft.action === key ? "sm-on" : ""} aria-pressed={draft.action === key} disabled={!canWrite || busy} onClick={() => set({ action: key })}>{label}</button>)}</span></div>
    <div className="sm-row"><label className="sm-lab" htmlFor="flow-reply">回覆內容</label><textarea id="flow-reply" rows={3} maxLength={2000} value={draft.reply} onChange={(e) => set({ reply: e.target.value })} disabled={!canWrite || busy} placeholder="謝謝你的留言，我們會盡快回覆。" /></div>
    <div className="sm-row"><label className="sm-ck"><input type="checkbox" checked={draft.active} disabled={!canWrite || busy} onChange={(e) => set({ active: e.target.checked })} />啟用這條規則</label><span className="sm-r"><button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>取消</button><button type="button" className="btn-primary" disabled={!canWrite || busy} onClick={onSave}>{busy ? "儲存中…" : "儲存規則"}</button></span></div>
  </div>;
}

export default function Flows({ ctx }: { ctx: SlotContext }) {
  const [rules, setRules] = useState<AutoRule[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const canWrite = ctx.brand.role === "owner" || ctx.brand.role === "editor";
  const ownRulePosts = ctx.posts.filter((post) => post.auto_mode === "own" && post.state !== "deleted");
  const load = useCallback(() => {
    const requestId = ++requestRef.current;
    setError(null);
    api.autoRules(ctx.brand.id).then((result) => { if (requestRef.current === requestId) setRules(result.rules); })
      .catch((e) => { if (requestRef.current === requestId) setError(messageOf(e)); });
  }, [ctx.brand.id]);
  useEffect(() => { setRules(null); setEditing(null); load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true); setError(null);
    try {
      const result = await api.saveAutoRule(ctx.brand.id, editing.id, { ...editing.draft, post_id: null });
      const old = rules?.find((r) => r.id === editing.id);
      const next: AutoRule = { ...editing.draft, id: result.id, post_id: null, hits: old?.hits ?? 0 };
      setRules((current) => editing.id ? (current ?? []).map((r) => r.id === editing.id ? next : r) : [...(current ?? []), next]);
      setEditing(null); ctx.say("已儲存自動回覆規則。");
    } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!canWrite || !window.confirm("確定刪除這條自動回覆規則？")) return;
    setBusy(true); setError(null);
    try { await api.deleteAutoRule(ctx.brand.id, id); setRules((current) => (current ?? []).filter((r) => r.id !== id)); if (editing?.id === id) setEditing(null); ctx.say("已刪除自動回覆規則。"); }
    catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  };

  return <section className="sm-panel" aria-label="自動化流程">
    <div className="sm-ptop"><div><h2>自動化流程</h2><span className="sm-muted">品牌規則 · 單則貼文規則會優先</span></div>{canWrite && <button type="button" className="btn-primary" disabled={busy} onClick={() => setEditing({ id: null, draft: blank() })}>新增規則</button>}</div>
    <div className="sm-note" role="note">Meta 審核完成前不會實際自動回覆；目前可先建立與測試規則。</div>
    <div className="sm-row sm-muted"><b>{ownRulePosts.length} 則貼文有自己的規則</b></div>
    {error && <p className="sm-err" role="alert">{error}</p>}
    {editing && <RuleEditor draft={editing.draft} canWrite={canWrite} busy={busy} onChange={(draft) => setEditing({ ...editing, draft })} onSave={() => void save()} onCancel={() => setEditing(null)} />}
    {rules === null ? <p className="sm-muted">讀取規則中…</p> : !rules.length ? <p className="sm-muted">還沒有品牌自動回覆規則。</p> : <div className="sm-list">{rules.map((rule) => <div className="sm-row" key={rule.id}>
      <div><b>{rule.name || "未命名規則"}</b><div className="sm-muted">{rule.trigger === "comment" ? "留言" : "私訊"}：{rule.keywords.join("、")} · {rule.platforms.join("／")}</div><div className="sm-muted">{rule.action === "reply" ? "公開回覆" : rule.action === "dm" ? "私訊對方" : "公開回覆＋私訊"} · 命中 {rule.hits}</div></div>
      <div className="sm-r"><span className={rule.active ? "sm-pill" : "sm-muted"}>{rule.active ? "啟用中" : "已停用"}</span><button type="button" className="btn-secondary" disabled={!canWrite || busy} onClick={() => setEditing({ id: rule.id, draft: draftOf(rule) })}>編輯</button><button type="button" className="btn-secondary" disabled={!canWrite || busy} onClick={() => void remove(rule.id)}>刪除</button></div>
    </div>)}</div>}
  </section>;
}
