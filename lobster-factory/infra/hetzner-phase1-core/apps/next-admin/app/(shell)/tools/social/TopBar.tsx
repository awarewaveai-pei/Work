"use client";
// The top bar (ADR 016 §5 decision 2; mock: header, #top): the six sections, then the brand switch, the bell
// (Review.tsx NeedsButton, through the headerExtra slot) and the gear (settings).
import { useState, type ReactNode } from "react";
import Icon from "./Icon";
import type { Brand } from "./model";
import { SECTIONS, type Section } from "./routes";

export default function TopBar({ section, brands, brand, onBrand, onSection, bell, onSettings }: {
  section: Section; brands: Brand[]; brand: Brand | null; onBrand: (id: string) => void; onSection: (s: Section) => void;
  bell?: ReactNode; onSettings?: () => void;
}) {
  const [open, setOpen] = useState(false);
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
          {brands.map((b) => (
            <button type="button" role="menuitem" key={b.id} onClick={() => { setOpen(false); onBrand(b.id); }}>{b.id === brand?.id ? "✓ " : ""}{b.name}</button>
          ))}
        </div>
      )}
    </header>
  );
}
