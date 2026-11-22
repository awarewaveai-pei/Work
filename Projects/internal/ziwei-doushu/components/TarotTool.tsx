'use client';

import { useState } from 'react';
import AiReading from '@/components/AiReading';
import TarotCardView from '@/components/TarotCardView';
import {
  drawDaily,
  drawFollowUp,
  MAX_EXTRA_CARDS,
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
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [drawId, setDrawId] = useState(0);
  // 每次抽牌:新牌一律先蓋著,並換 key 讓每張牌的圖檔載入狀態重置
  const show = (r: TarotResult) => {
    setResult(r);
    setRevealed(r.cards.map(() => false));
    setDrawId((n) => n + 1);
  };
  const t = dict.tarot;
  const relationLines = result
    ? describeRelations(computeTarotRelations(result.cards), result.cards, locale)
    : [];
  const positions = result ? SPREADS[result.spread].positions[locale] : [];
  const extra = result?.extra ?? [];
  const mainCount = result?.cards.length ?? 0;
  const flip = (i: number) => setRevealed((r) => r.map((v, j) => (j === i ? !v : v)));
  const followUp = (count: number) => {
    if (!result) return;
    const next = drawFollowUp(result, count);
    setResult(next);
    setRevealed((r) => [...r, ...Array.from({ length: count }, () => false)]);
  };

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
          <button onClick={() => show(drawSpread(spread))} className="btn-gold" style={{ width: 'auto' }}>
            {t.draw}
          </button>
          <button onClick={() => show(drawDaily())} className="btn-violet" style={{ width: 'auto' }}>
            {t.daily}
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{t.dailyHint}</span>
        </div>
      </div>

      {result ? (
        <section data-aw-result className="mt-8">
          <hr className="star-divider" />
          <button
            type="button"
            className="btn-violet"
            style={{ width: 'auto', marginBottom: '0.75rem' }}
            onClick={() => setRevealed(revealed.map(() => true))}
            disabled={revealed.every(Boolean)}
          >
            {t.flipAll}
          </button>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {result.cards.map((d, i) => (
              <TarotCardView
                key={`${drawId}-${i}`}
                drawn={d}
                position={positions[i] ?? `#${i + 1}`}
                revealed={revealed[i] ?? false}
                onToggle={() => flip(i)}
                locale={locale}
                labels={t}
              />
            ))}
          </div>

          <div className="glass-card p-6 mt-8" style={{ display: 'grid', gap: '0.75rem' }}>
            <span className="label-dark">{t.followUp}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{t.followUpHint}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="btn-violet"
                  style={{ width: 'auto' }}
                  disabled={extra.length + n > MAX_EXTRA_CARDS}
                  onClick={() => followUp(n)}
                >
                  {t.followUpDraw.replace('{n}', String(n))}
                </button>
              ))}
            </div>
            {extra.length ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                {extra.map((d, i) => (
                  <TarotCardView
                    key={`${drawId}-x${i}`}
                    drawn={d}
                    position={t.followUpCard.replace('{n}', String(i + 1))}
                    revealed={revealed[mainCount + i] ?? false}
                    onToggle={() => flip(mainCount + i)}
                    locale={locale}
                    labels={t}
                  />
                ))}
              </div>
            ) : null}
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
