'use client';
import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_SECTIONS, itemKey, type NavSection, type NavItem } from '../../SidebarNav';

// ── Token definitions ───────────────────────────────────────────────────────
type TokenDef = { name: string; default: string; type: 'color' | 'text' };
type TokenGroup = { label: string; tokens: TokenDef[] };

const COLOR_GROUPS: TokenGroup[] = [
  {
    label: 'Brand',
    tokens: [
      { name: '--accent',            default: '#6366f1', type: 'color' },
      { name: '--accent-hover',      default: '#818cf8', type: 'color' },
      { name: '--btn-primary-bg',    default: '#6366f1', type: 'color' },
      { name: '--btn-primary-hover', default: '#4f52e0', type: 'color' },
      { name: '--btn-primary-text',  default: '#ffffff', type: 'color' },
    ],
  },
  {
    label: 'Backgrounds',
    tokens: [
      { name: '--body-bg',   default: '#f2f5fb', type: 'color' },
      { name: '--card-bg',   default: '#ffffff',  type: 'color' },
      { name: '--bg-subtle', default: '#f5f7fd', type: 'color' },
      { name: '--bg-hover',  default: '#eef1f9', type: 'color' },
      { name: '--surface-2', default: '#f5f7fd', type: 'color' },
    ],
  },
  {
    label: 'Sidebar',
    tokens: [
      { name: '--sidebar-bg',          default: '#f7f9fc', type: 'color' },
      { name: '--sidebar-border',      default: '#e6eaf4', type: 'color' },
      { name: '--sidebar-text',        default: '#475569', type: 'color' },
      { name: '--sidebar-text-hover',  default: '#0d1526', type: 'color' },
      { name: '--sidebar-text-active', default: '#0d1526', type: 'color' },
      { name: '--sidebar-active-bar',  default: '#6366f1', type: 'color' },
    ],
  },
  {
    label: 'Status',
    tokens: [
      { name: '--green',             default: '#10b981', type: 'color' },
      { name: '--red',               default: '#ef4444', type: 'color' },
      { name: '--yellow',            default: '#f59e0b', type: 'color' },
      { name: '--severity-critical', default: '#dc2626', type: 'color' },
      { name: '--severity-high',     default: '#ea580c', type: 'color' },
      { name: '--severity-medium',   default: '#ca8a04', type: 'color' },
      { name: '--severity-low',      default: '#0284c7', type: 'color' },
      { name: '--status-resolved',   default: '#16a34a', type: 'color' },
      { name: '--status-ignored',    default: '#6b7280', type: 'color' },
    ],
  },
  {
    label: 'Borders & Radius',
    tokens: [
      { name: '--card-border',   default: '#e6eaf4', type: 'color' },
      { name: '--border',        default: '#e6eaf4', type: 'color' },
      { name: '--border-subtle', default: '#e6eaf4', type: 'color' },
      { name: '--radius',        default: '12px',    type: 'text'  },
      { name: '--radius-sm',     default: '8px',     type: 'text'  },
    ],
  },
  {
    label: 'Special',
    tokens: [
      { name: '--code-bg', default: '#07101f', type: 'color' },
      { name: '--ai-bg',   default: '#e0f2fe', type: 'color' },
      { name: '--ai-text', default: '#0369a1', type: 'color' },
    ],
  },
  {
    label: 'Button Secondary',
    tokens: [
      { name: '--btn-secondary-bg',     default: '#ffffff', type: 'color' },
      { name: '--btn-secondary-border', default: '#d4d9e8', type: 'color' },
      { name: '--btn-secondary-text',   default: '#0d1526', type: 'color' },
    ],
  },
];

