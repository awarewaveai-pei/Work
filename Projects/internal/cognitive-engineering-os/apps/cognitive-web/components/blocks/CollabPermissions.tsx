"use client";

// 協作合約 (contract card): what the AI may do in this case. The words and the always-allowed list copy
// ai_lego/core/domain/kinds/collab_contract.py (test_block_think compares them). Two pieces every block page can show:
// CollabPermissions = the AI's permissions in one line, always visible; AskBeforeBlock = asks once per block whether to change them.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { blockOf, docs, type Doc } from "../../lib/blocks";
import { humanError } from "../../lib/errors";

export const ALWAYS = ["organize", "ask", "point_gaps"] as const;
export const ALWAYS_WORDS = "整理、提問、指出還缺什麼";
export const GRANTABLE_WORDS: Record<string, string> = {
  search_external: "找外部資料（只引用有來源卡的）",
  propose_options: "提出選項",
  rank: "排序（只是參考）",
  counter: "當反方",
  direct_advice: "給直接建議",
};
// Not a permission: the places go to the AI unless you hold them back (hide_places).
export const HIDE_PLACES_WORDS = "不讓 AI 知道發生地和你在哪裡";
export const SCOPES = ["釐清", "探索", "比較", "做決定"] as const;
export const KIND = "collab_contract.terms";

export type Terms = { scope?: string; human_parts?: string; permissions?: string[]; basis?: string; handback?: string; hide_places?: boolean };
const TEXT_FIELDS: Array<[keyof Terms, string]> = [["scope", "這次做什麼、決定到哪裡"], ["human_parts", "人不可委託的部分"], ["basis", "依據與脈絡"], ["handback", "交還控制的條件"]];
// The permissions a block's AI turns may ask for; a block not listed here shows all six.
const RELEVANT: Record<string, string[]> = { THINK: ["counter", "propose_options", "direct_advice"] };

/** What a version changed against the one before it (null = the first version), as short sentences. */
export function describeChange(before: Terms | null, after: Terms): string[] {
  const was = new Set(before?.permissions ?? []);
  const now = new Set(after.permissions ?? []);
  const changes: string[] = [];
  for (const [key, words] of Object.entries(GRANTABLE_WORDS)) {
    if (now.has(key) && !was.has(key)) changes.push(`准了「${words}」`);
    if (!now.has(key) && was.has(key)) changes.push(`收回「${words}」`);
  }
  if (Boolean(before?.hide_places) !== Boolean(after.hide_places)) changes.push(after.hide_places ? `選了「${HIDE_PLACES_WORDS}」` : `不再選「${HIDE_PLACES_WORDS}」`);
  for (const [field, name] of TEXT_FIELDS) {
    const old = (before?.[field] as string | undefined) ?? "";
    const next = (after[field] as string | undefined) ?? "";
    if (old !== next) changes.push(`${old ? "改了" : "寫了"}「${name}」`);
  }
  return changes;
}

export function allowedNow(terms: Terms | null | undefined): { granted: string[]; withheld: string[] } {
  const given = new Set(terms?.permissions ?? []);
  return { granted: Object.keys(GRANTABLE_WORDS).filter((key) => given.has(key)), withheld: Object.keys(GRANTABLE_WORDS).filter((key) => !given.has(key)) };
}

