'use client';
// The one left menu (blueprint §9.1, CLIENT-CONTEXT-PLAN K5): the staff console's sections (sidebar-sections.ts, saved order,
// tool grant) and a product door's pages (registry door.nav, ADR 018 §2) -- same component, the markup and
// classes each frame had before (.sidebar-* / .door-*), so neither looks different. Every internal link keeps the
// URL's current org / site (ADR 020, withContext); a page that does not register a layer ignores them. External links
// carry nothing.
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { SavedLayout } from '../lib/theme/tokens';
import { DEFAULT_SECTIONS, activeLink, applyLayout, visibleSections } from './sidebar-sections';
import { useDoorNav } from './DoorContext';
import { normalizeQuery, withContext } from '@/lib/client-context/contract';

export type NavRailProps =
  | {
      kind: 'staff';
      /** Saved sidebar order, fetched server-side from the DB (identical on every device, no client storage). */
      initialLayout?: SavedLayout | null;
      /** Item keys a restricted staff member may open (their tool grant); null = unrestricted. */
      visible?: string[] | null;
      /** The ops-inbox count (OpsInboxBadge), built by the staff layout: it calls a staff API, so the doors' graph must
       *  not import it. */
      inboxBadge?: ReactNode;
    }
  | {
      kind: 'door';
      page: string;
      name: string;
    };

/** The URL's current org / site, as withContext takes them (undefined = leave the link alone). */
function useCarry(): (href: string) => string {
  const sp = useSearchParams();
  const q = normalizeQuery(new URLSearchParams(sp?.toString() ?? ''));
  return (href) => (q.org || q.site ? withContext(href, { org: q.org ?? undefined, site: q.site ?? undefined }) : href);
}

export function NavRail(props: NavRailProps) {
  return props.kind === 'staff' ? <StaffRail {...props} /> : <DoorRail {...props} />;
}

// Staff: sections start collapsed except the current page's one; open/closed lives in state, which survives navigation
// (the layout stays mounted) and resets on reload.
function StaffRail({ initialLayout, visible = null, inboxBadge = null }: Extract<NavRailProps, { kind: 'staff' }>) {
  const ordered = initialLayout ? applyLayout(DEFAULT_SECTIONS, initialLayout) : DEFAULT_SECTIONS;
  const sections = visible ? visibleSections(ordered, href => visible.includes(href)) : ordered;
  const pathname = usePathname() ?? '/';
  const carry = useCarry();
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
              {!isOpen && hasBadge && inboxBadge}
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
            if (item.newTab) {
              return (
                <a key={item.href} href={carry(item.href)} title={item.title} target="_blank" rel="noopener" className="sidebar-link">
                  <span className="sidebar-icon">{item.icon}</span> {item.label}
                  <span className="sidebar-ext">↗</span>
                </a>
              );
            }
            return (
              <Link key={item.href} href={carry(item.href)} title={item.title}
                className={`sidebar-link${item.under ? ' sub' : ''}${item.href === current?.href ? ' active' : ''}`}
                aria-current={item.href === current?.href ? 'page' : undefined}>
                <span className="sidebar-icon">{item.icon}</span> {item.label}
                {item.badge === 'ops-inbox' && inboxBadge}
              </Link>
            );
          })}
        </div>
        );
      })}
    </>
  );
}

// Door: the product name and its pages (door.nav links are door-relative and middleware serves them under the door's page
// prefix, so either spelling of the current path marks the active item). No feature list here (blueprint §15A: it repeated
// the page's own buttons); what is held shows on 我的工具 cards and on each button, and the API still asks can().
function DoorRail({ page, name }: Extract<NavRailProps, { kind: 'door' }>) {
  const nav = useDoorNav();
  const pathname = usePathname() ?? '/';
  const carry = useCarry();
  return (
    <aside className="door-side">
      <div className="door-side-title">{name}</div>
      {nav.length > 0 ? (
        <nav className="door-nav">
          {nav.map((n) => {
            const href = `/${n.path}`;
            const active = pathname === href || pathname === (n.path ? `${page}/${n.path}` : page);
            return <a key={n.path} href={carry(href)} className={`door-nav-link${n.under !== undefined ? " sub" : ""}${active ? " active" : ""}`}>{n.name}</a>;
          })}
        </nav>
      ) : null}
    </aside>
  );
}
