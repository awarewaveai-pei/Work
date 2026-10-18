"use client";
// 要發成哪一種 (mock #pset): on 共用 one row per channel that has a choice; on a channel tab that channel's own, with
// what the format needs. A format that is drawn but not sendable yet (`off`) stays disabled with its reason.
import { PfMark } from "../Calendar";
import { formatsOf, platformOf, type Account } from "../model";

const NEEDS: Record<string, string> = {
  instagram: "放 2 張以上的圖，會變成多圖輪播。限時動態不顯示文字。Reel 要一支影片。",
  "instagram-standalone": "放 2 張以上的圖，會變成多圖輪播。限時動態不顯示文字。Reel 要一支影片。",
  facebook: "Reel 和限時動態要直式影片或圖片。",
};

export default function Formats({ channels, tab, formats, editable, onFormat }: {
  channels: Account[]; tab: string; formats: Record<string, string>; editable: (id: string) => boolean; onFormat: (id: string, f: string) => void;
}) {
  const seg = (a: Account) => (
    <span className="sm-seg">
      {formatsOf(a.platform).map((f) => (
        <button type="button" key={f.key} className={(formats[a.id] ?? "post") === f.key ? "sm-on" : ""} disabled={!editable(a.id) || !!f.off} title={f.off ?? ""}
          aria-pressed={(formats[a.id] ?? "post") === f.key} onClick={() => onFormat(a.id, f.key)}>{f.label}</button>
      ))}
    </span>
  );
  const ch = tab === "all" ? null : channels.find((a) => a.id === tab);
  if (ch) {
    const fs = formatsOf(ch.platform);
    return (
      <div className="sm-pset">
        <h3>{platformOf(ch.platform).name}（{ch.label}）要發成哪一種</h3>
        {fs.length > 1 ? <div className="sm-psrow">{seg(ch)}</div> : <span className="sm-muted">{platformOf(ch.platform).name} 只有一般貼文，不用選。</span>}
        {[NEEDS[ch.platform], ...fs.map((f) => f.off)].filter(Boolean).map((t) => <span key={t} className="sm-muted">{t}</span>)}
      </div>
    );
  }
  const rows = channels.filter((a) => formatsOf(a.platform).length > 1);
  if (!rows.length) return null;
  return (
    <div className="sm-pset">
      <h3>要發成哪一種</h3>
      {rows.map((a) => <div className="sm-psrow" key={a.id}><PfMark platform={a.platform} /><span>{platformOf(a.platform).name}（{a.label}）</span>{seg(a)}</div>)}
    </div>
  );
}
