'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { OpsInboxBadge } from './(shell)/ops/inbox/components/OpsInboxBadge';
import type { SavedLayout } from '../lib/theme/tokens';
import { DEFAULT_SECTIONS, activeLink, applyLayout, visibleSections } from './sidebar-sections';

export { DEFAULT_SECTIONS, activeLink, activeSectionId, applyLayout, itemKey, visibleSections, type NavItem, type NavSection } from './sidebar-sections';

// ── Component ────────────────────────────────────────────────────────────────
// `initialLayout` is fetched server-side (app/layout.tsx) from the DB, so the saved sidebar
// order renders identically on every device. No client storage: sections start collapsed except
// the current page's one; open/closed lives in state, which survives navigation (the layout stays
// mounted) and resets on reload.
// `visible`: the item keys a restricted staff member may open, computed server-side from their tool grant (the layout);
// null = unrestricted (owner, or not yet set while shadow). The saved order applies to the full list first.
export function SidebarNav({ initialLayout, visible = null }: { initialLayout?: SavedLayout | null; visible?: string[] | null }) {
  const ordered = initialLayout ? applyLayout(DEFAULT_SECTIONS, initialLayout) : DEFAULT_SECTIONS;
  const sections = visible ? visibleSections(ordered, href => visible.includes(href)) : ordered;
  const pathname = usePathname() ?? '/';
  // .sidebar-link.active (--sidebar-text-active, --sidebar-active-bg, --sidebar-active-bar) only
  // paints when the current page's link carries the class.
  const current = activeLink(sections, pathname);
  const active = current?.sectionId ?? null;
  const [open, setOpen] = useState<Set<string>>(() => new Set(active ? [active] : []));

  // Navigating into a collapsed section (e.g. from a dashboard card) opens it.
  useEffect(() => {
    if (active) setOpen(prev => (prev.has(active) ? prev : new Set(prev).add(active)));
  }, [active]);

  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <>
      {sections.map(section => {
        // A one-item section (Overview) has nothing to fold.
        const foldable = section.items.length > 1;
        const isOpen = !foldable || open.has(section.id);
        const hasBadge = section.items.some(i => i.type === 'link' && i.badge === 'ops-inbox');
        return (
        <div key={section.id} className="sidebar-section">
          {foldable ? (
            <button type="button" className="sidebar-section-label sidebar-section-toggle"
              aria-expanded={isOpen} onClick={() => toggle(section.id)}>
              <span className="sidebar-chevron" aria-hidden>{isOpen ? '▾' : '▸'}</span>
              {section.label}
              {!isOpen && hasBadge && <OpsInboxBadge />}
            </button>
          ) : (
            <div className="sidebar-section-label">{section.label}</div>
          )}
          {isOpen && section.items.map((item, i) => {
            if (item.type === 'disabled') {
              return (
                <span key={i} className="sidebar-link-disabled">
                  <span className="sidebar-icon">{item.icon}</span> {item.label}
                  <span className="sidebar-coming-soon">Soon</span>
                </span>
              );
            }
            if (item.type === 'ext') {
              return (
                <a key={item.href} href={item.href} target="_blank" rel="noreferrer" className="sidebar-link">
                  <span className="sidebar-icon">{item.icon}</span> {item.label}
                  <span className="sidebar-ext">↗</span>
                </a>
              );
            }
            return (
              <Link key={item.href} href={item.href} title={item.title}
                className={item.href === current?.href ? 'sidebar-link active' : 'sidebar-link'}
                aria-current={item.href === current?.href ? 'page' : undefined}>
                <span className="sidebar-icon">{item.icon}</span> {item.label}
                {item.badge === 'ops-inbox' && <OpsInboxBadge />}
              </Link>
            );
          })}
        </div>
        );
      })}
    </>
  );
}
