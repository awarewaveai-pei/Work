'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_SECTIONS, applyLayout, itemKey, type NavSection } from '@/app/SidebarNav';
import { COLOR_GROUPS, TYPOGRAPHY_GROUPS, type SavedLayout, type TokenGroup } from '@/lib/theme/tokens';

// Merge all groups for STATIC_DEFAULTS and API save
const ALL_GROUPS = [...COLOR_GROUPS, ...TYPOGRAPHY_GROUPS];

const STATIC_DEFAULTS: Record<string, string> = {};
ALL_GROUPS.forEach(g => g.tokens.forEach(t => { STATIC_DEFAULTS[t.name] = t.default; }));

type Tab = 'colors' | 'typography' | 'sidebar';

// ── Main page ───────────────────────────────────────────────────────────────
export default function ThemePage() {
  const router = useRouter();
  const [activeTab, setActiveTab]     = useState<Tab>('colors');
  const [serverDefaults, setServerDefaults] = useState<Record<string, string>>({ ...STATIC_DEFAULTS });
  const [values, setValues]           = useState<Record<string, string>>({ ...STATIC_DEFAULTS });
  const [sections, setSections]       = useState<NavSection[]>(DEFAULT_SECTIONS);
  const [expandedSec, setExpandedSec] = useState<string | null>(null);
  const [savedMsg, setSavedMsg]       = useState('');
  const [copiedMsg, setCopiedMsg]     = useState('');
  const [secDragIdx, setSecDragIdx]   = useState<number | null>(null);
  const [itemDragIdx, setItemDragIdx] = useState<number | null>(null);

  // Load the saved global theme (tokens + sidebar layout) from the server. The layout already
  // applied these on <html> before paint; this just syncs the editor's fields to the saved state.
  // Single source of truth = the server (DB). No localStorage.
  useEffect(() => {
    fetch('/api/theme')
      .then(r => r.ok ? r.json() : null)
      .then((data: { tokens?: Record<string, string>; layout?: SavedLayout | null } | null) => {
        if (data?.tokens) {
          const merged: Record<string, string> = {};
          ALL_GROUPS.forEach(g => g.tokens.forEach(t => {
            if (t.name in data.tokens!) merged[t.name] = data.tokens![t.name];
          }));
          setServerDefaults(prev => ({ ...prev, ...merged }));
          setValues(prev => ({ ...prev, ...merged }));
          Object.entries(merged).forEach(([k, v]) =>
            document.documentElement.style.setProperty(k, v));
        }
        if (data?.layout) {
          setSections(applyLayout(DEFAULT_SECTIONS, data.layout));
        }
      })
      .catch(() => { /* fail-open: editor shows static defaults */ });
  }, []);

  // ── Token handlers ──────────────────────────────────────────────────────
  const handleChange = useCallback((name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
    document.documentElement.style.setProperty(name, value);
    setSavedMsg('');
  }, []);

  const handleSave = async () => {
    if (changedCount === 0 && !orderChanged) {
      setSavedMsg('沒有變更'); setTimeout(() => setSavedMsg(''), 2000); return;
    }
    // Store only true overrides (diffs vs globals.css defaults) → minimal, correct DB row.
    const overrides: Record<string, string> = {};
    Object.entries(values).forEach(([k, v]) => { if (v !== STATIC_DEFAULTS[k]) overrides[k] = v; });

    const layout: SavedLayout = {
      sectionOrder: sections.map(s => s.id),
      itemOrders: Object.fromEntries(
        sections.map(sec => [sec.id, sec.items.map(itemKey)]),
      ),
    };

    setSavedMsg('儲存中…');
    try {
      const res = await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: overrides, layout }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'save_failed');
      setServerDefaults(prev => ({ ...prev, ...values }));
      setSavedMsg('✓ 已儲存（所有裝置）');
      router.refresh(); // re-render layout so the new theme + sidebar order apply from the DB
    } catch {
      setSavedMsg('✗ 儲存失敗');
    }
    setTimeout(() => setSavedMsg(''), 2500);
  };

  const handleReset = async () => {
    ALL_GROUPS.forEach(g => g.tokens.forEach(t => document.documentElement.style.removeProperty(t.name)));
    setValues({ ...STATIC_DEFAULTS });
    setServerDefaults({ ...STATIC_DEFAULTS });
    setSections(DEFAULT_SECTIONS);
    setSavedMsg('重設中…');
    try {
      const res = await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: {}, layout: null }),
      });
      if (!res.ok) throw new Error();
      setSavedMsg('✓ 已重設');
      router.refresh();
    } catch {
      setSavedMsg('✗ 重設失敗');
    }
    setTimeout(() => setSavedMsg(''), 2500);
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
    return sec.items.map(itemKey).join() !== def.items.map(itemKey).join();
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

          {/* Tab component live preview */}
          <TabPreview />

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
                ? sec.items.map(itemKey).join() !== def.items.map(itemKey).join()
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
                          key={itemKey(item)}
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
        <div style={{ fontWeight: 600, color: 'var(--ai-text)', marginBottom: 8, fontSize: 13 }}>儲存方式</div>
        <ol style={{ color: 'var(--ai-text)', fontSize: 13, lineHeight: 1.9, paddingLeft: 20 }}>
          <li>調整上方 token → 立即在整個 app 預覽（此時尚未儲存）。</li>
          <li><strong>Save</strong> 存到伺服器 → 你登入的<strong>所有裝置</strong>（筆電 / 桌機 / 旅行）開機都會套用同一套外觀。</li>
          <li><strong>Copy CSS</strong> → 手動備份 <code>:root &#123;…&#125;</code> 區塊。</li>
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

