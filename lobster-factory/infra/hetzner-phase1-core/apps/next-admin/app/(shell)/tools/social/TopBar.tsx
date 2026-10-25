"use client";
// The top bar (ADR 016 §5 decision 2; mock: header, #top): the six sections, then the brand switch, the bell
// (Review.tsx NeedsButton, through the headerExtra slot) and the gear (settings).
// total > brands.length (staff: every organization is a brand): the menu gets a search box over GET /api/social/brands?q=.
import { useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import Icon from "./Icon";
import type { Brand } from "./model";
import { SECTIONS, type Section } from "./routes";

export default function TopBar({ section, brands, total = brands.length, brand, onBrand, onSection, bell, onSettings }: {
  section: Section; brands: Brand[]; total?: number; brand: Brand | null;
  /** found: the brand, when it came from the search (it is not in `brands` yet). */
  onBrand: (id: string, found?: Brand) => void; onSection: (s: Section) => void;
  bell?: ReactNode; onSettings?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Brand[] | null>(null);   // null = no search running
  const searchable = total > brands.length;
  useEffect(() => {
    const term = search.trim();
    if (!term) { setFound(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.brands({ q: term }).then((r) => { if (!cancelled) setFound(r.brands); }).catch(() => { if (!cancelled) setFound([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search]);
  const shown = found ?? brands;
  const pick = (b: Brand) => { setOpen(false); setSearch(""); onBrand(b.id, found ? b : undefined); };
  return (
    <header className="sm-topbar">
      <h1>社群發文</h1>
      <nav className="sm-sections" aria-label="功能">
        {SECTIONS.map((s) => (
          <button type="button" key={s.key} data-view={s.key} className={s.key === section ? "sm-on" : ""} aria-current={s.key === section ? "page" : undefined}
            onClick={() => onSection(s.key)}><Icon name={s.icon} /><b>{s.label}</b></button>
        ))}
      </nav>
      <div className="sm-hright">
        {brands.length > 0 && (
          <button type="button" className="sm-hb" aria-expanded={open} title="切換品牌" onClick={() => setOpen((o) => !o)}>{brand?.name ?? "選品牌"}</button>
        )}
        {bell}
        {onSettings && <button type="button" className="sm-ibtn" aria-label="設定" title="設定：帳號、審核、團隊" onClick={onSettings}><Icon name="gear" /></button>}
      </div>
      {open && (
        <div className="sm-pop sm-menu sm-brandpop" role="menu">
          {searchable && (
            <label className="sm-find"><Icon name="search" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋品牌名稱或代號" aria-label="搜尋品牌" autoFocus /></label>
          )}
          {shown.map((b) => (
            <button type="button" role="menuitem" key={b.id} onClick={() => pick(b)}>{b.id === brand?.id ? "✓ " : ""}{b.name}</button>
          ))}
          {found && found.length === 0 && <span className="sm-muted">無符合的品牌</span>}
          {searchable && !found && <span className="sm-muted">共 {total.toLocaleString("zh-TW")} 個品牌，這裡列前 {brands.length} 個；其他請搜尋。</span>}
        </div>
      )}
    </header>
  );
}
