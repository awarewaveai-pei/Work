'use client';

import { useState } from 'react';
import AiReading from '@/components/AiReading';
import { drawQian, QIAN_GRADES, QIAN_TOPICS, type QianLot, type QianTopic } from '@/lib/qian';
import { toContext } from '@/lib/divination/systems/qian';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

const TOPIC_IDS = Object.keys(QIAN_TOPICS) as QianTopic[];
const SERIF = "var(--font-noto-serif-tc), 'PingFang TC', serif";

export default function QianTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const [topic, setTopic] = useState<QianTopic>('general');
  const [lot, setLot] = useState<QianLot | null>(null);
  const t = dict.qian;

  return (
    <>
      <div className="glass-card p-6" style={{ display: 'grid', gap: '1rem' }}>
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
                {QIAN_TOPICS[id][locale]}
              </button>
            ))}
          </div>
        </div>

        <p style={{ color: 'var(--text-caption)', fontSize: '0.875rem' }}>{t.hint}</p>

        <button onClick={() => setLot(drawQian())} className="btn-gold" style={{ justifySelf: 'start' }}>
          {t.draw}
        </button>
      </div>

      {lot ? (
        <section className="mt-8">
          <hr className="star-divider" />
          <div className="glass-card p-6" style={{ display: 'grid', gap: '1rem', justifyItems: 'center' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--gold-400)', letterSpacing: '0.08em' }}>
              {t.lotNo.replace('{n}', String(lot.no))} · {QIAN_GRADES[lot.grade][locale]}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-heading)' }}>
              <span className="label-dark" style={{ marginRight: '0.5rem' }}>{t.lotTitle}</span>
              {lot.title}
            </div>
            <div
              lang="zh-Hant"
              style={{
                fontFamily: SERIF,
                fontSize: '1.125rem',
                lineHeight: 2,
                color: 'var(--text-heading)',
                textAlign: 'center',
                letterSpacing: '0.12em',
              }}
            >
              {lot.poem.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
            {locale === 'en' ? (
              <p style={{ color: 'var(--text-caption)', fontSize: '0.75rem' }}>{t.poemNote}</p>
            ) : null}
          </div>

          <AiReading context={toContext(lot, locale, topic)} ai={dict.ai} />
        </section>
      ) : null}
    </>
  );
}
