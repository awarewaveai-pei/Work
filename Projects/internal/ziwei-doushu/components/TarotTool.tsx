'use client';

import { useState } from 'react';
import AiReading from '@/components/AiReading';
import {
  drawDaily,
  drawSpread,
  SPREADS,
  SPREAD_GROUPS,
  TOPICS,
  type TarotResult,
  type SpreadId,
  type TarotTopic,
} from '@/lib/tarot';
import { toContext } from '@/lib/divination/systems/tarot';
import { computeTarotRelations, describeRelations } from '@/lib/tarotRelations';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

const TOPIC_IDS = Object.keys(TOPICS) as TarotTopic[];

export default function TarotTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const [spread, setSpread] = useState<SpreadId>('three');
  const [topic, setTopic] = useState<TarotTopic>('general');
  const [result, setResult] = useState<TarotResult | null>(null);
  const t = dict.tarot;
  const relationLines = result
    ? describeRelations(computeTarotRelations(result.cards), result.cards, locale)
    : [];
  const positions = result ? SPREADS[result.spread].positions[locale] : [];

  return (
    <>
      <div className="glass-card p-6" style={{ display: 'grid', gap: '1rem' }}>
        <div>
          <span className="label-dark" style={{ display: 'block', marginBottom: '0.5rem' }}>
            {t.spread}
          </span>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {SPREAD_GROUPS.map((g) => (
              <div key={g.id}>
                <div style={{ fontSize: '0.75rem', color: 'var(--gold-400)', marginBottom: '0.35rem' }}>
                  {g.name[locale]}
                </div>
                <div role="group" aria-label={g.name[locale]} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {g.spreads.map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      aria-pressed={spread === sp.id}
                      onClick={() => setSpread(sp.id)}
                      className={spread === sp.id ? 'btn-gold' : 'btn-violet'}
                      style={{ width: 'auto' }}
                    >
                      {sp.name[locale]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className="label-dark" style={{ display: 'block', marginBottom: '0.5rem' }}>
            {t.topic}
          </span>
          <div role="group" aria-label={t.topic} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {TOPIC_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={topic === id}
                onClick={() => setTopic(id)}
                className={topic === id ? 'btn-gold' : 'btn-violet'}
                style={{ width: 'auto' }}
              >
                {TOPICS[id][locale]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => setResult(drawSpread(spread))} className="btn-gold" style={{ width: 'auto' }}>
            {t.draw}
          </button>
          <button onClick={() => setResult(drawDaily())} className="btn-violet" style={{ width: 'auto' }}>
            {t.daily}
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{t.dailyHint}</span>
        </div>
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

          {relationLines.length ? (
            <div className="glass-card p-6 mt-8">
              <h3 className="label-dark" style={{ marginBottom: '0.5rem' }}>
                {t.relations}
              </h3>
              <ul style={{ display: 'grid', gap: '0.4rem', fontSize: '0.875rem', color: 'var(--text-heading)' }}>
                {relationLines.map((l) => (
                  <li key={l.key}>{l.text}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <AiReading context={toContext(result, locale, topic)} ai={dict.ai} />
        </section>
      ) : null}
    </>
  );
}
