"use client";

// Top-bar search (U18, blueprint §4.5, §3.6, §16 SearchBox), in the staff frame and every product door (app/PlatformFrame.tsx).
// The index arrives from the server (lib/portal/search-index.ts); matching is lib/portal/search.ts. Keys: / focuses,
// ↑↓ move, Enter opens, Esc closes. Results are a visible list under the box (no select menu).
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { GROUP_NAMES, noResultHelp, searchCatalog, type SearchIndex, type SearchItem } from "@/lib/portal/search";

const typing = (el: Element | null) =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el as HTMLElement).isContentEditable);

const panel: CSSProperties = {
  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30, maxHeight: "60vh", overflowY: "auto",
  background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 8, padding: 6, boxShadow: "0 4px 16px var(--card-border)",
};
const head: CSSProperties = { padding: "6px 8px 2px", fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600 };
const chip: CSSProperties = { fontSize: 12, padding: "3px 10px" };

export function SearchBox({ index, open = (href) => window.location.assign(href) }: { index: SearchIndex; open?: (href: string) => void }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const groups = useMemo(() => searchCatalog(index, query), [index, query]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const help = useMemo(() => (query.trim() && !flat.length ? noResultHelp(index, query) : null), [index, query, flat.length]);
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || typing(document.activeElement)) return;
      e.preventDefault();
      input.current?.focus();
      setShown(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => { setShown(false); setQuery(""); input.current?.blur(); };
  const go = (item: SearchItem | undefined) => { if (item) { setShown(false); open(item.href); } };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown" && flat.length) { e.preventDefault(); setShown(true); setActive((a) => (a + 1) % flat.length); }
    else if (e.key === "ArrowUp" && flat.length) { e.preventDefault(); setActive((a) => (a - 1 + flat.length) % flat.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(flat[active]); }
  };
  const pick = (text: string) => { setQuery(text); input.current?.focus(); };
  const optionId = (i: number) => `${listId}-o${i}`;
  const expanded = shown && !!query.trim();
  let n = -1;

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 520 }}>
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label="搜尋工具"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && flat.length ? optionId(active) : undefined}
        aria-autocomplete="list"
        placeholder="搜尋工具、功能或頁面（按 / 開始）"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShown(true); }}
        onFocus={() => setShown(true)}
        onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) setShown(false); }}
        onKeyDown={onKeyDown}
        style={{
          width: "100%", padding: "7px 10px", border: "1px solid var(--card-border)", borderRadius: 6,
          fontSize: 13, background: "var(--form-input-bg)", color: "var(--text-primary)", outline: "none",
        }}
      />
      {expanded && (
        <div id={listId} role="listbox" aria-label="搜尋結果" style={panel}>
          {groups.map((g) => (
            <div key={g.group} role="group" aria-label={GROUP_NAMES[g.group]}>
              <div style={head}>{GROUP_NAMES[g.group]}</div>
              {g.items.map((item) => {
                const i = ++n;
                const on = i === active;
                return (
                  <a key={`${item.group}:${item.key}`} id={optionId(i)} role="option" aria-selected={on} href={item.href}
                    onMouseEnter={() => setActive(i)} onClick={(e) => { e.preventDefault(); go(item); }}
                    style={{ display: "block", padding: "6px 8px", borderRadius: 6, textDecoration: "none", color: "var(--text-primary)",
                      background: on ? "var(--chip-bg)" : "transparent" }}>
                    <span style={{ display: "block", fontSize: 13 }}>{item.name}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)" }}>{item.crumb.join(" › ")}</span>
                  </a>
                );
              })}
            </div>
          ))}
          {help && (
            <div style={{ padding: "4px 2px" }}>
              <div style={{ ...head, color: "var(--text-primary)" }}>找不到「{query.trim()}」</div>
              {help.near.length > 0 && <Row title="你是不是要找" items={help.near} pick={pick} />}
              <Row title="依任務找" items={help.tasks} pick={pick} />
              <Row title="瀏覽全部分類" items={help.categories} pick={pick} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ title, items, pick }: { title: string; items: string[]; pick: (s: string) => void }) {
  return (
    <div>
      <div style={head}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "4px 8px" }}>
        {items.map((s) => (
          <button key={s} type="button" className="btn-ghost" style={chip} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}
