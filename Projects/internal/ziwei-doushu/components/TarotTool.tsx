'use client';

import { useState } from 'react';
import AiReading from '@/components/AiReading';
import {
  drawSpread,
  SPREADS,
  TOPICS,
  type TarotResult,
  type SpreadId,
  type TarotTopic,
} from '@/lib/tarot';
import { toContext } from '@/lib/divination/systems/tarot';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

const SPREAD_IDS = Object.keys(SPREADS) as SpreadId[];
const TOPIC_IDS = Object.keys(TOPICS) as TarotTopic[];

export default function TarotTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const [spread, setSpread] = useState<SpreadId>('three');
  const [topic, setTopic] = useState<TarotTopic>('general');
  const [result, setResult] = useState<TarotResult | null>(null);
  const t = dict.tarot;
  const positions = result ? SPREADS[result.spread].positions[locale] : [];

  return (
    <>
      <div className="glass-card p-6" style={{ display: 'grid', gap: '1rem' }}>
        <label style={{ display: 'block' }}>
          <span className="label-dark" style={{ display: 'block', marginBottom: '0.5rem' }}>
            {t.spread}
          </span>
          <select
            value={spread}
            onChange={(e) => setSpread(e.target.value as SpreadId)}
            className="field-dark"
            style={{ maxWidth: '320px' }}
          >
            {SPREAD_IDS.map((id) => (
              <option key={id} value={id}>
                {SPREADS[id].name[locale]}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block' }}>
          <span className="label-dark" style={{ display: 'block', marginBottom: '0.5rem' }}>
            {t.topic}
          </span>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value as TarotTopic)}
            className="field-dark"
            style={{ maxWidth: '320px' }}
          >
            {TOPIC_IDS.map((id) => (
              <option key={id} value={id}>
                {TOPICS[id][locale]}
              </option>
            ))}
          </select>
        </label>

        <button onClick={() => setResult(drawSpread(spread))} className="btn-gold" style={{ justifySelf: 'start' }}>
          {t.draw}
        </button>
      </div>

      {result ? (
        <section className="mt-8">
          <hr className="star-divider" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {result.cards.map((d, i) => (
              <div key={i} className={`tarot-card ${d.reversed ? 'reversed' : 'upright'}`}>
                <div style={{ fontSize: '0.65rem', color: 'var(--gold-400)', marginBottom: '0.4rem', minHeight: '1.6em' }}>
                  {positions[i] ?? `#${i + 1}`}
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

          <AiReading context={toContext(result, locale, topic)} ai={dict.ai} />
        </section>
      ) : null}
    </>
  );
}