const TYPOGRAPHY_GROUPS: TokenGroup[] = [
  {
    label: 'Font Sizes',
    tokens: [
      { name: '--font-size-xs',   default: '11px', type: 'text' },
      { name: '--font-size-sm',   default: '13px', type: 'text' },
      { name: '--font-size-base', default: '14px', type: 'text' },
      { name: '--font-size-md',   default: '15px', type: 'text' },
      { name: '--font-size-lg',   default: '17px', type: 'text' },
      { name: '--font-size-xl',   default: '22px', type: 'text' },
    ],
  },
  {
    label: 'Font Weights',
    tokens: [
      { name: '--font-weight-normal',   default: '400', type: 'text' },
      { name: '--font-weight-medium',   default: '500', type: 'text' },
      { name: '--font-weight-semibold', default: '600', type: 'text' },
      { name: '--font-weight-bold',     default: '700', type: 'text' },
      { name: '--font-weight-heavy',    default: '800', type: 'text' },
    ],
  },
  {
    label: 'Line Height & Spacing',
    tokens: [
      { name: '--line-height-base',    default: '1.6',    type: 'text' },
      { name: '--line-height-tight',   default: '1.3',    type: 'text' },
      { name: '--letter-spacing-label', default: '0.07em', type: 'text' },
    ],
  },
  {
    label: 'Text Colors',
    tokens: [
      { name: '--text-primary',   default: '#0d1526', type: 'color' },
      { name: '--text-muted',     default: '#64748b', type: 'color' },
      { name: '--text-secondary', default: '#64748b', type: 'color' },
    ],
  },
  {
    label: 'Backgrounds',
    tokens: [
      { name: '--body-bg',    default: '#f2f5fb', type: 'color' },
      { name: '--card-bg',    default: '#ffffff',  type: 'color' },
      { name: '--bg-subtle',  default: '#f5f7fd', type: 'color' },
      { name: '--sidebar-bg', default: '#f7f9fc', type: 'color' },
    ],
  },
];

// Merge all groups for STATIC_DEFAULTS and API save
const ALL_GROUPS = [...COLOR_GROUPS, ...TYPOGRAPHY_GROUPS];

const STATIC_DEFAULTS: Record<string, string> = {};
ALL_GROUPS.forEach(g => g.tokens.forEach(t => { STATIC_DEFAULTS[t.name] = t.default; }));

const LS_TOKENS_KEY = 'aw-theme-overrides';
const LS_ORDER_KEY  = 'aw-sidebar-order';

type Tab = 'colors' | 'typography' | 'sidebar';

interface SavedLayout {
  sectionOrder?: string[];
  itemOrders?: Record<string, string[]>;
}

