'use client';
import { FONT_TOKENS, SAME_AS_BODY, fontChoicesFor, googleFontsHref } from '@/lib/theme/fonts';

// One row of visible buttons per font token (no dropdowns), each set in its own font. Picking a web
// font loads its stylesheet now so the preview is real; Save decides what reaches the DB.

const LABEL: Record<string, string> = {
  '--font-family-base': 'Body',
  '--font-family-heading': 'Headings',
  '--font-family-mono': 'Code',
};

function ensureLoaded(stack: string) {
  const href = googleFontsHref([stack]);
  if (!href || document.querySelector(`link[data-theme-font="${CSS.escape(href)}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.themeFont = href;
  document.head.appendChild(link);
}

export default function FontChoices({ name, value, defaultValue, onChange }: {
  name: string; value: string; defaultValue: string; onChange: (name: string, value: string) => void;
}) {
  const options = [
    ...(FONT_TOKENS[name]?.extra ?? []).map(v => ({ id: v, label: v === SAME_AS_BODY ? 'Same as body' : v, stack: v })),
    ...fontChoicesFor(name),
  ];
  const sample = FONT_TOKENS[name]?.kind === 'mono' ? 'const x = 42;' : 'Aa 字體 Sample';
  const changed = value !== defaultValue;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{LABEL[name] ?? name}</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-family-mono)', color: 'var(--text-muted)' }}>{name}</span>
        {changed && (
          <button type="button" onClick={() => onChange(name, defaultValue)} title="Reset to default"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: 0 }}>↺</button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(o => {
          const on = value === o.stack;
          // "Same as body" previews in whatever the body font currently is
          const face = o.stack === SAME_AS_BODY ? 'var(--font-family-base)' : o.stack;
          return (
            <button key={o.id} type="button" aria-pressed={on}
              onClick={() => { ensureLoaded(o.stack); onChange(name, o.stack); }}
              onMouseEnter={() => ensureLoaded(o.stack)}
              style={{
                display: 'grid', gap: 2, textAlign: 'left', padding: '6px 10px', cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', background: on ? 'var(--bg-hover)' : 'var(--card-bg)',
                color: 'var(--text-primary)', border: on ? '2px solid var(--text-primary)' : '1px solid var(--border)',
              }}>
              <span style={{ fontFamily: face, fontSize: 15 }}>{sample}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
