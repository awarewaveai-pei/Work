'use client';
import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_SECTIONS, itemKey, type NavSection, type NavItem } from '../../SidebarNav';

// ── Token definitions ───────────────────────────────────────────────────────
const TOKEN_GROUPS: Array<{
  label: string;
  tokens: Array<{ name: string; default: string; type: 'color' | 'text' }>;
}> = [
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
    label: 'Text',
    tokens: [
      { name: '--text-primary',   default: '#0d1526', type: 'color' },
      { name: '--text-muted',     default: '#64748b', type: 'color' },
      { name: '--text-secondary', default: '#64748b', type: 'color' },
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

const ALL_DEFAULTS: Record<string, string> = {};
TOKEN_GROUPS.forEach(g => g.tokens.forEach(t => { ALL_DEFAULTS[t.name] = t.default; }));

const LS_TOKENS_KEY = 'aw-theme-overrides';
const LS_ORDER_KEY  = 'aw-sidebar-order';

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
  const [values, setValues]       = useState<Record<string, string>>({ ...ALL_DEFAULTS });
  const [sections, setSections]   = useState<NavSection[]>(DEFAULT_SECTIONS);
  const [expandedSec, setExpandedSec] = useState<string | null>(null);
  const [savedMsg, setSavedMsg]   = useState('');
  const [copiedMsg, setCopiedMsg] = useState('');
  const [secDragIdx, setSecDragIdx]   = useState<number | null>(null);
  const [itemDragIdx, setItemDragIdx] = useState<number | null>(null);

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
        // Migrate legacy shape: was string[] (section IDs only)
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

  const handleSave = () => {
    const overrides: Record<string, string> = {};
    Object.entries(values).forEach(([k, v]) => { if (v !== ALL_DEFAULTS[k]) overrides[k] = v; });
    localStorage.setItem(LS_TOKENS_KEY, JSON.stringify(overrides));

    const layout: SavedLayout = {
      sectionOrder: sections.map(s => s.id),
      itemOrders: Object.fromEntries(
        sections.map(sec => [
          sec.id,
          sec.items.map((item, i) => itemKey(item, i)),
        ])
      ),
    };
    const layoutJson = JSON.stringify(layout);
    localStorage.setItem(LS_ORDER_KEY, layoutJson);
    window.dispatchEvent(new StorageEvent('storage', { key: LS_ORDER_KEY, newValue: layoutJson }));

    setSavedMsg('✓ Saved');
    setTimeout(() => setSavedMsg(''), 2000);
  };

  const handleReset = () => {
    localStorage.removeItem(LS_TOKENS_KEY);
    localStorage.removeItem(LS_ORDER_KEY);
    TOKEN_GROUPS.forEach(g => g.tokens.forEach(t => document.documentElement.style.removeProperty(t.name)));
    setValues({ ...ALL_DEFAULTS });
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

  // ── Item drag (within a section) ────────────────────────────────────────
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

  const changedCount = Object.entries(values).filter(([k, v]) => v !== ALL_DEFAULTS[k]).length;
  const sectionOrderChanged = sections.map(s => s.id).join() !== DEFAULT_SECTIONS.map(s => s.id).join();
  const itemOrderChanged = sections.some(sec => {
    const def = DEFAULT_SECTIONS.find(d => d.id === sec.id);
    if (!def) return false;
    return sec.items.map((it, i) => itemKey(it, i)).join() !== def.items.map((it, i) => itemKey(it, i)).join();
  });
  const orderChanged = sectionOrderChanged || itemOrderChanged;

  return (
    <div className="page">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Theme Editor</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 13 }}>
            Changes apply live.
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

      {/* ── Quick Colors ────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          Quick Colors
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <BigSwatch
            label="Page background"
            name="--body-bg"
            value={values['--body-bg'] ?? ALL_DEFAULTS['--body-bg']}
            defaultValue={ALL_DEFAULTS['--body-bg']}
            onChange={handleChange}
          />
          <BigSwatch
            label="Sidebar background"
            name="--sidebar-bg"
            value={values['--sidebar-bg'] ?? ALL_DEFAULTS['--sidebar-bg']}
            defaultValue={ALL_DEFAULTS['--sidebar-bg']}
            onChange={handleChange}
          />
          <BigSwatch
            label="Card background"
            name="--card-bg"
            value={values['--card-bg'] ?? ALL_DEFAULTS['--card-bg']}
            defaultValue={ALL_DEFAULTS['--card-bg']}
            onChange={handleChange}
          />
          <BigSwatch
            label="Accent / Brand"
            name="--accent"
            value={values['--accent'] ?? ALL_DEFAULTS['--accent']}
            defaultValue={ALL_DEFAULTS['--accent']}
            onChange={handleChange}
          />
          <BigSwatch
            label="Primary text"
            name="--text-primary"
            value={values['--text-primary'] ?? ALL_DEFAULTS['--text-primary']}
            defaultValue={ALL_DEFAULTS['--text-primary']}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* ── Sidebar order ───────────────────────────────────────────── */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          Sidebar Menu Order
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', marginLeft: 8, letterSpacing: 0 }}>drag · or ↑↓ · click section to reorder items</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 420 }}>
          {sections.map((sec, si) => {
            const isExpanded = expandedSec === sec.id;
            const def = DEFAULT_SECTIONS.find(d => d.id === sec.id);
            const secItemsChanged = def
              ? sec.items.map((it, i) => itemKey(it, i)).join() !== def.items.map((it, i) => itemKey(it, i)).join()
              : false;

            return (
              <div key={sec.id}>
                {/* Section row */}
                <div
                  draggable
                  onDragStart={() => setSecDragIdx(si)}
                  onDragOver={e => { e.preventDefault(); if (secDragIdx !== null && secDragIdx !== si) { moveSection(secDragIdx, si); setSecDragIdx(si); } }}
                  onDragEnd={() => setSecDragIdx(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px',
                    background: secDragIdx === si ? 'var(--accent-light)' : isExpanded ? 'var(--accent-light)' : 'var(--bg-subtle)',
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

                {/* Items panel */}
                {isExpanded && (
                  <div style={{
                    border: '1px solid var(--accent)', borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    padding: '8px 10px',
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

      {/* ── Token groups grid ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16, marginBottom: 24 }}>
        {TOKEN_GROUPS.map(group => (
          <div key={group.label} className="card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.tokens.map(token => {
                const changed = values[token.name] !== token.default;
                return (
                  <TokenRow
                    key={token.name}
                    name={token.name}
                    type={token.type}
                    value={values[token.name] ?? token.default}
                    defaultValue={token.default}
                    changed={changed}
                    onChange={handleChange}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Live preview ────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
          Live Preview
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <button className="btn-primary">Primary</button>
          <button className="btn-secondary">Secondary</button>
          {[
            { label: 'Success',  bg: 'var(--green)' },
            { label: 'Error',    bg: 'var(--red)' },
            { label: 'Warning',  bg: 'var(--yellow)' },
            { label: 'Critical', bg: 'var(--severity-critical)' },
            { label: 'AI',       bg: 'var(--ai-bg)', color: 'var(--ai-text)' },
          ].map(b => (
            <span key={b.label} style={{
              background: b.bg, color: b.color ?? '#fff',
              padding: '3px 10px', borderRadius: 'var(--radius-sm)',
              fontSize: 12, fontWeight: 500,
            }}>{b.label}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', padding: 16, flex: '1 1 180px' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Card</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Muted body text inside a card.</div>
          </div>
          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, flex: '1 1 180px' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Subtle surface</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Secondary text.</div>
          </div>
          <div style={{ background: 'var(--code-bg)', borderRadius: 'var(--radius)', padding: 16, flex: '1 1 180px' }}>
            <code style={{ color: '#4ade80', fontSize: 13 }}>$ code block</code>
          </div>
        </div>
        <div style={{ marginTop: 14, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent-hover) 100%)' }} />
      </div>

      {/* ── Instructions ────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 20, background: 'var(--ai-bg)', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, color: 'var(--ai-text)', marginBottom: 8, fontSize: 13 }}>Make changes permanent</div>
        <ol style={{ color: 'var(--ai-text)', fontSize: 13, lineHeight: 1.9, paddingLeft: 20 }}>
          <li>Adjust above → live across the whole app.</li>
          <li><strong>Save</strong> persists to this browser (localStorage).</li>
          <li><strong>Copy CSS</strong> → paste the <code>:root &#123;…&#125;</code> block into <code>app/globals.css</code> to make it permanent for everyone.</li>
        </ol>
      </div>
    </div>
  );
}

// ── Big swatch (Quick Colors) ───────────────────────────────────────────────
function BigSwatch({ label, name, value, defaultValue, onChange }: {
  label: string; name: string; value: string; defaultValue: string;
  onChange: (name: string, val: string) => void;
}) {
  const changed = value !== defaultValue;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', minWidth: 88 }}>
      <label style={{ cursor: 'pointer', position: 'relative' }}>
        <span style={{
          display: 'block', width: 72, height: 48,
          borderRadius: 'var(--radius-sm)',
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

// ── Token row ───────────────────────────────────────────────────────────────
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
          width: type === 'color' ? 88 : 116, fontSize: 11,
          fontFamily: 'ui-monospace, Menlo, monospace',
          padding: '3px 7px',
          border: changed ? '1px solid var(--accent)' : '1px solid var(--border)',
          borderRadius: 5,
          color: 'var(--text-primary)',
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

// ── ArrowBtns ────────────────────────────────────────────────────────────────
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
