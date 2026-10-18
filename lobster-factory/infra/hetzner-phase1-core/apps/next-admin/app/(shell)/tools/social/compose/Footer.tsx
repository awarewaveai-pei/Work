"use client";
// The composer's bottom row (mock .foot): 標籤, the hint, 設定發佈時間, and the main button that does what ▾ picked
// (存草稿／存到素材庫／送審／設定行程／週期性安排／立即發佈). 立即發佈 asks once more before it sends.
import type { ReactNode } from "react";
import { ACTS, actLabel, type Act } from "./draft";
import CIcon from "./icons";

export default function Footer({ tags, hint, when, whenDisabled, onWhen, picker, act, can, busy, menuOpen, onMenu, onAct, onMain, confirmNow, onConfirm, onCancel, readOnlyMain }: {
  tags: ReactNode; hint: ReactNode; when: string; whenDisabled: boolean; onWhen: () => void; picker: ReactNode;
  act: Act; can: Record<Exclude<Act, "keep">, boolean> & { keep: boolean }; busy: boolean; menuOpen: boolean; onMenu: (open: boolean) => void;
  onAct: (a: Exclude<Act, "keep">) => void; onMain: () => void; confirmNow: boolean; onConfirm: () => void; onCancel: () => void;
  /** a published post: the main button copies it into a new draft instead */
  readOnlyMain?: { label: string; onClick: () => void } | null;
}) {
  return (
    <div className="sm-cfootbar">
      {tags}
      <span className="sm-chint">{hint}</span>
      {picker}
      {!readOnlyMain && <button type="button" className="sm-dtbtn" disabled={whenDisabled} title="設定發佈時間" aria-label={`設定發佈時間：${when}`} onClick={onWhen}><CIcon name="calendar" />{when}</button>}
      <span className="sm-mainsplit">
        {readOnlyMain
          ? <button type="button" className="btn-primary" disabled={busy} onClick={readOnlyMain.onClick}>{readOnlyMain.label}</button>
          : <>
            <button type="button" className="btn-primary" disabled={busy || !can[act]} onClick={onMain}>{actLabel(act)}</button>
            <button type="button" className="btn-primary sm-more" aria-label="換一種做法" aria-expanded={menuOpen} disabled={busy} onClick={() => onMenu(!menuOpen)}><CIcon name="chevD" /></button>
          </>}
      </span>
      {menuOpen && (
        <div className="sm-pop sm-menu sm-pmenu" role="menu" aria-label="換一種做法">
          {ACTS.map((x) => (
            <button type="button" role="menuitemradio" aria-checked={act === x.key} key={x.key} className={act === x.key ? "sm-on" : ""} disabled={!can[x.key]}
              onClick={() => { onAct(x.key); onMenu(false); }}><b>{x.label}</b><span className="sm-muted">{x.help}</span></button>
          ))}
        </div>
      )}
      {confirmNow && (
        <div className="sm-confirm">
          <span>會馬上發到所有選的頻道。發出去之後，這裡收不回來，要到各平台自己刪。</span>
          <button type="button" className="sm-danger" disabled={busy} onClick={onConfirm}>確定發佈</button>
          <button type="button" onClick={onCancel}>取消</button>
        </div>
      )}
    </div>
  );
}
