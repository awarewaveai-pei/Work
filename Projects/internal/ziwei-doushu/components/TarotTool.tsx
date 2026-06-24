'use client';

import { useState } from 'react';
import { drawSpread, type TarotResult, type SpreadId } from '@/lib/tarot';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

export default function TarotTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const [spread, setSpread] = useState<SpreadId>('three');
  const [result, setResult] = useState<TarotResult | null>(null);
  const t = dict.tarot;

  return (
    <>
      <div className="glass-card p-6">
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <span className="label-dark" style={{ display: 'block', marginBottom: '0.5rem' }}>
            {t.spread}
          </span>
          <select
            value={spread}
            onChange={(e) => setSpread(e.target.value as SpreadId)}
            className="field-dark"
            style={{ maxWidth: '280px' }}
          >
            <option value="single">{t.single}</option>
            <option value="three">{t.three}</option>
            <option value="celtic">{t.celtic}</option>
          </select>
        </label>
        <button
          onClick={() => setResult(drawSpread(spread))}
          className="btn-gold"
        >
          {t.draw}
        </button>
      </div>

      {result ? (
        <section className="mt-8">
          <hr className="star-divider" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {result.cards.map((d, i) => (
              <div
                key={i}
                className={`tarot-card ${d.reversed ? 'reversed' : 'upright'}`}
              >
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                  {i + 1}
                </div>
                <div
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--text-heading)',
                    marginBottom: '0.5rem',
                    fontFamily: "var(--font-noto-serif-tc), 'PingFang TC', serif",
                  }}
                >
                  {d.card.name[locale]}
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: d.reversed ? 'var(--rose-400)' : 'var(--jade-400)',
                  }}
                >
                  {d.reversed ? t.reversed : t.upright}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