/** The case's current contract (undefined while loading, null when none is written yet) and a save that makes the next version. */
export function useContract(projectId: string) {
  const [doc, setDoc] = useState<Doc<Terms> | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    docs.list<Terms>(projectId, KIND).then((found) => { if (active) setDoc(found.at(-1) ?? null); }).catch((reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
  }, [projectId]);
  const save = async (content: Terms): Promise<boolean> => {
    setBusy(true); setError("");
    try {
      const clean = Object.fromEntries(Object.entries(content).filter(([, value]) => value !== "" && value !== false && !(Array.isArray(value) && value.length === 0))) as Terms;
      setDoc(doc ? await docs.update(projectId, KIND, doc, clean) : await docs.create(projectId, KIND, clean));
      return true;
    } catch (reason) {
      setError(humanError(reason));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { doc, error, busy, save };
}

/** One visible toggle chip per permission the person can grant. */
export function PermissionChips({ value, onChange, only }: { value: string[]; onChange: (next: string[]) => void; only?: string[] }) {
  const keys = Object.keys(GRANTABLE_WORDS).filter((key) => !only || only.includes(key));
  return (
    <div className="chips" role="group" aria-label="AI 的權限">
      {keys.map((key) => {
        const on = value.includes(key);
        return <button key={key} type="button" className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => onChange(on ? value.filter((item) => item !== key) : [...value, key])}>{on ? "准：" : "沒准："}{GRANTABLE_WORDS[key]}</button>;
      })}
    </div>
  );
}

/** The one switch that holds the places back from the AI, a visible button (no <select>). */
export function PlacesToggle({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="chips" role="group" aria-label="發生地和你在哪裡">
      <button type="button" className={`chip${value ? " on" : ""}`} aria-pressed={value} onClick={() => onChange(!value)}>{value ? "已選：" : "沒選："}{HIDE_PLACES_WORDS}</button>
    </div>
  );
}

/** The AI's permissions in one line (「畫面上一直看得到 AI 現在的權限」). */
export function CollabPermissions({ projectId }: { projectId: string }) {
  const { doc, error } = useContract(projectId);
  if (error) return <p className="error">{error}</p>;
  if (doc === undefined) return null;
  const { granted } = allowedNow(doc?.content);
  return (
    <div className="carried" aria-label="AI 現在的權限">
      <b>AI 現在能做：</b>{ALWAYS_WORDS}{granted.length > 0 ? `；你另外准了：${granted.map((key) => GRANTABLE_WORDS[key]).join("、")}` : "；其他的你還沒准"}。{doc?.content.hide_places ? " 你不讓它知道發生地和你在哪裡。" : ""}{" "}
      <Link href={`/projects/${encodeURIComponent(projectId)}/contract`}>改</Link>
    </div>
  );
}

const seenKey = (projectId: string, block: string) => `aw:ask-before:${projectId}:${block}`;
const memory = new Set<string>();
function wasAsked(key: string): boolean {
  if (memory.has(key)) return true;
  try { return window.localStorage.getItem(key) === "1"; } catch { return false; }
}
function markAsked(key: string) {
  memory.add(key);
  try { window.localStorage.setItem(key, "1"); } catch { /* private mode: the answer holds for this tab only */ }
}

/** Asks once the first time this case enters ``block``: should the AI's permissions change before it starts? */
export function AskBeforeBlock({ projectId, block }: { projectId: string; block: string }) {
  const { doc, error, busy, save } = useContract(projectId);
  const key = seenKey(projectId, block);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  useEffect(() => { setOpen(!wasAsked(key)); setDraft(null); }, [key]);
  if (!open || doc === undefined) return error ? <p className="error">{error}</p> : null;
  const current = doc?.content.permissions ?? [];
  const value = draft ?? current;
  const done = () => { markAsked(key); setOpen(false); };
  const changed = draft !== null && [...draft].sort().join() !== [...current].sort().join();
  return (
    <div className="card accent" role="region" aria-label="進這一塊之前，AI 能做什麼">
      <h2>進「{blockOf(block)?.name ?? block}」之前，要改 AI 能做什麼嗎？</h2>
      <p className="how">沒准的事，AI 只會整理、提問、指出還缺什麼。每一項你隨時可以收回。</p>
      <PermissionChips value={value} onChange={setDraft} only={RELEVANT[block]} />
      <div className="btns">
        {changed && <button className="btn primary" type="button" disabled={busy} onClick={async () => { if (await save({ ...doc?.content, permissions: draft ?? [] })) done(); }}>{busy ? "存檔中…" : "存下來，繼續"}</button>}
        <button className={`btn${changed ? " ghost" : " primary"}`} type="button" onClick={done}>不改，繼續</button>
        <Link className="btn ghost" href={`/projects/${encodeURIComponent(projectId)}/contract`}>看整份協作合約</Link>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
