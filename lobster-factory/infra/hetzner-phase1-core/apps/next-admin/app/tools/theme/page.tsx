'use client';
import { useState, useEffect, useCallback } from 'react';

// ── Token definitions ───────────────────────────────────────────────────────
const TOKEN_GROUPS: Array<{
  label: string;
  tokens: Array<{ name: string; default: string; type: 'color' | 'text' }>;
}> = [
  {
    label: 'Brand',
    tokens: [
      { name: '--accent',           default: '#6366f1', type: 'color' },
      { name: '--accent-hover',     default: '#818cf8', type: 'color' },
      { name: '--btn-primary-bg',   default: '#6366f1', type: 'color' },
      { name: '--btn-primary-hover',default: '#4f52e0', type: 'color' },
      { name: '--btn-primary-text', default: '#ffffff', type: 'color' },
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
      { name: '--green',              default: '#10b981', type: 'color' },
      { name: '--red',                default: '#ef4444', type: 'color' },
      { name: '--yellow',             default: '#f59e0b', type: 'color' },
      { name: '--severity-critical',  default: '#dc2626', type: 'color' },
      { name: '--severity-high',      default: '#ea580c', type: 'color' },
      { name: '--severity-medium',    default: '#ca8a04', type: 'color' },
      { name: '--severity-low',       default: '#0284c7', type: 'color' },
      { name: '--status-resolved',    default: '#16a34a', type: 'color' },
      { name: '--status-ignored',     default: '#6b7280', type: 'color' },
    ],
  },
  {
    label: 'Borders & Radius',
    tokens: [
      { name: '--card-border',    default: '#e6eaf4', type: 'color' },
      { name: '--border',         default: '#e6eaf4', type: 'color' },
      { name: '--border-subtle',  default: '#e6eaf4', type: 'color' },
      { name: '--radius',         default: '12px',    type: 'text'  },
      { name: '--radius-sm',      default: '8px',     type: 'text'  },
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

const LS_KEY = 'aw-theme-overrides';

// ── Main page ───────────────────────────────────────────────────────────────
export default function ThemePage() {
  const [values, setValues] = useState<Record<string, string>>({ ...ALL_DEFAULTS });
  const [savedMsg, setSavedMsg]   = useState('');
  const [copiedMsg, setCopiedMsg] = useState('');

  // On mount: load localStorage overrides + apply to :root
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const overrides = JSON.parse(stored) as Record<string, string>;
        setValues(prev => ({ ...prev, ...overrides }));
        Object.entries(overrides).forEach(([k, v]) =>
          document.documentElement.style.setProperty(k, v)
        );
      }
    } catch {}
  }, []);

  const handleChange = useCallback((name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
    document.documentElement.style.setProperty(name, value);
    setSavedMsg('');
  }, []);

  const handleSave = () => {
    const overrides: Record<string, string> = {};
    Object.entries(values).forEach(([k, v]) => {
      if (v !== ALL_DEFAULTS[k]) overrides[k] = v;
    });
    localStorage.setItem(LS_KEY, JSON.stringify(overrides));
    setSavedMsg('✓ Saved');
    setTimeout(() => setSavedMsg(''), 2000);
  };

  const handleReset = () => {
    localStorage.removeItem(LS_KEY);
    TOKEN_GROUPS.forEach(g => g.tokens.forEach(t => {
      document.documentElement.style.removeProperty(t.name);
    }));
    setValues({ ...ALL_DEFAULTS });
    setSavedMsg('');
  };

  const handleCopy = () => {
    const lines = Object.entries(values)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n');
    const css = `:root {\n${lines}\n}`;
    navigator.clipboard.writeText(css).then(() => {
      setCopiedMsg('✓ Copied');
      setTimeout(() => setCopiedMsg(''), 2000);
    });
  };

  const changedCount = Object.entries(values).filter(([k, v]) => v !== ALL_DEFAULTS[k]).length;

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Theme Editor</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 13, margin: '4px 0 0' }}>
            Changes apply live.
            {changedCount > 0
              ? <span style={{ color: 'var(--accent)', marginLeft: 8 }}>{changedCount} token{changedCount > 1 ? 's' : ''} changed</span>
              : <span style={{ marginLeft: 8 }}>No changes from defaults.</span>
            }
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn-secondary" onClick={handleReset} style={{ fontSize: 13 }}>Reset defaults</button>
          <button className="btn-secondary" onClick={handleCopy} style={{ fontSize: 13 }}>{copiedMsg || 'Copy CSS'}</button>
          <button className="btn-primary" onClick={handleSave} style={{ fontSize: 13 }}>{savedMsg || 'Save to browser'}</button>
        </div>
      </div>

      {/* Token groups grid */}
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

      {/* Live preview */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
          Live Preview
        </div>

        {/* Buttons & badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <button className="btn-primary">Primary</button>
          <button className="btn-secondary">Secondary</button>
          {[
            { label: 'Success', bg: 'var(--green)' },
            { label: 'Error',   bg: 'var(--red)' },
            { label: 'Warning', bg: 'var(--yellow)' },
            { label: 'Critical', bg: 'var(--severity-critical)' },
            { label: 'AI',      bg: 'var(--ai-bg)', color: 'var(--ai-text)' },
          ].map(b => (
            <span key={b.label} style={{
              background: b.bg,
              color: b.color ?? '#fff',
              padding: '3px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              fontWeight: 500,
            }}>{b.label}</span>
          ))}
        </div>

        {/* Cards row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 'var(--radius)',
            padding: 16,
            flex: '1 1 200px',
          }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Card component</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Muted body text inside a card.</div>
          </div>

          <div style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 16,
            flex: '1 1 200px',
          }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Subtle surface</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Secondary text color.</div>
          </div>

          <div style={{
            background: 'var(--code-bg)',
            borderRadius: 'var(--radius)',
            padding: 16,
            flex: '1 1 200px',
          }}>
            <code style={{ color: '#4ade80', fontSize: 13 }}>$ code block bg</code>
          </div>
        </div>

        {/* Accent bar */}
        <div style={{
          marginTop: 14,
          height: 6,
          borderRadius: 3,
          background: `linear-gradient(90deg, var(--accent) 0%, var(--accent-hover) 100%)`,
        }} />
      </div>

      {/* Instructions */}
      <div className="card" style={{ padding: 20, background: 'var(--ai-bg)', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, color: 'var(--ai-text)', marginBottom: 8, fontSize: 13 }}>How to make changes permanent</div>
        <ol style={{ color: 'var(--ai-text)', fontSize: 13, lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Adjust tokens above — changes reflect live across the entire app.</li>
          <li>Click <strong>Copy CSS</strong> to get the full <code>:root &#123; … &#125;</code> block.</li>
          <li>Paste it into <code>app/globals.css</code> (replace the existing <code>:root</code> section).</li>
          <li><strong>Save to browser</strong> persists overrides locally until you clear localStorage.</li>
        </ol>
      </div>
    </div>
  );
}

// ── Token row component ─────────────────────────────────────────────────────
function TokenRow({
  name, type, value, defaultValue, changed, onChange,
}: {
  name: string;
  type: 'color' | 'text';
  value: string;
  defaultValue: string;
  changed: boolean;
  onChange: (name: string, value: string) => void;
}) {
  // For color type, try to use value as-is for the swatch; fallback to default
  const swatchColor = type === 'color' && value.startsWith('#') ? value : defaultValue;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {type === 'color' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 0, cursor: 'pointer', flexShrink: 0 }}>
          <span style={{
            display: 'inline-block',
            width: 28,
            height: 28,
            borderRadius: 6,
            background: swatchColor,
            border: '1px solid var(--border)',
            cursor: 'pointer',
            overflow: 'hidden',
            position: 'relative',
          }}>
            <input
              type="color"
              value={swatchColor}
              onChange={e => onChange(name, e.target.value)}
              style={{
                position: 'absolute', inset: 0,
                opacity: 0, width: '100%', height: '100%',
                cursor: 'pointer',
              }}
            />
          </span>
        </label>
      ) : (
        <span style={{ width: 28, flexShrink: 0 }} />
      )}

      <input
        type="text"
        value={value}
        onChange={e => onChange(name, e.target.value)}
        style={{
          width: type === 'color' ? 88 : 116,
          fontSize: 11,
          fontFamily: 'ui-monospace, Menlo, monospace',
          padding: '3px 7px',
          border: changed
            ? '1px solid var(--accent)'
            : '1px solid var(--border)',
          borderRadius: 5,
          color: 'var(--text-primary)',
          background: changed ? 'var(--accent-light)' : 'var(--bg-subtle)',
          outline: 'none',
          flexShrink: 0,
        }}
      />

      <span style={{
        fontSize: 11,
        fontFamily: 'ui-monospace, Menlo, monospace',
        color: changed ? 'var(--accent)' : 'var(--text-muted)',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {name}
      </span>

      {changed && (
        <button
          onClick={() => onChange(name, defaultValue)}
          title="Reset to default"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 14,
            padding: '0 2px',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >↺</button>
      )}
    </div>
  );
}
