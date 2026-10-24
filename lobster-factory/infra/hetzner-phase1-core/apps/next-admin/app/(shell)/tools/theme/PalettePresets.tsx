'use client';
import { useState } from 'react';
import { PALETTES, type Palette } from '@/lib/theme/palettes';
import { allRoleMaps, paletteToTokens, ROLE_KEYS, type Roles } from '@/lib/theme/palette-derive';

// Operator 2026-10-25: a palette fills the color tokens in one click, starting from the arrangement
// picked in the preview; Shuffle walks all 24 arrangements and a color button swaps two roles.
// It only sets editor values — Save still decides what reaches the DB.

const ROLE_LABEL: Record<(typeof ROLE_KEYS)[number], string> = {
  bg: 'Page', sidebar: 'Sidebar', accent: 'Button', soft: 'AI box',
};
const lower = (r: Roles): Roles => ({ bg: r.bg.toLowerCase(), sidebar: r.sidebar.toLowerCase(), accent: r.accent.toLowerCase(), soft: r.soft.toLowerCase() });
const keyOf = (r: Roles) => ROLE_KEYS.map(k => r[k]).join();

export default function PalettePresets({ onApply }: { onApply: (tokens: Record<string, string>) => void }) {
  const [palette, setPalette] = useState<Palette | null>(null);
  const [roles, setRoles] = useState<Roles | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());

  const apply = (p: Palette, r: Roles) => {
    setPalette(p);
    setRoles(r);
    setSeen(prev => new Set(prev).add(keyOf(r)));
    onApply(paletteToTokens(p.colors, r).tokens);
  };

  const pickPalette = (p: Palette) => { setSeen(new Set()); apply(p, lower(p.start)); };

  const shuffle = () => {
    if (!palette || !roles) return;
    const all = allRoleMaps(palette.colors).filter(r => keyOf(r) !== keyOf(roles));
    const fresh = all.filter(r => !seen.has(keyOf(r)));
    const pool = fresh.length ? fresh : all;
    if (!fresh.length) setSeen(new Set());
    apply(palette, pool[Math.floor(Math.random() * pool.length)]);
  };

  // Give `role` the color `c`; whichever role had `c` takes this role's old color.
  const swap = (role: (typeof ROLE_KEYS)[number], c: string) => {
    if (!palette || !roles || roles[role] === c) return;
    const other = ROLE_KEYS.find(k => roles[k] === c)!;
    apply(palette, { ...roles, [role]: c, [other]: roles[role] });
  };

  const derived = palette && roles ? paletteToTokens(palette.colors, roles) : null;

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        Palettes
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-muted)' }}>
        Pick a palette to fill every color below. Text stays black, white or grey. Press Save to keep it.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 8 }}>
        {PALETTES.map(p => {
          const on = palette?.id === p.id;
          return (
            <button key={p.id} type="button" onClick={() => pickPalette(p)} aria-pressed={on} title={p.colors.join(' ')}
              style={{
                display: 'grid', gap: 4, padding: 4, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                background: 'var(--card-bg)', color: 'var(--text-muted)', fontSize: 10,
                fontFamily: 'ui-monospace, Menlo, monospace',
                border: on ? '2px solid var(--text-primary)' : '1px solid var(--border)',
              }}>
              <span style={{ display: 'flex', height: 22, borderRadius: 4, overflow: 'hidden' }}>
                {p.colors.map(c => <span key={c} style={{ flex: 1, background: c }} />)}
              </span>
              {p.id}
            </button>
          );
        })}
      </div>

      {palette && roles && derived && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{palette.id}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{derived.mode === 'dark' ? 'dark page' : 'light page'}</span>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn-secondary" style={{ fontSize: 12 }}
              onClick={() => { setSeen(new Set()); apply(palette, lower(palette.start)); }}>Start arrangement</button>
            <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={shuffle}>Shuffle</button>
          </div>

          {ROLE_KEYS.map(role => (
            <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 64, fontSize: 12, color: 'var(--text-muted)' }}>{ROLE_LABEL[role]}</span>
              {palette.colors.map(c => {
                const lc = c.toLowerCase();
                const on = roles[role] === lc;
                return (
                  <button key={c} type="button" onClick={() => swap(role, lc)} aria-pressed={on}
                    title={on ? `${ROLE_LABEL[role]} uses ${c}` : `Use ${c} for ${ROLE_LABEL[role]}`}
                    style={{
                      width: 32, height: 24, borderRadius: 5, background: c, cursor: on ? 'default' : 'pointer',
                      border: on ? '2px solid var(--text-primary)' : '1px solid var(--border)',
                      outline: on ? '2px solid var(--card-bg)' : 'none', outlineOffset: -4,
                    }} />
                );
              })}
              <span style={{ fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--text-muted)' }}>{roles[role].toUpperCase()}</span>
            </div>
          ))}

          {derived.notes.map(n => (
            <p key={n.msg} style={{
              margin: 0, fontSize: 12, color: 'var(--text-primary)', padding: '4px 10px', borderRadius: 6,
              background: 'color-mix(in srgb, var(--yellow) 18%, transparent)', borderLeft: '3px solid var(--yellow)',
            }}>{n.msg}</p>
          ))}
        </div>
      )}
    </div>
  );
}
