"use client";
// 標籤 (mock #tagBtn / tagEditor): one list per brand; tick for this post, rename, change colour, delete, add. Tag edits
// are saved at once (0105 social_save_tag / social_delete_tag); which tags this post has is saved with the post.
import { useState } from "react";
import { api, ApiError } from "../api";
import type { Tag } from "../model";
import CIcon from "./icons";

const COLOURS: Tag["colour"][] = ["a", "b", "c", "d", "e"];
const errorText = (e: unknown) => (e instanceof ApiError && e.status === 409 ? "已經有同名的標籤。" : e instanceof Error ? e.message : String(e));

export default function TagPicker({ brandId, tags, selected, disabled, canEdit, onSelect, onTags, say }: {
  brandId: string; tags: Tag[] | null; selected: string[]; disabled: boolean; canEdit: boolean;
  onSelect: (ids: string[]) => void; onTags: (tags: Tag[]) => void; say: (t: string, error?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sure, setSure] = useState<string | null>(null);
  const names = selected.map((id) => tags?.find((t) => t.id === id)?.name).filter(Boolean);
  const save = async (t: Tag | null, nm: string, colour: Tag["colour"]) => {
    try {
      const { id } = await api.saveTag(brandId, t?.id ?? null, nm, colour);
      const next = t ? (tags ?? []).map((x) => (x.id === t.id ? { ...x, name: nm, colour } : x)) : [...(tags ?? []), { id, name: nm, colour }];
      onTags(next);
      return id;
    } catch (e) {
      say(errorText(e), true);
      return null;
    }
  };
  const add = async () => {
    const nm = name.trim();
    if (!nm) return say("先輸入標籤名稱。", true);
    const id = await save(null, nm, COLOURS[(tags?.length ?? 0) % COLOURS.length]);
    if (id) { setName(""); onSelect([...selected, id]); }
  };
  const remove = async (t: Tag) => {
    try {
      await api.deleteTag(brandId, t.id);
      onTags((tags ?? []).filter((x) => x.id !== t.id));
      onSelect(selected.filter((x) => x !== t.id));
      setSure(null);
      say(`已刪除標籤「${t.name}」，用到它的貼文也一起拿掉了。`);
    } catch (e) {
      say(errorText(e), true);
    }
  };
  return (
    <span className="sm-tagwrap">
      <button type="button" aria-expanded={open} disabled={disabled} title="標籤（分類）" onClick={() => setOpen((o) => !o)}><CIcon name="tag" />{names.length ? `標籤：${names.join("、")}` : "標籤"}</button>
      {open && (
        <div className="sm-pop sm-tagpop" role="dialog" aria-label="標籤">
          <h3>標籤（分類）</h3>
          {tags === null && <span className="sm-muted">載入中…</span>}
          {tags && !tags.length && <span className="sm-muted">還沒有標籤。在下面建第一個，例如「活動」「課程」。</span>}
          {(tags ?? []).map((t) => (
            <div className="sm-trow" key={t.id}>
              <input type="checkbox" aria-label={`這則加上「${t.name}」`} checked={selected.includes(t.id)}
                onChange={(e) => onSelect(e.target.checked ? [...selected, t.id] : selected.filter((x) => x !== t.id))} />
              <button type="button" className={`sm-tdot sm-tg-${t.colour}`} aria-label={`換「${t.name}」的顏色`} title="換顏色" disabled={!canEdit}
                onClick={() => void save(t, t.name, COLOURS[(COLOURS.indexOf(t.colour) + 1) % COLOURS.length])} />
              <input type="text" aria-label="標籤名稱" defaultValue={t.name} readOnly={!canEdit} maxLength={40}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) void save(t, v, t.colour); else e.target.value = t.name; }} />
              {canEdit && (sure === t.id
                ? <button type="button" className="sm-danger" onClick={() => void remove(t)}>確定刪除</button>
                : <button type="button" className="sm-ibtn" aria-label={`刪除標籤「${t.name}」`} onClick={() => setSure(t.id)}><CIcon name="x" /></button>)}
            </div>
          ))}
          {canEdit && (
            <div className="sm-tnew">
              <input type="text" aria-label="新標籤名稱" placeholder="新標籤，例如：活動" maxLength={40} value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
              <button type="button" onClick={() => void add()}>新增標籤</button>
            </div>
          )}
          <button type="button" className="btn-primary" onClick={() => setOpen(false)}>好</button>
        </div>
      )}
    </span>
  );
}