function applyLayoutToSections(sections: NavSection[], layout: SavedLayout): NavSection[] {
  const map = new Map(sections.map(s => [s.id, s]));
  let ordered: NavSection[];
  if (layout.sectionOrder) {
    ordered = layout.sectionOrder.flatMap(id => map.has(id) ? [map.get(id)!] : []);
    sections.forEach(s => { if (!layout.sectionOrder!.includes(s.id)) ordered.push(s); });
  } else {
    ordered = [...sections];
  }
  if (layout.itemOrders) {
    return ordered.map(sec => {
      const itemOrder = layout.itemOrders![sec.id];
      if (!itemOrder) return sec;
      const itemMap = new Map(sec.items.map((item, i) => [itemKey(item, i), item]));
      const reordered = itemOrder.flatMap(k => itemMap.has(k) ? [itemMap.get(k)!] : []);
      sec.items.forEach((item, i) => { if (!itemOrder.includes(itemKey(item, i))) reordered.push(item); });
      return { ...sec, items: reordered };
    });
  }
  return ordered;
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function ThemePage() {
  const [activeTab, setActiveTab]     = useState<Tab>('colors');
  const [serverDefaults, setServerDefaults] = useState<Record<string, string>>({ ...STATIC_DEFAULTS });
  const [values, setValues]           = useState<Record<string, string>>({ ...STATIC_DEFAULTS });
  const [sections, setSections]       = useState<NavSection[]>(DEFAULT_SECTIONS);
  const [expandedSec, setExpandedSec] = useState<string | null>(null);
  const [savedMsg, setSavedMsg]       = useState('');
  const [copiedMsg, setCopiedMsg]     = useState('');
  const [secDragIdx, setSecDragIdx]   = useState<number | null>(null);
  const [itemDragIdx, setItemDragIdx] = useState<number | null>(null);

  // Fetch real token values from globals.css on mount.
  useEffect(() => {
    fetch('/api/theme')
      .then(r => r.ok ? r.json() : null)
      .then((data: { tokens?: Record<string, string> } | null) => {
        if (data?.tokens) {
          const relevant: Record<string, string> = {};
          ALL_GROUPS.forEach(g =>
            g.tokens.forEach(t => {
              if (t.name in data.tokens!) relevant[t.name] = data.tokens![t.name];
            })
          );
          setServerDefaults(prev => ({ ...prev, ...relevant }));
          setValues(prev => ({ ...prev, ...relevant }));
          Object.entries(relevant).forEach(([k, v]) =>
            document.documentElement.style.setProperty(k, v)
          );
        }
      })
      .catch(() => { /* use STATIC_DEFAULTS */ });
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_TOKENS_KEY);
      if (stored) {
        const overrides = JSON.parse(stored) as Record<string, string>;
        setValues(prev => ({ ...prev, ...overrides }));
        Object.entries(overrides).forEach(([k, v]) =>
          document.documentElement.style.setProperty(k, v)
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_ORDER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const layout: SavedLayout = Array.isArray(parsed) ? { sectionOrder: parsed } : parsed;
        setSections(applyLayoutToSections(DEFAULT_SECTIONS, layout));
      }
    } catch {}
  }, []);

  // ── Token handlers ──────────────────────────────────────────────────────
  const handleChange = useCallback((name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
    document.documentElement.style.setProperty(name, value);
    setSavedMsg('');
  }, []);

  const handleSave = async () => {
    const overrides: Record<string, string> = {};
    Object.entries(values).forEach(([k, v]) => { if (v !== serverDefaults[k]) overrides[k] = v; });
    localStorage.setItem(LS_TOKENS_KEY, JSON.stringify(overrides));

    const layout: SavedLayout = {
      sectionOrder: sections.map(s => s.id),
      itemOrders: Object.fromEntries(
        sections.map(sec => [sec.id, sec.items.map((item, i) => itemKey(item, i))])
      ),
    };
    const layoutJson = JSON.stringify(layout);
    localStorage.setItem(LS_ORDER_KEY, layoutJson);
    window.dispatchEvent(new StorageEvent('storage', { key: LS_ORDER_KEY, newValue: layoutJson }));

    const tokenPayload: Record<string, string> = {};
    ALL_GROUPS.forEach(g => g.tokens.forEach(t => {
      if (t.name in values) tokenPayload[t.name] = values[t.name];
    }));

    try {
      const res = await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: tokenPayload }),
      });
      if (res.ok) {
        setServerDefaults(prev => ({ ...prev, ...tokenPayload }));
        setSavedMsg('✓ Saved to globals.css');
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setSavedMsg(`✗ API error: ${err.error ?? res.status}`);
      }
    } catch (e) {
      setSavedMsg(`✗ ${(e as Error).message}`);
    }
    setTimeout(() => setSavedMsg(''), 3000);
  };

  const handleReset = () => {
    localStorage.removeItem(LS_TOKENS_KEY);
    localStorage.removeItem(LS_ORDER_KEY);
    ALL_GROUPS.forEach(g => g.tokens.forEach(t => document.documentElement.style.removeProperty(t.name)));
    setValues({ ...serverDefaults });
    setSections(DEFAULT_SECTIONS);
    setSavedMsg('');
  };

  const handleCopy = () => {
    const lines = Object.entries(values).map(([k, v]) => `  ${k}: ${v};`).join('\n');
    navigator.clipboard.writeText(`:root {\n${lines}\n}`)
      .then(() => { setCopiedMsg('✓ Copied'); setTimeout(() => setCopiedMsg(''), 2000); })
      .catch(() => { setCopiedMsg('✗ Failed');  setTimeout(() => setCopiedMsg(''), 2000); });
  };

  // ── Section drag ────────────────────────────────────────────────────────
  const moveSection = (from: number, to: number) => {
    setSections(prev => { const n = [...prev]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; });
    setSavedMsg('');
  };

  // ── Item drag ────────────────────────────────────────────────────────────
  const moveItem = (secId: string, from: number, to: number) => {
    setSections(prev => prev.map(sec => {
      if (sec.id !== secId) return sec;
      const items = [...sec.items];
      const [x] = items.splice(from, 1);
      items.splice(to, 0, x);
      return { ...sec, items };
    }));
    setSavedMsg('');
  };

  const changedCount = Object.entries(values).filter(([k, v]) => v !== serverDefaults[k]).length;
  const sectionOrderChanged = sections.map(s => s.id).join() !== DEFAULT_SECTIONS.map(s => s.id).join();
  const itemOrderChanged = sections.some(sec => {
    const def = DEFAULT_SECTIONS.find(d => d.id === sec.id);
    if (!def) return false;
    return sec.items.map((it, i) => itemKey(it, i)).join() !== def.items.map((it, i) => itemKey(it, i)).join();
  });
  const orderChanged = sectionOrderChanged || itemOrderChanged;

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'colors',     label: 'Colors',     badge: changedCount > 0 ? changedCount : undefined },
    { id: 'typography', label: 'Typography' },
    { id: 'sidebar',    label: 'Sidebar',    badge: orderChanged ? 1 : undefined },
  ];

  return (
    <div className="page">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Theme Editor</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 13 }}>
            Changes apply live across the whole app.
            {(changedCount > 0 || orderChanged) && (
              <span style={{ color: 'var(--accent)', marginLeft: 8 }}>
                {[
                  changedCount > 0 && `${changedCount} token${changedCount > 1 ? 's' : ''} changed`,
                  orderChanged && 'order changed',
                ].filter(Boolean).join(' · ')}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn-secondary" onClick={handleReset}  style={{ fontSize: 13 }}>Reset all</button>
          <button className="btn-secondary" onClick={handleCopy}   style={{ fontSize: 13 }}>{copiedMsg || 'Copy CSS'}</button>
          <button className="btn-primary"   onClick={handleSave}   style={{ fontSize: 13 }}>{savedMsg  || 'Save'}</button>
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 20,
        borderBottom: '2px solid var(--border)',
        paddingBottom: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '8px 16px',
              fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2, borderRadius: '6px 6px 0 0',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span style={{
                background: 'var(--accent)', color: '#fff',
                borderRadius: 10, fontSize: 10, fontWeight: 700,
                padding: '1px 6px', lineHeight: '14px',
              }}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Colors tab ──────────────────────────────────────────────── */}
      {activeTab === 'colors' && (
        <>
          {/* Quick Colors */}
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
              Quick Colors
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Page background', name: '--body-bg' },
                { label: 'Sidebar background', name: '--sidebar-bg' },
                { label: 'Card background', name: '--card-bg' },
                { label: 'Accent / Brand', name: '--accent' },
                { label: 'Primary text', name: '--text-primary' },
              ].map(({ label, name }) => (
                <BigSwatch
                  key={name}
                  label={label}
                  name={name}
                  value={values[name] ?? serverDefaults[name]}
                  defaultValue={serverDefaults[name]}
                  onChange={handleChange}
                />
              ))}
            </div>
          </div>

          {/* Token groups grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16, marginBottom: 24 }}>
            {COLOR_GROUPS.map(group => (
              <TokenGroupCard
                key={group.label}
                group={group}
                values={values}
                serverDefaults={serverDefaults}
                onChange={handleChange}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Typography tab ──────────────────────────────────────────── */}
      {activeTab === 'typography' && (
        <>
          {/* Quick preview */}
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
              Live Preview
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: '--font-size-xl',  weight: '--font-weight-heavy',    text: 'Heading XL' },
                { label: '--font-size-lg',  weight: '--font-weight-bold',     text: 'Heading LG' },
                { label: '--font-size-md',  weight: '--font-weight-semibold', text: 'Heading MD' },
                { label: '--font-size-base',weight: '--font-weight-normal',   text: 'Body base text — regular weight' },
                { label: '--font-size-sm',  weight: '--font-weight-normal',   text: 'Small text — secondary label' },
                { label: '--font-size-xs',  weight: '--font-weight-medium',   text: 'XS caption text' },
              ].map(row => (
                <span key={row.label} style={{
                  fontSize: `var(${row.label})`,
                  fontWeight: `var(${row.weight})`,
                  color: 'var(--text-primary)',
                  lineHeight: `var(--line-height-base)`,
                }}>{row.text}</span>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)' }}>Primary</span>
              <span style={{ color: 'var(--text-muted)',   fontSize: 'var(--font-size-sm)' }}>Muted</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>Secondary</span>
            </div>
          </div>

          {/* Typography token groups */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16, marginBottom: 24 }}>
            {TYPOGRAPHY_GROUPS.map(group => (
              <TokenGroupCard
                key={group.label}
                group={group}
                values={values}
                serverDefaults={serverDefaults}
                onChange={handleChange}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Sidebar tab ─────────────────────────────────────────────── */}
      {activeTab === 'sidebar' && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
            Sidebar Menu Order
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', marginLeft: 8, letterSpacing: 0 }}>drag · or ↑↓ · click section to reorder items</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 480 }}>
            {sections.map((sec, si) => {
              const isExpanded = expandedSec === sec.id;
              const def = DEFAULT_SECTIONS.find(d => d.id === sec.id);
              const secItemsChanged = def
                ? sec.items.map((it, i) => itemKey(it, i)).join() !== def.items.map((it, i) => itemKey(it, i)).join()
                : false;

              return (
                <div key={sec.id}>
                  <div
                    draggable
                    onDragStart={() => setSecDragIdx(si)}
                    onDragOver={e => { e.preventDefault(); if (secDragIdx !== null && secDragIdx !== si) { moveSection(secDragIdx, si); setSecDragIdx(si); } }}
                    onDragEnd={() => setSecDragIdx(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px',
                      background: secDragIdx === si || isExpanded ? 'var(--accent-light)' : 'var(--bg-subtle)',
                      border: `1px solid ${secDragIdx === si || isExpanded ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: isExpanded ? '8px 8px 0 0' : 'var(--radius-sm)',
                      cursor: 'grab', userSelect: 'none',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>⠿</span>
                    <button
                      onClick={() => setExpandedSec(isExpanded ? null : sec.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}
                    >
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{sec.label}</span>
                      {secItemsChanged && <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-light)', padding: '1px 5px', borderRadius: 4 }}>edited</span>}
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 2 }}>{sec.items.length} items</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{isExpanded ? '▲' : '▼'}</span>
                    </button>
                    <ArrowBtns i={si} total={sections.length} onUp={() => moveSection(si, si - 1)} onDown={() => moveSection(si, si + 1)} />
                  </div>

                  {isExpanded && (
                    <div style={{
                      border: '1px solid var(--accent)', borderTop: 'none',
                      borderRadius: '0 0 8px 8px', padding: '8px 10px',
                      background: 'var(--card-bg)',
                      display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                      {sec.items.map((item, ii) => (
                        <div
                          key={itemKey(item, ii)}
                          draggable
                          onDragStart={() => setItemDragIdx(ii)}
                          onDragOver={e => { e.preventDefault(); if (itemDragIdx !== null && itemDragIdx !== ii) { moveItem(sec.id, itemDragIdx, ii); setItemDragIdx(ii); } }}
                          onDragEnd={() => setItemDragIdx(null)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '5px 8px',
                            background: itemDragIdx === ii ? 'var(--accent-light)' : 'var(--bg-subtle)',
                            border: `1px solid ${itemDragIdx === ii ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: 6, cursor: 'grab', userSelect: 'none',
                          }}
                        >
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>⠿</span>
                          <span style={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</span>
                          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)' }}>{item.label}</span>
                          {'href' in item && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.href}</span>
                          )}
                          <ArrowBtns i={ii} total={sec.items.length} onUp={() => moveItem(sec.id, ii, ii - 1)} onDown={() => moveItem(sec.id, ii, ii + 1)} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Instructions ────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 20, background: 'var(--ai-bg)', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, color: 'var(--ai-text)', marginBottom: 8, fontSize: 13 }}>Make changes permanent</div>
        <ol style={{ color: 'var(--ai-text)', fontSize: 13, lineHeight: 1.9, paddingLeft: 20 }}>
          <li>Adjust tokens above → live across the whole app instantly.</li>
          <li><strong>Save</strong> writes to <code>app/globals.css</code> (permanent for all users) <em>and</em> localStorage.</li>
          <li><strong>Copy CSS</strong> → manual backup of the <code>:root &#123;…&#125;</code> block.</li>
        </ol>
      </div>
    </div>
  );
}

// ── Shared token group card ─────────────────────────────────────────────────
function TokenGroupCard({ group, values, serverDefaults, onChange }: {
  group: TokenGroup;
  values: Record<string, string>;
  serverDefaults: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
        {group.label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {group.tokens.map(token => {
          const def = serverDefaults[token.name] ?? token.default;
          const changed = values[token.name] !== def;
          return (
            <TokenRow
              key={token.name}
              name={token.name}
              type={token.type}
              value={values[token.name] ?? def}
              defaultValue={def}
              changed={changed}
              onChange={onChange}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Big swatch ───────────────────────────────────────────────────────────────
function BigSwatch({ label, name, value, defaultValue, onChange }: {
  label: string; name: string; value: string; defaultValue: string;
  onChange: (name: string, val: string) => void;
}) {
  const changed = value !== defaultValue;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', minWidth: 88 }}>
      <label style={{ cursor: 'pointer', position: 'relative' }}>
        <span style={{
          display: 'block', width: 72, height: 48, borderRadius: 'var(--radius-sm)',
          background: value,
          border: changed ? '2px solid var(--accent)' : '1px solid var(--border)',
          boxShadow: changed ? 'var(--shadow-hover)' : 'none',
          transition: 'box-shadow 0.15s',
        }} />
        <input type="color" value={value.startsWith('#') ? value : defaultValue}
          onChange={e => onChange(name, e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
        />
      </label>
      <input type="text" value={value} onChange={e => onChange(name, e.target.value)}
        style={{
          width: 72, fontSize: 10, fontFamily: 'ui-monospace, Menlo, monospace',
          textAlign: 'center', padding: '2px 4px',
          border: changed ? '1px solid var(--accent)' : '1px solid var(--border)',
          borderRadius: 4, background: changed ? 'var(--accent-light)' : 'var(--bg-subtle)',
          color: 'var(--text-primary)', outline: 'none',
        }}
      />
      <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
      {changed && (
        <button onClick={() => onChange(name, defaultValue)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: 0 }}>
          ↺ reset
        </button>
      )}
    </div>
  );
}

// ── Token row ────────────────────────────────────────────────────────────────
function TokenRow({ name, type, value, defaultValue, changed, onChange }: {
  name: string; type: 'color' | 'text'; value: string; defaultValue: string;
  changed: boolean; onChange: (name: string, value: string) => void;
}) {
  const swatchColor = type === 'color' && value.startsWith('#') ? value : defaultValue;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {type === 'color' ? (
        <label style={{ cursor: 'pointer', flexShrink: 0, position: 'relative' }}>
          <span style={{
            display: 'inline-block', width: 28, height: 28, borderRadius: 6,
            background: swatchColor, border: '1px solid var(--border)', overflow: 'hidden',
          }}>
            <input type="color" value={swatchColor} onChange={e => onChange(name, e.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
            />
          </span>
        </label>
      ) : (
        <span style={{ width: 28, flexShrink: 0 }} />
      )}
      <input type="text" value={value} onChange={e => onChange(name, e.target.value)}
        style={{
          width: type === 'color' ? 88 : 120, fontSize: 11,
          fontFamily: 'ui-monospace, Menlo, monospace',
          padding: '3px 7px',
          border: changed ? '1px solid var(--accent)' : '1px solid var(--border)',
          borderRadius: 5, color: 'var(--text-primary)',
          background: changed ? 'var(--accent-light)' : 'var(--bg-subtle)',
          outline: 'none', flexShrink: 0,
        }}
      />
      <span style={{
        fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace',
        color: changed ? 'var(--accent)' : 'var(--text-muted)',
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{name}</span>
      {changed && (
        <button onClick={() => onChange(name, defaultValue)}
          title="Reset to default"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>↺</button>
      )}
    </div>
  );
}

// ── ArrowBtns ─────────────────────────────────────────────────────────────────
function ArrowBtns({ i, total, onUp, onDown }: { i: number; total: number; onUp: () => void; onDown: () => void }) {
  return (
    <>
      <button onClick={e => { e.stopPropagation(); onUp(); }} disabled={i === 0}
        style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'var(--border)' : 'var(--text-muted)', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>↑</button>
      <button onClick={e => { e.stopPropagation(); onDown(); }} disabled={i === total - 1}
        style={{ background: 'none', border: 'none', cursor: i === total - 1 ? 'default' : 'pointer', color: i === total - 1 ? 'var(--border)' : 'var(--text-muted)', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>↓</button>
    </>
  );
}