// ── Tab component live preview ────────────────────────────────────────────────
function TabPreview() {
  const [active, setActive] = useState(0);
  const DEMO_TABS = ['Overview', 'Settings', 'History', 'Disabled'];
  const DEMO_CONTENT = [
    'This is the Overview tab. Font size, weight, and colors are all controlled by --tab-* tokens above.',
    'Settings content goes here. The active tab uses --tab-color-active and --tab-border-active.',
    'History content. Hover a tab to see --tab-bg-hover and --tab-color-hover in action.',
    '',
  ];
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
        Tab Component — Live Preview
        <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', marginLeft: 8, letterSpacing: 0 }}>changes above reflect here instantly</span>
      </div>

      {/* Tab bar using .tab-bar + .tab + .tab--active classes */}
      <div className="tab-bar" style={{ marginBottom: 0 }}>
        {DEMO_TABS.map((label, i) => (
          <button
            key={label}
            className={`tab${i === active ? ' tab--active' : ''}`}
            onClick={() => i !== 3 && setActive(i)}
            style={i === 3 ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content panel */}
      <div style={{
        padding: '16px 18px',
        background: 'var(--bg-subtle)',
        border: '1px solid var(--tab-bar-border)',
        borderTop: 'none',
        borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
        fontSize: 'var(--font-size-sm)',
        color: 'var(--text-muted)',
        minHeight: 56,
      }}>
        {DEMO_CONTENT[active] || <em style={{ color: 'var(--text-muted)' }}>Tab is disabled</em>}
      </div>

      {/* Token reference */}
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[
          { label: 'inactive color', tok: '--tab-color' },
          { label: 'hover color',    tok: '--tab-color-hover' },
          { label: 'active color',   tok: '--tab-color-active' },
          { label: 'active border',  tok: '--tab-border-active' },
          { label: 'bar border',     tok: '--tab-bar-border' },
        ].map(({ label, tok }) => (
          <span key={tok} style={{
            fontSize: 10, fontFamily: 'monospace',
            padding: '2px 7px', borderRadius: 4,
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
            color: 'var(--text-muted)',
          }}>
            {label}: <span style={{ color: 'var(--text-primary)' }}>{tok}</span>
          </span>
        ))}
      </div>
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
